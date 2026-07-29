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
import { resolveRelayEndpointPaths, resolveRelayRegisterAuthCode } from "../config/relayConfig";
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

function extractTokenFromAuthResponse(body: unknown): string {
  const envelope = readRecord(body);
  const data = envelope?.data;
  if (typeof data === "string") {
    return data.trim();
  }
  const dataRecord = readRecord(data);
  const nestedUser = readRecord(dataRecord?.user);
  return readString(dataRecord, ["token", "apiKey", "api_key", "key", "accessToken", "access_token"])
    || readString(envelope, ["token", "apiKey", "api_key", "key", "accessToken", "access_token"])
    || readString(nestedUser, ["token", "apiKey", "api_key"]);
}

function extractSessionCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  return setCookie
    .split(",")
    .map((entry) => entry.trim().split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

function assertSkToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new RelayHttpError(
      "创作服务没有返回登录凭证，请联系服务支持。",
      502,
    );
  }
  if (!normalized.startsWith("sk-")) {
    throw new RelayHttpError(
      "创作服务返回的登录凭证格式不正确，请联系服务支持。",
      502,
    );
  }
  return normalized;
}

function createUserFromBalance(input: {
  userId: string;
  username: string;
}): RelayUserSummary {
  const username = input.username.trim();
  return {
    id: input.userId,
    username,
    displayName: username,
  };
}

export class RelayAuthService {
  constructor(
    private readonly client = new RelayHttpClient(),
    private readonly usageService: RelayUsageService = relayUsageService,
  ) {}

  register(input: RelayRegisterRequest): Promise<RelaySession> {
    const authCode = resolveRelayRegisterAuthCode();
    return this.authenticate(
      resolveRelayEndpointPaths().register,
      {
        username: input.username,
        password: input.password,
        ...(input.email ? { email: input.email } : {}),
        ...(input.verificationCode ? { verification_code: input.verificationCode } : {}),
      },
      authCode ? { Authorization: `Bearer ${authCode}` } : undefined,
    );
  }

  login(input: RelayLoginRequest): Promise<RelaySession> {
    return this.authenticate(resolveRelayEndpointPaths().login, input);
  }

  async restore(snapshot: RelayCredentialSnapshot): Promise<RelaySession> {
    const token = assertSkToken(snapshot.token);
    const balance = await this.usageService.getBalance(token);
    const user = createUserFromBalance(balance);
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

  private async authenticate(
    path: string,
    requestBody: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<RelaySession> {
    const response = await this.client.request({
      path,
      method: "POST",
      body: requestBody,
      extraHeaders,
    });
    readRelayEnvelopeData(response.body);

    let token = extractTokenFromAuthResponse(response.body);
    if (!token) {
      const cookie = extractSessionCookie(response.setCookie);
      if (cookie) {
        const tokenResponse = await this.client.request({
          path: resolveRelayEndpointPaths().sessionToken,
          cookie,
        });
        readRelayEnvelopeData(tokenResponse.body);
        token = extractTokenFromAuthResponse(tokenResponse.body);
      }
    }

    return this.restore({
      token: assertSkToken(token),
      user: {
        id: "pending",
        username: "pending",
        displayName: "pending",
      },
    });
  }
}

export const relayAuthService = new RelayAuthService();
