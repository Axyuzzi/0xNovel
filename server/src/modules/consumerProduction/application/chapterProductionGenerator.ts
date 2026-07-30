import type { BaseMessageChunk } from "@langchain/core/messages";
import type { ConsumerChapterWritingTask } from "@0xnovelagent/shared/types/consumerChapterProduction";
import type { LlmTokenUsageSnapshot } from "../../../llm/usageTracking";
import { runStructuredPrompt, streamTextPrompt } from "../../../prompting/core/promptRunner";
import {
  consumerChapterContinuePrompt,
  consumerChapterWritePrompt,
  consumerNextChapterTaskPrompt,
  type ConsumerChapterProductionPromptInput,
} from "../../../prompting/prompts/consumer/consumerChapterProduction.prompts";

export interface ConsumerChapterProductionGenerator {
  createTask(
    input: ConsumerChapterProductionPromptInput,
    operationId: string,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<ConsumerChapterWritingTask>;
  writeChapter(
    input: ConsumerChapterProductionPromptInput,
    operationId: string,
    onDelta: (delta: string) => Promise<void>,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<string>;
  continueChapter(
    input: ConsumerChapterProductionPromptInput,
    operationId: string,
    onDelta: (delta: string) => Promise<void>,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<string>;
}

function chunkText(chunk: BaseMessageChunk): string {
  const content = chunk.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((item) => (
    typeof item === "string"
      ? item
      : item && typeof item === "object" && "text" in item && typeof item.text === "string"
        ? item.text
        : ""
  )).join("");
}

function promptOptions(input: ConsumerChapterProductionPromptInput, operationId: string, stage: string) {
  return {
    novelId: input.novelId,
    taskId: operationId,
    chapterId: input.targetChapterId,
    stage,
    entrypoint: "consumer_chapter_production",
    timeoutMs: 180_000,
  };
}

export class PromptConsumerChapterProductionGenerator
implements ConsumerChapterProductionGenerator {
  async createTask(
    input: ConsumerChapterProductionPromptInput,
    operationId: string,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<ConsumerChapterWritingTask> {
    const result = await runStructuredPrompt({
      asset: consumerNextChapterTaskPrompt,
      promptInput: input,
      options: promptOptions(input, operationId, "preparing_task"),
    });
    if (result.meta.tokenUsage) {
      await onUsage?.(result.meta.tokenUsage);
    }
    return result.output;
  }

  async writeChapter(
    input: ConsumerChapterProductionPromptInput,
    operationId: string,
    onDelta: (delta: string) => Promise<void>,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<string> {
    return this.consumeStream(
      await streamTextPrompt({
        asset: consumerChapterWritePrompt,
        promptInput: input,
        options: {
          ...promptOptions(input, operationId, "writing"),
          maxTokens: 6_000,
        },
      }),
      onDelta,
      onUsage,
    );
  }

  async continueChapter(
    input: ConsumerChapterProductionPromptInput,
    operationId: string,
    onDelta: (delta: string) => Promise<void>,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<string> {
    return this.consumeStream(
      await streamTextPrompt({
        asset: consumerChapterContinuePrompt,
        promptInput: input,
        options: {
          ...promptOptions(input, operationId, "continuing"),
          maxTokens: 6_000,
        },
      }),
      onDelta,
      onUsage,
    );
  }

  private async consumeStream(
    streamRun: Awaited<ReturnType<typeof streamTextPrompt<ConsumerChapterProductionPromptInput>>>,
    onDelta: (delta: string) => Promise<void>,
    onUsage?: (usage: LlmTokenUsageSnapshot) => Promise<void>,
  ): Promise<string> {
    for await (const chunk of streamRun.stream) {
      const delta = chunkText(chunk);
      if (delta) {
        await onDelta(delta);
      }
    }
    const completed = await streamRun.complete;
    if (completed.meta.tokenUsage) {
      await onUsage?.(completed.meta.tokenUsage);
    }
    return completed.output;
  }
}
