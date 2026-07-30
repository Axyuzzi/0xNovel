const MAX_DESKTOP_LOG_TEXT_LENGTH = 2_000;
const SENSITIVE_KEY_PATTERN =
  /("(?:authorization|cookie|set-cookie|password|confirmPassword|token|accessToken|refreshToken|apiKey|secret|codeUrl)"\s*:\s*")([^"]*)(")/giu;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(authorization|cookie|password|token|access_token|refresh_token|api_key|secret|code_url)=([^\s&]+)/giu;
const BEARER_PATTERN = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/giu;
const SK_TOKEN_PATTERN = /\bsk-[A-Za-z0-9._~+/=-]{6,}\b/gu;

export function redactDesktopLogMessage(message: string): string {
  const redacted = message
    .replace(SENSITIVE_KEY_PATTERN, "$1[REDACTED]$3")
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, "$1=[REDACTED]")
    .replace(BEARER_PATTERN, "$1 [REDACTED]")
    .replace(SK_TOKEN_PATTERN, "sk-[REDACTED]");
  if (redacted.length <= MAX_DESKTOP_LOG_TEXT_LENGTH) {
    return redacted;
  }
  return `${redacted.slice(0, MAX_DESKTOP_LOG_TEXT_LENGTH)}…[TRUNCATED]`;
}
