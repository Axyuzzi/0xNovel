import { z } from "zod";
import { consumerChapterTokenUsageSchema } from "./consumerChapterProduction.js";

const localIdSchema = z.string().trim().min(1).max(128);

export const consumerSegmentRunStatusSchema = z.enum([
  "created",
  "running",
  "pausing",
  "paused",
  "completed",
  "failed",
]);

export type ConsumerSegmentRunStatus = z.infer<
  typeof consumerSegmentRunStatusSchema
>;

export const consumerStartSegmentRunRequestSchema = z.object({
  requestKey: z.string().uuid(),
  sourceChapterId: localIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  expectedPlanningRevision: z.number().int().nonnegative(),
});

export type ConsumerStartSegmentRunRequest = z.infer<
  typeof consumerStartSegmentRunRequestSchema
>;

export const consumerSegmentRunSnapshotSchema = z.object({
  id: localIdSchema,
  requestKey: z.string().uuid(),
  novelId: localIdSchema,
  sourceChapterId: localIdSchema,
  status: consumerSegmentRunStatusSchema,
  phaseName: z.string(),
  phaseObjective: z.string(),
  phaseStartOrder: z.number().int().positive(),
  phaseEndOrder: z.number().int().positive(),
  firstTargetOrder: z.number().int().positive(),
  completedThroughOrder: z.number().int().nonnegative(),
  currentChapterId: localIdSchema.nullable(),
  currentChapterOrder: z.number().int().positive().nullable(),
  currentOperationId: localIdSchema.nullable(),
  completedChapters: z.number().int().nonnegative(),
  totalChapters: z.number().int().positive(),
  actualCredits: z.number().nonnegative().nullable(),
  tokenUsage: consumerChapterTokenUsageSchema,
  pauseRequestedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type ConsumerSegmentRunSnapshot = z.infer<
  typeof consumerSegmentRunSnapshotSchema
>;
