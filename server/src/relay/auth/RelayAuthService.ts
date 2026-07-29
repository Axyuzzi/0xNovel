import type {
  RelayLoginRequest,
  RelayRegisterRequest,
  RelaySession,
  RelayUserSummary,
} from "@0xnovelagent/shared/types/relay";
import { normalizeRelayApiKey } from "@0xnovelagent/shared/types/relay";
import {
  RelayHttpClient,
  RelayHttpError,
  readRelayEnvelopeData,
} from "../client/RelayHttpClient";
import { resolveRelayEndpointPaths } from "../config/relayConfig";
import { relayUsageService, RelayUsageService } from "../usage/RelayUsageService";
import {
  relayCredentialStore,
  type RelayCredentialSnapshot,
} from "./RelayCredentialStore";

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function readNumber(record: Record<string, unknown> | null, keys: string[]): number | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function readString(record: Record<string, unknown> | null, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function extractSessionCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  return setCookie
    .split(",")
    .map((entry) => entry.trim().split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

function assertUsableKey(key: string): string {
  try {
    return normalizeRelayApiKey(key);
  } catch (error) {
    throw new RelayHttpError(
      "创作服务没有返回可用的登录凭证，请联系服务支持。",
      502,
      { cause: error },
    );
  }
}

function buildUserSummary(
  loginData: Record<string, unknown>,
  fallbackUsername: string,
): RelayUserSummary {
  const rawId = loginData.id;
  const id = typeof rawId === "number" || typeof rawId === "string"
    ? String(rawId).trim()
    : "";
  if (!id) {
    throw new RelayHttpError("创作服务登录没有返回有效用户编号，请重试。", 502);
  }
  const username = readString(loginData, ["username", "display_name", "displayName"])
    || fallbackUsername;
  const displayName = readString(loginData, ["display_name", "displayName"]) || username;
  return {
    id,
    username,
    displayName,
  };
}

/**
 * 本客户端在中转站的注册用户名前缀。用户在前端只填「张三」，
 * 发往中转注册/登录时统一带上前缀变成「0xn_张三」，方便中转后台区分来源。
 * 用户全程感知不到前缀；如果用户自己填的名字已带前缀，不再重复添加。
 */
const RELAY_USERNAME_PREFIX = "0xn_";

function toRelayUsername(rawUsername: string): string {
  const trimmed = rawUsername.trim();
  return trimmed.startsWith(RELAY_USERNAME_PREFIX) ? trimmed : `${RELAY_USERNAME_PREFIX}${trimmed}`;
}

export class RelayAuthService {
  constructor(
    private readonly client = new RelayHttpClient(),
    private readonly usageService: RelayUsageService = relayUsageService,
  ) {}

  async register(input: RelayRegisterRequest): Promise<RelaySession> {
    // 中转站（new-api 风格）的注册不直接返回可用 key。完整流程：
    // 注册 → 登录（拿 session cookie + userId）→ 创建 token → 取 token 明文 key。
    // 拿到明文 key 后用余额接口验证归属，再建立本地会话。
    // 用户名统一带项目前缀，方便中转后台区分来源。
    const relayUsername = toRelayUsername(input.username);
    const registerResponse = await this.client.request({
      path: resolveRelayEndpointPaths().register,
      method: "POST",
      body: {
        username: relayUsername,
        password: input.password,
        ...(input.email ? { email: input.email } : {}),
        ...(input.verificationCode ? { verification_code: input.verificationCode } : {}),
      },
    });
    readRelayEnvelopeData(registerResponse.body);

    // 注册成功后立即登录，建立 session 并换取可用 key。
    return this.login({
      username: input.username,
      password: input.password,
    });
  }

  async login(input: RelayLoginRequest): Promise<RelaySession> {
    const loginResponse = await this.client.request({
      path: resolveRelayEndpointPaths().login,
      method: "POST",
      body: { ...input, username: toRelayUsername(input.username) },
    });
    const loginData = readRelayEnvelopeData(loginResponse.body);
    const loginDataRecord = readRecord(loginData) ?? {};
    const user = buildUserSummary(loginDataRecord, toRelayUsername(input.username));
    const cookie = extractSessionCookie(loginResponse.setCookie);

    // 用 session cookie 创建一个 API token 并取回明文 key。
    const apiKey = await this.provisionApiKey(user.id, cookie);
    return this.restore({ token: assertUsableKey(apiKey), user });
  }

  async restore(snapshot: RelayCredentialSnapshot): Promise<RelaySession> {
    const token = assertUsableKey(snapshot.token);
    const balance = await this.usageService.getBalance(token);
    const suppliedUser = snapshot.user;
    const user: RelayUserSummary = {
      id: balance.userId,
      username: balance.username,
      displayName: suppliedUser?.id === balance.userId && suppliedUser.displayName.trim()
        ? suppliedUser.displayName.trim()
        : balance.username,
    };
    relayCredentialStore.setAuthenticatedSession({ token, user });
    return {
      status: "authenticated",
      user,
      balance,
    };
  }

  async getSession(): Promise<RelaySession> {
    const snapshot = relayCredentialStore.getSnapshotForCredentialBroker();
    if (!snapshot) {
      return { status: "anonymous" };
    }
    return this.restore(snapshot);
  }

  logout(): RelaySession {
    relayCredentialStore.clear();
    return { status: "anonymous" };
  }

  /**
   * 用登录后的 session cookie 创建一个 API token，并取回它的明文 key。
   * 中转站的 token 列表只返回掩码 key（如 xOyg****ns8L），
   * 需要单独调 POST /api/token/{id}/key 才能拿到明文。
   * 如果用户已有 token，复用第一个；否则新建一个。
   */
  private async provisionApiKey(userId: string, cookie: string): Promise<string> {
    if (!cookie) {
      throw new RelayHttpError("创作服务登录没有返回有效会话，请重试。", 502);
    }
    const sessionHeaders: Record<string, string> = {
      "New-Api-User": userId,
    };

    // 查现有 token，复用第一个
    const listResponse = await this.client.request({
      path: resolveRelayEndpointPaths().apiTokenList,
      method: "GET",
      cookie,
      extraHeaders: sessionHeaders,
    });
    const items = this.readTokenItems(readRelayEnvelopeData(listResponse.body));
    let tokenId = this.selectProductTokenId(items);

    // 没有就创建一个
    if (!tokenId) {
      const createResponse = await this.client.request({
        path: resolveRelayEndpointPaths().apiTokenCreate,
        method: "POST",
        body: { name: "0xNovelAgent" },
        cookie,
        extraHeaders: sessionHeaders,
      });
      readRelayEnvelopeData(createResponse.body);
      // 创建后重新查列表拿 id
      const refreshResponse = await this.client.request({
        path: resolveRelayEndpointPaths().apiTokenList,
        method: "GET",
        cookie,
        extraHeaders: sessionHeaders,
      });
      const refreshItems = this.readTokenItems(readRelayEnvelopeData(refreshResponse.body));
      tokenId = this.selectProductTokenId(refreshItems);
    }

    if (!tokenId) {
      throw new RelayHttpError("创作服务没有创建可用的访问凭证，请重试。", 502);
    }

    // 取明文 key
    const keyResponse = await this.client.request({
      path: resolveRelayEndpointPaths().apiTokenKey(tokenId),
      method: "POST",
      body: {},
      cookie,
      extraHeaders: sessionHeaders,
    });
    const keyData = readRelayEnvelopeData(keyResponse.body);
    const keyRecord = readRecord(keyData);
    const apiKey = typeof keyData === "string"
      ? keyData.trim()
      : readString(keyRecord, ["key", "token", "apiKey", "api_key"]);
    if (!apiKey) {
      throw new RelayHttpError("创作服务没有返回可用的登录凭证，请联系服务支持。", 502);
    }
    return assertUsableKey(apiKey);
  }

  private readTokenItems(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const record = readRecord(value);
    if (Array.isArray(record?.items)) return record.items;
    if (Array.isArray(record?.data)) return record.data;
    return [];
  }

  private selectProductTokenId(items: unknown[]): string | null {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const candidates = items
      .map(readRecord)
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .filter((item) => readString(item, ["name"]) === "0xNovelAgent")
      .filter((item) => {
        const enabled = item.enabled;
        if (typeof enabled === "boolean" && !enabled) return false;

        const status = item.status;
        if (
          status !== undefined
          && status !== 1
          && status !== "1"
          && status !== "enabled"
          && status !== "active"
        ) {
          return false;
        }

        const expiresAt = readNumber(item, ["expired_time", "expires_at", "expiresAt"]);
        return expiresAt === null || expiresAt <= 0 || expiresAt > nowSeconds;
      })
      .filter((item) => item.id !== undefined && String(item.id).trim())
      .sort((left, right) => {
        const leftId = Number(left.id);
        const rightId = Number(right.id);
        return Number.isFinite(leftId) && Number.isFinite(rightId) ? rightId - leftId : 0;
      });
    return candidates.length > 0 ? String(candidates[0].id) : null;
  }
}

export const relayAuthService = new RelayAuthService();
