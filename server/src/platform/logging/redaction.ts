const MAX_LOG_TEXT_LENGTH = 2_000;
const SENSITIVE_KEY_PATTERN =
  /("(?:authorization|cookie|set-cookie|password|confirmPassword|token|accessToken|refreshToken|apiKey|secret|codeUrl)"\s*:\s*")([^"]*)(")/giu;
const SENSITIVE_QUERY_PATTERN =
  /([?&](?:authorization|cookie|password|token|access_token|refresh_token|api_key|secret|code_url)=)([^&#\s]*)/giu;
const BEARER_PATTERN = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/giu;
const SK_TOKEN_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{6,}\b/gu;

export function redactLogText(value: unknown): string {
  const source = typeof value === "string"
    ? value
    : value instanceof Error
      ? value.stack || value.message
      : String(value);
  const redacted = source
    .replace(SENSITIVE_KEY_PATTERN, "$1[REDACTED]$3")
    .replace(SENSITIVE_QUERY_PATTERN, "$1[REDACTED]")
    .replace(BEARER_PATTERN, "$1 [REDACTED]")
    .replace(SK_TOKEN_PATTERN, "sk-[REDACTED]");
  if (redacted.length <= MAX_LOG_TEXT_LENGTH) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_LOG_TEXT_LENGTH)}…[TRUNCATED]`;
}
