import { z } from "zod";
import { consumerCreditEstimateSchema } from "./consumerSetup.js";

const localIdSchema = z.string().trim().min(1).max(128);

const consumerChapterWritingTaskLegacySchema = z.object({
  title: z.string().trim().min(1).max(120),
  startState: z.string().trim().min(1).max(800),
  goal: z.string().trim().min(1).max(800),
  mustHappen: z.array(z.string().trim().min(1).max(500)).min(1).max(12),
  characters: z.array(z.string().trim().min(1).max(120)).max(12),
  carryOver: z.string().trim().min(1).max(800),
  mustNotHappen: z.array(z.string().trim().min(1).max(500)).max(12),
  endState: z.string().trim().min(1).max(800),
  endingHook: z.string().trim().min(1).max(500),
  suggestedWords: z.number().int().min(500).max(20_000),
});

export const consumerChapterWritingTaskSchema = consumerChapterWritingTaskLegacySchema.extend({
  openingBeat: z.string().trim().min(1).max(500),
  endingBeat: z.string().trim().min(1).max(500),
  readerInference: z.string().trim().min(1).max(500),
  forbiddenExplanation: z.string().trim().min(1).max(500),
});

export type ConsumerChapterWritingTask = z.infer<typeof consumerChapterWritingTaskSchema>;

export function parseConsumerChapterWritingTask(input: unknown): ConsumerChapterWritingTask {
  const legacy = consumerChapterWritingTaskLegacySchema.parse(input);
  const record = input && typeof input === "object"
    ? input as Record<string, unknown>
    : {};
  return consumerChapterWritingTaskSchema.parse({
    ...legacy,
    openingBeat: typeof record.openingBeat === "string" && record.openingBeat.trim()
      ? record.openingBeat
      : legacy.carryOver,
    endingBeat: typeof record.endingBeat === "string" && record.endingBeat.trim()
      ? record.endingBeat
      : legacy.endingHook,
    readerInference: typeof record.readerInference === "string" && record.readerInference.trim()
      ? record.readerInference
      : legacy.endState,
    forbiddenExplanation:
      typeof record.forbiddenExplanation === "string" && record.forbiddenExplanation.trim()
        ? record.forbiddenExplanation
        : `不要直接解释“${legacy.endState}”，让读者从章末现场自行判断。`,
  });
}

export const consumerChapterProductionStatusSchema = z.enum([
  "created",
  "running",
  "succeeded",
  "failed",
  "outcome_unknown",
]);

export type ConsumerChapterProductionStatus = z.infer<
  typeof consumerChapterProductionStatusSchema
>;

export const consumerChapterProductionStageSchema = z.enum([
  "preparing_task",
  "writing",
  "continuing",
  "completed",
]);

export const consumerChapterTokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  callCount: z.number().int().nonnegative(),
});

export type ConsumerChapterTokenUsage = z.infer<
  typeof consumerChapterTokenUsageSchema
>;

export const consumerChapterLengthSnapshotSchema = z.object({
  characterCount: z.number().int().nonnegative(),
  targetCharacters: z.number().int().positive(),
  minimumCharacters: z.number().int().positive(),
  maximumCharacters: z.number().int().positive(),
});
export type ConsumerChapterLengthSnapshot = z.infer<
  typeof consumerChapterLengthSnapshotSchema
>;

export const consumerProseQualityWarningSchema = z.object({
  code: z.enum([
    "length_out_of_range",
    "formulaic_phrasing",
    "summary_ending",
    "explanatory_ending",
  ]),
  message: z.string().trim().min(1).max(300),
});
export type ConsumerProseQualityWarning = z.infer<
  typeof consumerProseQualityWarningSchema
>;

export const consumerChapterProductionSnapshotSchema = z.object({
  operationId: localIdSchema,
  novelId: localIdSchema,
  sourceChapterId: localIdSchema,
  chapterId: localIdSchema,
  requestKey: z.string().uuid(),
  mode: z.enum(["next_chapter", "continue_chapter"]),
  status: consumerChapterProductionStatusSchema,
  stage: consumerChapterProductionStageSchema,
  task: consumerChapterWritingTaskSchema.nullable(),
  receivedContent: z.string(),
  creditEstimate: consumerCreditEstimateSchema.nullable(),
  actualCredits: z.number().nonnegative().nullable(),
  // 本章累计消费：把同一 chapterId 下所有 operation 的 actualCredits 汇总成一个数字，
  // 让用户看到“写这一章一共花了多少”，而不是只看最近一次操作。null 表示中转尚未确认正向扣费。
  chapterTotalCredits: z.number().nonnegative().nullable(),
  tokenUsage: consumerChapterTokenUsageSchema,
  chapterTokenUsage: consumerChapterTokenUsageSchema,
  length: consumerChapterLengthSnapshotSchema.nullable(),
  qualityWarnings: z.array(consumerProseQualityWarningSchema).max(8),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type ConsumerChapterProductionSnapshot = z.infer<
  typeof consumerChapterProductionSnapshotSchema
>;

export const consumerStartNextChapterRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.string().uuid(),
});

export type ConsumerStartNextChapterRequest = z.infer<
  typeof consumerStartNextChapterRequestSchema
>;

export const consumerResumeChapterRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.string().uuid(),
});

export type ConsumerResumeChapterRequest = z.infer<typeof consumerResumeChapterRequestSchema>;
