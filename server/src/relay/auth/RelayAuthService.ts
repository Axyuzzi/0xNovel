import type {
  RelayLoginRequest,
  RelayRegisterRequest,
  RelaySession,
  RelayUserSummary,
} from "@0xnovelagent/shared/types/relay";
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
  const normalized = key.trim();
  if (!normalized) {
    throw new RelayHttpError(
      "创作服务没有返回可用的登录凭证，请联系服务支持。",
      502,
    );
  }
  return normalized;
}

function buildUserSummary(loginData: Record<string, unknown>): RelayUserSummary {
  const username = readString(loginData, ["username", "display_name", "displayName"]) || "创作者";
  const displayName = readString(loginData, ["display_name", "displayName"]) || username;
  return {
    id: String(loginData.id ?? "unknown"),
    username,
    displayName,
  };
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
    const registerResponse = await this.client.request({
      path: resolveRelayEndpointPaths().register,
      method: "POST",
      body: {
        username: input.username,
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
      body: input,
    });
    const loginData = readRelayEnvelopeData(loginResponse.body);
    const loginDataRecord = readRecord(loginData) ?? {};
    const user = buildUserSummary(loginDataRecord);
    const cookie = extractSessionCookie(loginResponse.setCookie);

    // 用 session cookie 创建一个 API token 并取回明文 key。
    const apiKey = await this.provisionApiKey(user.id, cookie);
    return this.restore({ token: assertUsableKey(apiKey), user });
  }

  async restore(snapshot: RelayCredentialSnapshot): Promise<RelaySession> {
    const token = assertUsableKey(snapshot.token);
    const balance = await this.usageService.getBalance(token);
    relayCredentialStore.setAuthenticatedSession({ token, user: snapshot.user });
    return {
      status: "authenticated",
      user: snapshot.user,
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
    const listData = readRecord(readRelayEnvelopeData(listResponse.body));
    const items = Array.isArray(listData?.items) ? listData.items : [];
    let tokenId: string | null = null;
    if (items.length > 0) {
      const first = readRecord(items[0]);
      tokenId = first ? String(first.id) : null;
    }

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
      const refreshData = readRecord(readRelayEnvelopeData(refreshResponse.body));
      const refreshItems = Array.isArray(refreshData?.items) ? refreshData.items : [];
      const first = refreshItems.length > 0 ? readRecord(refreshItems[0]) : null;
      tokenId = first ? String(first.id) : null;
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
    const apiKey = readString(keyRecord, ["key", "token", "apiKey", "api_key"]);
    if (!apiKey) {
      throw new RelayHttpError("创作服务没有返回可用的登录凭证，请联系服务支持。", 502);
    }
    return apiKey;
  }
}

export const relayAuthService = new RelayAuthService();
