import type {
  ConsumerStoryReviewArtifact,
  ConsumerStoryReviewOperationKind,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  consumerStoryAdjustmentPrompt,
  consumerStoryReviewPrompt,
  consumerStoryTransitionPrompt,
  type ConsumerStoryReviewPromptInput,
} from "../../../prompting/prompts/consumer/consumerStoryReview.prompts";

export interface ConsumerStoryReviewGenerator {
  generate(
    input: ConsumerStoryReviewPromptInput,
    operationId: string,
  ): Promise<ConsumerStoryReviewArtifact>;
}

function promptFor(kind: ConsumerStoryReviewOperationKind) {
  if (kind === "review") return consumerStoryReviewPrompt;
  if (kind === "transition") return consumerStoryTransitionPrompt;
  return consumerStoryAdjustmentPrompt;
}

export class PromptConsumerStoryReviewGenerator
implements ConsumerStoryReviewGenerator {
  async generate(
    input: ConsumerStoryReviewPromptInput,
    operationId: string,
  ): Promise<ConsumerStoryReviewArtifact> {
    const result = await runStructuredPrompt({
      asset: promptFor(input.kind),
      promptInput: input,
      options: {
        novelId: input.novelId,
        taskId: operationId,
        stage: input.kind,
        entrypoint: "consumer_story_review",
        timeoutMs: 180_000,
        maxTokens: 8_000,
      },
    });
    return result.output;
  }
}
