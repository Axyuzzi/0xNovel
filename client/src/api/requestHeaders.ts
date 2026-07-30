import { API_SESSION_TOKEN } from "@/lib/constants";

export const LOCAL_API_SESSION_HEADER = "x-0xnovel-local-session";

export function createApiSessionHeaderRecord(): Record<string, string> {
  return API_SESSION_TOKEN
    ? { [LOCAL_API_SESSION_HEADER]: API_SESSION_TOKEN }
    : {};
}

export function createApiRequestHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial);
  if (API_SESSION_TOKEN) {
    headers.set(LOCAL_API_SESSION_HEADER, API_SESSION_TOKEN);
  }
  return headers;
}
