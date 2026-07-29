import { AppError } from "../../middleware/errorHandler";

const AUTHENTICATION_MARKERS = [
  "invalid token",
  "model_authentication",
  "authenticationerror",
  "authentication error",
  "status code: 401",
  "status=401",
];

export function toConsumerRelayErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallback;
  }

  const normalized = error.message.toLowerCase();
  if (AUTHENTICATION_MARKERS.some((marker) => normalized.includes(marker))) {
    return "创作凭证已失效，请退出账号后重新登录。";
  }
  if (normalized.includes("429") || normalized.includes("rate limit")) {
    return "创作服务当前较忙，请稍后再试。";
  }
  if (
    normalized.includes("timeout")
    || normalized.includes("network")
    || normalized.includes("fetch failed")
  ) {
    return "暂时无法连接创作服务，请检查网络后重试。";
  }
  return fallback;
}
