import type { BaseMessageChunk } from "@langchain/core/messages";
import type { ConsumerChapterRevisionMode } from "@0xnovelagent/shared/types/consumerChapterRevision";
import { streamTextPrompt } from "../../../prompting/core/promptRunner";
import {
  consumerChapterRevisePrompt,
  consumerChapterRewritePrompt,
  type ConsumerChapterRevisionPromptInput,
} from "../../../prompting/prompts/consumer/consumerChapterRevision.prompts";

export interface ConsumerChapterRevisionGenerator {
  generate(
    input: ConsumerChapterRevisionPromptInput,
    operationId: string,
    onDelta: (delta: string) => Promise<void>,
  ): Promise<string>;
}

function chunkText(chunk: BaseMessageChunk): string {
  const content = chunk.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((item) => (
    typeof item === "string"
      ? item
      : item && typeof item === "object" && "text" in item && typeof item.text === "string"
        ? item.text
        : ""
  )).join("");
}

function stage(mode: ConsumerChapterRevisionMode): string {
  return mode === "rewrite" ? "rewriting_chapter" : "revising_chapter";
}

export class PromptConsumerChapterRevisionGenerator
implements ConsumerChapterRevisionGenerator {
  async generate(
    input: ConsumerChapterRevisionPromptInput,
    operationId: string,
    onDelta: (delta: string) => Promise<void>,
  ): Promise<string> {
    const run = await streamTextPrompt({
      asset: input.mode === "rewrite"
        ? consumerChapterRewritePrompt
        : consumerChapterRevisePrompt,
      promptInput: input,
      options: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        taskId: operationId,
        stage: stage(input.mode),
        entrypoint: "consumer_chapter_revision",
        timeoutMs: 180_000,
        maxTokens: 12_000,
      },
    });
    for await (const chunk of run.stream) {
      const delta = chunkText(chunk);
      if (delta) await onDelta(delta);
    }
    return (await run.complete).output;
  }
}
