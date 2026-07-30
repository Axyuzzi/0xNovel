import { z } from "zod";
import { consumerChapterProductionStatusSchema } from "./consumerChapterProduction.js";
import {
  consumerBookSkeletonSchema,
  consumerCreditEstimateSchema,
  consumerCurrentPhasePlanSchema,
  consumerStoryDirectionSchema,
  consumerVolumePlanSchema,
} from "./consumerSetup.js";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const consumerStoryCheckpointKindSchema = z.enum(["phase", "volume"]);
export type ConsumerStoryCheckpointKind = z.infer<
  typeof consumerStoryCheckpointKindSchema
>;

export const consumerPlanningImpactSchema = z.enum(["low", "medium", "high"]);
export type ConsumerPlanningImpact = z.infer<typeof consumerPlanningImpactSchema>;

export const consumerStoryReviewOperationKindSchema = z.enum([
  "review",
  "adjustment",
  "transition",
]);
export type ConsumerStoryReviewOperationKind = z.infer<
  typeof consumerStoryReviewOperationKindSchema
>;

export const consumerStoryReviewStageSchema = z.enum([
  "analyzing",
  "awaiting_confirmation",
  "applying",
  "completed",
]);
export type ConsumerStoryReviewStage = z.infer<
  typeof consumerStoryReviewStageSchema
>;

export const consumerStoryReviewArtifactSchema = z.object({
  conclusion: shortText(1_000),
  affectedLocations: z.array(shortText(300)).max(12),
  impactLevel: consumerPlanningImpactSchema,
  changeSummary: shortText(1_000),
  futureAffected: z.array(shortText(400)).max(12),
  preserved: z.array(shortText(400)).min(1).max(12),
  recommendedAction: shortText(1_000),
  proposedBookSkeleton: consumerBookSkeletonSchema.nullable(),
  proposedVolumePlan: consumerVolumePlanSchema.nullable(),
  proposedCurrentPhase: consumerCurrentPhasePlanSchema,
});

export type ConsumerStoryReviewArtifact = z.infer<
  typeof consumerStoryReviewArtifactSchema
>;

export const consumerStoryReviewSnapshotSchema = z.object({
  operationId: z.string().min(1),
  novelId: z.string().min(1),
  requestKey: z.string().uuid(),
  kind: consumerStoryReviewOperationKindSchema,
  checkpointKey: z.string().nullable(),
  checkpointKind: consumerStoryCheckpointKindSchema.nullable(),
  instruction: z.string(),
  status: consumerChapterProductionStatusSchema,
  stage: consumerStoryReviewStageSchema,
  report: consumerStoryReviewArtifactSchema.nullable(),
  receivedContent: z.string(),
  creditEstimate: consumerCreditEstimateSchema.nullable(),
  actualCredits: z.number().nonnegative().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
});

export type ConsumerStoryReviewSnapshot = z.infer<
  typeof consumerStoryReviewSnapshotSchema
>;

export const consumerStoryCheckpointSchema = z.object({
  required: z.boolean(),
  key: z.string().nullable(),
  kind: consumerStoryCheckpointKindSchema.nullable(),
  title: z.string().nullable(),
  rangeStart: z.number().int().positive().nullable(),
  rangeEnd: z.number().int().positive().nullable(),
  latestOperation: consumerStoryReviewSnapshotSchema.nullable(),
});

export type ConsumerStoryCheckpoint = z.infer<
  typeof consumerStoryCheckpointSchema
>;

export const consumerStartStoryReviewRequestSchema = z.object({
  requestKey: z.string().uuid(),
  checkpointKey: shortText(160),
});

export type ConsumerStartStoryReviewRequest = z.infer<
  typeof consumerStartStoryReviewRequestSchema
>;

export const consumerSkipStoryReviewRequestSchema =
  consumerStartStoryReviewRequestSchema;
export type ConsumerSkipStoryReviewRequest = ConsumerStartStoryReviewRequest;

export const consumerStartStoryAdjustmentRequestSchema = z.object({
  requestKey: z.string().uuid(),
  instruction: shortText(2_000),
  expectedPlanningRevision: z.number().int().nonnegative(),
});

export type ConsumerStartStoryAdjustmentRequest = z.infer<
  typeof consumerStartStoryAdjustmentRequestSchema
>;

export const consumerResolveStoryReviewRequestSchema = z.object({
  action: z.enum(["apply_recommendation", "continue_without_changes", "reject"]),
  expectedPlanningRevision: z.number().int().nonnegative(),
});

export type ConsumerResolveStoryReviewRequest = z.infer<
  typeof consumerResolveStoryReviewRequestSchema
>;

export const consumerPlanningVersionSchema = z.object({
  id: z.string().min(1),
  novelId: z.string().min(1),
  sequence: z.number().int().positive(),
  label: z.string(),
  reason: z.string(),
  sourceOperationId: z.string().nullable(),
  restoredFromVersionId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type ConsumerPlanningVersion = z.infer<
  typeof consumerPlanningVersionSchema
>;

export const consumerPlanningOverviewSchema = z.object({
  novelId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  idea: z.string(),
  selectedDirection: consumerStoryDirectionSchema,
  bookSkeleton: consumerBookSkeletonSchema,
  volumePlan: consumerVolumePlanSchema,
  currentPhase: consumerCurrentPhasePlanSchema,
  versions: z.array(consumerPlanningVersionSchema),
});

export type ConsumerPlanningOverview = z.infer<
  typeof consumerPlanningOverviewSchema
>;

export const consumerRestorePlanningVersionRequestSchema = z.object({
  expectedPlanningRevision: z.number().int().nonnegative(),
});

export type ConsumerRestorePlanningVersionRequest = z.infer<
  typeof consumerRestorePlanningVersionRequestSchema
>;
