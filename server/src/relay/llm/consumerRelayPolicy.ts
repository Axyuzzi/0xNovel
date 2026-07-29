import type { LLMProvider } from "@0xnovelagent/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@0xnovelagent/shared/types/novel";
import { relayCredentialStore } from "../auth/RelayCredentialStore";
import { resolveRelayBaseUrl, resolveRelayModelAlias } from "../config/relayConfig";

export interface ConsumerRelayPolicy {
  provider: LLMProvider;
  providerName: string;
  apiKey: string;
  baseURL: string;
  model: string;
  requestProtocol: ModelRouteRequestProtocol;
}

export function resolveConsumerRelayPolicy(): ConsumerRelayPolicy {
  return {
    provider: "relay",
    providerName: "0xNovelAgent 创作服务",
    apiKey: relayCredentialStore.requireTokenForServerRequest(),
    baseURL: resolveRelayBaseUrl(),
    model: resolveRelayModelAlias(),
    requestProtocol: "openai_compatible",
  };
}
