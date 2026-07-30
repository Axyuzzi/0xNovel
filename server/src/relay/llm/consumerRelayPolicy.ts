import type { LLMProvider } from "@0xnovelagent/shared/types/llm";
import type { ModelRouteRequestProtocol } from "@0xnovelagent/shared/types/novel";
import type { TaskType } from "../../llm/modelRouter";
import { relayCredentialStore } from "../auth/RelayCredentialStore";
import {
  resolveRelayBaseUrl,
  resolveRelayModelAlias,
  type ConsumerRelayModelRole,
} from "../config/relayConfig";

export interface ConsumerRelayPolicy {
  provider: LLMProvider;
  providerName: string;
  apiKey: string;
  baseURL: string;
  model: string;
  modelRole: ConsumerRelayModelRole;
  modelRoute: string;
  requestProtocol: ModelRouteRequestProtocol;
}

export interface ConsumerRelayRoutingInput {
  promptId?: string;
  taskType?: TaskType;
}

const PROMPT_MODEL_ROLES: Readonly<Record<string, ConsumerRelayModelRole>> = {
  "consumer.setup.story_direction": "writer",
  "consumer.setup.book_skeleton": "review",
  "consumer.setup.volume_plan": "planner",
  "consumer.setup.current_phase": "planner",
  "consumer.setup.first_chapter": "writer",
  "consumer.chapter.task": "planner",
  "consumer.chapter.write": "writer",
  "consumer.chapter.continue": "writer",
  "consumer.chapter.revise": "writer",
  "consumer.chapter.rewrite": "writer",
  "consumer.story.review": "review",
  "consumer.story.adjust": "planner",
  "consumer.story.transition": "planner",
};

export function resolveConsumerRelayModelRole(
  input: ConsumerRelayRoutingInput = {},
): ConsumerRelayModelRole {
  const promptRole = input.promptId ? PROMPT_MODEL_ROLES[input.promptId] : undefined;
  if (promptRole) {
    return promptRole;
  }
  if (
    input.taskType === "writer"
    || input.taskType === "chapter_drafting"
    || input.taskType === "chat"
  ) {
    return "writer";
  }
  if (
    input.taskType === "review"
    || input.taskType === "light_review"
    || input.taskType === "critical_review"
    || input.taskType === "chapter_review"
  ) {
    return "review";
  }
  return "planner";
}

export function resolveConsumerRelayPolicy(
  input: ConsumerRelayRoutingInput = {},
): ConsumerRelayPolicy {
  const modelRole = resolveConsumerRelayModelRole(input);
  return {
    provider: "relay",
    providerName: "0xNovelAgent 创作服务",
    apiKey: relayCredentialStore.requireTokenForServerRequest(),
    baseURL: resolveRelayBaseUrl(),
    model: resolveRelayModelAlias(modelRole),
    modelRole,
    modelRoute: `consumer:${modelRole}`,
    requestProtocol: "openai_compatible",
  };
}
