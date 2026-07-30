function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function assertAllowedRelayOrigin(parsed: URL): void {
  const allowedOrigins = (process.env.OXNOVEL_RELAY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const requiresAllowlist =
    process.env.NODE_ENV === "production"
    && process.env.AI_NOVEL_PRODUCT_MODE?.trim().toLowerCase() === "consumer";
  if (requiresAllowlist && allowedOrigins.length === 0) {
    throw new Error("创作服务安全策略未配置，已停止本次请求。");
  }
  if (allowedOrigins.length > 0 && !allowedOrigins.includes(parsed.origin)) {
    throw new Error("创作服务地址不在允许范围内，已停止本次请求。");
  }
}

function resolveSecureBaseUrl(environmentName: string, fallbackEnvironmentName?: string): string {
  const configured = process.env[environmentName]?.trim()
    || (fallbackEnvironmentName ? process.env[fallbackEnvironmentName]?.trim() : "");
  if (!configured) {
    throw new Error("创作服务暂不可用，请稍后重试。");
  }

  const parsed = new URL(configured);
  const isLoopbackDevelopmentUrl =
    process.env.NODE_ENV !== "production"
    && (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  if (parsed.protocol !== "https:" && !isLoopbackDevelopmentUrl) {
    throw new Error("创作服务连接不安全，已停止本次请求。");
  }
  assertAllowedRelayOrigin(parsed);

  return normalizeBaseUrl(parsed.toString());
}

export function resolveRelayBaseUrl(): string {
  return resolveSecureBaseUrl("OXNOVEL_RELAY_BASE_URL");
}

export function resolveRelayAccountBaseUrl(): string {
  return resolveSecureBaseUrl("OXNOVEL_RELAY_ACCOUNT_BASE_URL", "OXNOVEL_RELAY_BASE_URL");
}

export type ConsumerRelayModelRole = "planner" | "writer" | "review";

const CONSUMER_RELAY_MODEL_DEFAULTS: Record<ConsumerRelayModelRole, string> = {
  planner: "deepseek-v4-flash",
  writer: "qwen3.7-plus",
  review: "claude-sonnet-4-6",
};

const CONSUMER_RELAY_MODEL_ENV: Record<ConsumerRelayModelRole, string> = {
  planner: "OXNOVEL_RELAY_PLANNER_MODEL",
  writer: "OXNOVEL_RELAY_WRITER_MODEL",
  review: "OXNOVEL_RELAY_REVIEW_MODEL",
};

export function resolveRelayModelAlias(role: ConsumerRelayModelRole = "writer"): string {
  return process.env[CONSUMER_RELAY_MODEL_ENV[role]]?.trim()
    || process.env.OXNOVEL_RELAY_MODEL?.trim()
    || CONSUMER_RELAY_MODEL_DEFAULTS[role];
}

function resolveRelayPath(environmentName: string, fallback: string): string {
  const configured = process.env[environmentName]?.trim() || fallback;
  if (!configured.startsWith("/") || configured.startsWith("//")) {
    throw new Error(`中转接口路径配置无效：${environmentName}`);
  }
  return configured;
}

export interface RelayEndpointPaths {
  register: string;
  login: string;
  sessionToken: string;
  apiTokenList: string;
  apiTokenCreate: string;
  apiTokenKey: (tokenId: string) => string;
  balance: string;
  usageLogs: string;
  paymentInfo: string;
  wechatNativePayment: string;
  paymentOrder: (orderNo: string) => string;
}

export function resolveRelayEndpointPaths(): RelayEndpointPaths {
  const paymentOrderPrefix = resolveRelayPath(
    "OXNOVEL_RELAY_PAYMENT_ORDER_PATH",
    "/api/usage/payment/orders",
  );
  const apiTokenPrefix = resolveRelayPath("OXNOVEL_RELAY_API_TOKEN_PATH", "/api/token");
  return {
    register: resolveRelayPath("OXNOVEL_RELAY_REGISTER_PATH", "/api/user/register"),
    login: resolveRelayPath("OXNOVEL_RELAY_LOGIN_PATH", "/api/user/login"),
    sessionToken: resolveRelayPath("OXNOVEL_RELAY_SESSION_TOKEN_PATH", "/api/user/token"),
    apiTokenList: apiTokenPrefix,
    apiTokenCreate: apiTokenPrefix,
    apiTokenKey: (tokenId: string) => `${apiTokenPrefix}/${encodeURIComponent(tokenId)}/key`,
    balance: resolveRelayPath("OXNOVEL_RELAY_BALANCE_PATH", "/api/usage/balance"),
    usageLogs: resolveRelayPath("OXNOVEL_RELAY_USAGE_LOGS_PATH", "/api/usage/logs"),
    paymentInfo: resolveRelayPath("OXNOVEL_RELAY_PAYMENT_INFO_PATH", "/api/usage/payment/info"),
    wechatNativePayment: resolveRelayPath(
      "OXNOVEL_RELAY_WECHAT_NATIVE_PATH",
      "/api/usage/payment/wechat/native",
    ),
    paymentOrder: (orderNo: string) => `${paymentOrderPrefix}/${encodeURIComponent(orderNo)}`,
  };
}

export function resolveRelayRequestTimeoutMs(): number {
  const configured = Number(process.env.OXNOVEL_RELAY_TIMEOUT_MS ?? "");
  if (!Number.isFinite(configured) || configured < 1_000 || configured > 120_000) {
    return 30_000;
  }
  return Math.floor(configured);
}
