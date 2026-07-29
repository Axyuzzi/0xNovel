export function isCanonicalRelayApiKey(value: unknown): value is string {
  return typeof value === "string"
    && value === value.trim()
    && value.length >= 7
    && value.length <= 512
    && value.startsWith("sk-");
}
