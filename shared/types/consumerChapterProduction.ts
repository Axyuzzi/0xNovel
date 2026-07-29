import { z } from "zod";
import { consumerCreditEstimateSchema } from "./consumerSetup.js";

const localIdSchema = z.string().trim().min(1).max(128);

export const consumerChapterWritingTaskSchema = z.object({
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

export type ConsumerChapterWritingTask = z.infer<typeof consumerChapterWritingTaskSchema>;

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
  // 让用户看到“写这一章一共花了多少”，而不是只看最近一次操作。null 表示还没有任何已计费操作。
  chapterTotalCredits: z.number().nonnegative().nullable(),
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
