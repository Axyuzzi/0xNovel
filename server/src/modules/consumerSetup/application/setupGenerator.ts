import type {
  ConsumerBookSkeleton,
  ConsumerCurrentPhasePlan,
  ConsumerFirstChapterArtifact,
  ConsumerSetupArtifact,
  ConsumerSetupStep,
  ConsumerStoryDirection,
  ConsumerStoryDirectionsArtifact,
  ConsumerVolumePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import type { BaseMessageChunk } from "@langchain/core/messages";
import {
  runStructuredPrompt,
  streamStructuredPrompt,
} from "../../../prompting/core/promptRunner";
import {
  consumerBookSkeletonPrompt,
  consumerCurrentPhasePrompt,
  consumerFirstChapterPrompt,
  consumerStoryDirectionPrompt,
  consumerVolumePlanPrompt,
  type ConsumerSetupPromptInput,
} from "../../../prompting/prompts/consumer/consumerSetup.prompts";

export interface ConsumerSetupGenerationContext {
  novelId: string;
  operationId: string;
  idea: string;
  selectedDirection: ConsumerStoryDirection | null;
  bookSkeleton: ConsumerBookSkeleton | null;
  volumePlan: ConsumerVolumePlan | null;
  currentPhase: ConsumerCurrentPhasePlan | null;
}

export interface ConsumerSetupGenerationResult {
  artifact: ConsumerSetupArtifact;
  relayRequestId: string | null;
}

export interface ConsumerSetupGenerator {
  generate(
    step: Exclude<ConsumerSetupStep, "completed">,
    context: ConsumerSetupGenerationContext,
    onDelta?: (content: string) => void | Promise<void>,
  ): Promise<ConsumerSetupGenerationResult>;
}

function chunkText(content: BaseMessageChunk["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part) => {
    if (typeof part === "string") {
      return part;
    }
    return typeof part === "object"
      && part
      && "text" in part
      && typeof part.text === "string"
      ? part.text
      : "";
  }).join("");
}

function promptOptions(context: ConsumerSetupGenerationContext, step: string) {
  return {
    novelId: context.novelId,
    taskId: context.operationId,
    stage: step,
    entrypoint: "consumer_setup",
    timeoutMs: step === "first_chapter" ? 180_000 : 120_000,
  };
}

function promptInput(context: ConsumerSetupGenerationContext): ConsumerSetupPromptInput {
  return {
    idea: context.idea,
    selectedDirection: context.selectedDirection,
    bookSkeleton: context.bookSkeleton,
    volumePlan: context.volumePlan,
    currentPhase: context.currentPhase,
  };
}

export class PromptConsumerSetupGenerator implements ConsumerSetupGenerator {
  async generate(
    step: Exclude<ConsumerSetupStep, "completed">,
    context: ConsumerSetupGenerationContext,
    onDelta?: (content: string) => void | Promise<void>,
  ): Promise<ConsumerSetupGenerationResult> {
    const input = promptInput(context);
    switch (step) {
      case "story_direction": {
        const streamed = await streamStructuredPrompt({
          asset: consumerStoryDirectionPrompt,
          promptInput: input,
          options: promptOptions(context, step),
        });
        for await (const chunk of streamed.stream) {
          const content = chunkText(chunk.content);
          if (content) {
            await onDelta?.(content);
          }
        }
        const result = await streamed.complete;
        return this.result(result.output);
      }
      case "book_skeleton": {
        const result = await runStructuredPrompt({
          asset: consumerBookSkeletonPrompt,
          promptInput: input,
          options: promptOptions(context, step),
        });
        return this.result(result.output);
      }
      case "volume_plan": {
        const result = await runStructuredPrompt({
          asset: consumerVolumePlanPrompt,
          promptInput: input,
          options: promptOptions(context, step),
        });
        return this.result(result.output);
      }
      case "current_phase": {
        const result = await runStructuredPrompt({
          asset: consumerCurrentPhasePrompt,
          promptInput: input,
          options: promptOptions(context, step),
        });
        return this.result(result.output);
      }
      case "first_chapter": {
        const result = await runStructuredPrompt({
          asset: consumerFirstChapterPrompt,
          promptInput: input,
          options: {
            ...promptOptions(context, step),
            maxTokens: 6_000,
          },
        });
        return this.result(result.output);
      }
    }
  }

  private result(
    artifact:
      | ConsumerStoryDirectionsArtifact
      | ConsumerBookSkeleton
      | ConsumerVolumePlan
      | ConsumerCurrentPhasePlan
      | ConsumerFirstChapterArtifact,
  ): ConsumerSetupGenerationResult {
    return {
      artifact,
      relayRequestId: null,
    };
  }
}
