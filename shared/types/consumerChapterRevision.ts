import { z } from "zod";
import { consumerChapterProductionStatusSchema } from "./consumerChapterProduction.js";
import { consumerCreditEstimateSchema } from "./consumerSetup.js";

const localIdSchema = z.string().trim().min(1).max(128);

export const consumerChapterRevisionModeSchema = z.enum(["revise", "rewrite"]);
export type ConsumerChapterRevisionMode = z.infer<typeof consumerChapterRevisionModeSchema>;

export const consumerChapterRevisionPresetSchema = z.enum([
  "natural_language",
  "stronger_emotion",
  "tighter_pacing",
  "custom",
]);
export type ConsumerChapterRevisionPreset = z.infer<typeof consumerChapterRevisionPresetSchema>;

export const consumerStartChapterRevisionRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.string().uuid(),
  mode: consumerChapterRevisionModeSchema,
  preset: consumerChapterRevisionPresetSchema,
  instruction: z.string().trim().min(1, "请说明希望怎样修改。").max(2_000),
  sourceCandidateId: localIdSchema.nullable().optional(),
});

export type ConsumerStartChapterRevisionRequest = z.infer<
  typeof consumerStartChapterRevisionRequestSchema
>;

export const consumerChapterRevisionStageSchema = z.enum([
  "generating_candidate",
  "completed",
]);

export const consumerChapterRevisionSnapshotSchema = z.object({
  operationId: localIdSchema,
  novelId: localIdSchema,
  chapterId: localIdSchema,
  requestKey: z.string().uuid(),
  mode: consumerChapterRevisionModeSchema,
  preset: consumerChapterRevisionPresetSchema,
  instruction: z.string(),
  sourceCandidateId: localIdSchema.nullable(),
  status: consumerChapterProductionStatusSchema,
  stage: consumerChapterRevisionStageSchema,
  receivedContent: z.string(),
  resultCandidateId: localIdSchema.nullable(),
  creditEstimate: consumerCreditEstimateSchema.nullable(),
  actualCredits: z.number().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type ConsumerChapterRevisionSnapshot = z.infer<
  typeof consumerChapterRevisionSnapshotSchema
>;
