import {
  resolveRelayAccountBaseUrl,
  resolveRelayRequestTimeoutMs,
} from "../config/relayConfig";

export class RelayHttpError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 502, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RelayHttpError";
    this.statusCode = statusCode;
  }
}

export interface RelayHttpResponse {
  body: unknown;
  setCookie: string | null;
}

export interface RelayHttpRequest {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  bearerToken?: string;
  cookie?: string;
  query?: URLSearchParams;
  extraHeaders?: Record<string, string>;
}

export class RelayHttpClient {
  constructor(
    private readonly fetchImplementation: typeof fetch = fetch,
    private readonly baseUrlResolver: () => string = resolveRelayAccountBaseUrl,
  ) {}

  async request(input: RelayHttpRequest): Promise<RelayHttpResponse> {
    const url = new URL(`${this.baseUrlResolver()}${input.path}`);
    if (input.query) {
      url.search = input.query.toString();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), resolveRelayRequestTimeoutMs());
    try {
      const headers = new Headers({
        Accept: "application/json",
      });
      if (input.body !== undefined) {
        headers.set("Content-Type", "application/json");
      }
      if (input.bearerToken) {
        headers.set("Authorization", `Bearer ${input.bearerToken}`);
      }
      if (input.cookie) {
        headers.set("Cookie", input.cookie);
      }
      if (input.extraHeaders) {
        for (const [key, value] of Object.entries(input.extraHeaders)) {
          headers.set(key, value);
        }
      }

      const response = await this.fetchImplementation(url, {
        method: input.method ?? "GET",
        headers,
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      let body: unknown = null;
      if (rawBody.trim()) {
        try {
          body = JSON.parse(rawBody) as unknown;
        } catch (error) {
          throw new RelayHttpError("创作服务返回了无法识别的数据。", 502, { cause: error });
        }
      }

      if (!response.ok) {
        const statusCode = response.status === 401 || response.status === 403
          ? 401
          : response.status === 429
            ? 429
            : 502;
        throw new RelayHttpError(
          readRelayMessage(body) || "创作服务请求失败，请稍后重试。",
          statusCode,
        );
      }

      return {
        body,
        setCookie: response.headers.get("set-cookie"),
      };
    } catch (error) {
      if (error instanceof RelayHttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new RelayHttpError("创作服务响应超时，请稍后重试。", 504, { cause: error });
      }
      throw new RelayHttpError("暂时无法连接创作服务，请检查网络后重试。", 502, { cause: error });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function readRelayMessage(body: unknown): string {
  if (!body || typeof body !== "object") {
    return "";
  }
  const record = body as Record<string, unknown>;
  for (const key of ["message", "error"] as const) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function readRelayEnvelopeData(body: unknown): unknown {
  if (!body || typeof body !== "object") {
    throw new RelayHttpError("创作服务返回了无法识别的数据。");
  }
  const record = body as Record<string, unknown>;
  if (record.success !== true) {
    throw new RelayHttpError(readRelayMessage(body) || "创作服务未能完成请求。", 400);
  }
  return record.data;
}
