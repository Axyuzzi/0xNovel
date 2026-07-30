import { z } from "zod";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const consumerSetupStepSchema = z.enum([
  "story_direction",
  "book_skeleton",
  "volume_plan",
  "current_phase",
  "first_chapter",
  "completed",
]);

export type ConsumerSetupStep = z.infer<typeof consumerSetupStepSchema>;

export const consumerSetupStatusSchema = z.enum([
  "awaiting_generation",
  "generating",
  "awaiting_confirmation",
  "failed",
  "outcome_unknown",
  "completed",
]);

export type ConsumerSetupStatus = z.infer<typeof consumerSetupStatusSchema>;

const consumerStoryDirectionBaseShape = {
  id: shortText(64),
  title: shortText(80),
  premise: shortText(500),
  protagonist: shortText(300),
  centralConflict: shortText(500),
  readerAppeal: shortText(300),
  tone: shortText(120),
  development: shortText(600),
  recommendedLength: shortText(120),
  estimatedVolumes: z.number().int().min(1).max(20),
  estimatedChapters: z.number().int().min(10).max(2_000),
};

export const consumerStoryDirectionSchema = z.object({
  ...consumerStoryDirectionBaseShape,
  coreAdvantage: shortText(500),
  advantageLimit: shortText(400),
  payoffPattern: shortText(500),
  progressionPath: shortText(600),
});

export type ConsumerStoryDirection = z.infer<typeof consumerStoryDirectionSchema>;

export const consumerStoryDirectionsArtifactSchema = z.object({
  directions: z.array(consumerStoryDirectionSchema).length(3),
});

export type ConsumerStoryDirectionsArtifact = z.infer<typeof consumerStoryDirectionsArtifactSchema>;

const legacyConsumerStoryDirectionSchema = z.object(consumerStoryDirectionBaseShape);

export const consumerStoredStoryDirectionSchema = z.union([
  consumerStoryDirectionSchema,
  legacyConsumerStoryDirectionSchema.transform((direction): ConsumerStoryDirection => ({
    ...direction,
    coreAdvantage: `以“${direction.protagonist}”已经具备的技能、资源或认知优势推动破局。`,
    advantageLimit: "优势必须受到既定规则、现实代价和人物能力边界的约束。",
    payoffPattern: direction.readerAppeal,
    progressionPath: direction.development,
  })),
]);

export const consumerStoredStoryDirectionsArtifactSchema = z.object({
  directions: z.array(consumerStoredStoryDirectionSchema).length(3),
});

export const consumerStoryDirectionPreviewSchema = z.object({
  index: z.number().int().min(0).max(2),
  title: z.string().max(80),
  premise: z.string().max(500),
  protagonist: z.string().max(300),
  centralConflict: z.string().max(500),
  tone: z.string().max(120),
  recommendedLength: z.string().max(120),
});

export type ConsumerStoryDirectionPreview = z.infer<
  typeof consumerStoryDirectionPreviewSchema
>;

export const consumerBookSkeletonSchema = z.object({
  corePromise: shortText(500),
  protagonistArc: shortText(800),
  ending: shortText(800),
  acts: z.array(z.object({
    order: z.number().int().positive(),
    name: shortText(80),
    goal: shortText(500),
    turningPoint: shortText(500),
    outcome: shortText(500),
  })).min(3).max(8),
  majorCharacters: z.array(z.object({
    name: shortText(80),
    role: shortText(120),
    arc: shortText(500),
  })).min(1).max(12),
});

export type ConsumerBookSkeleton = z.infer<typeof consumerBookSkeletonSchema>;

export const consumerVolumePlanSchema = z.object({
  volumes: z.array(z.object({
    order: z.number().int().positive(),
    title: shortText(100),
    goal: shortText(600),
    mainConflict: shortText(600),
    turningPoint: shortText(600),
    endingHook: shortText(500),
    estimatedChapters: z.number().int().min(3).max(200),
  })).min(1).max(20),
});

export type ConsumerVolumePlan = z.infer<typeof consumerVolumePlanSchema>;

export const consumerCurrentPhasePlanSchema = z.object({
  name: shortText(100),
  chapterStart: z.number().int().positive(),
  chapterEnd: z.number().int().positive(),
  objective: shortText(600),
  openingState: shortText(600),
  beats: z.array(z.object({
    order: z.number().int().positive(),
    event: shortText(600),
    purpose: shortText(400),
  })).min(3).max(16),
  characterChanges: z.array(shortText(400)).max(12),
  endingState: shortText(600),
}).superRefine((value, context) => {
  if (value.chapterEnd < value.chapterStart) {
    context.addIssue({
      code: "custom",
      path: ["chapterEnd"],
      message: "剧情阶段结束章节不能早于开始章节。",
    });
  }
});

export type ConsumerCurrentPhasePlan = z.infer<typeof consumerCurrentPhasePlanSchema>;

export const consumerFirstChapterArtifactSchema = z.object({
  title: shortText(120),
  content: z.string().trim().min(500, "第一章正文过短。").max(50_000),
  summary: shortText(800),
});

export type ConsumerFirstChapterArtifact = z.infer<typeof consumerFirstChapterArtifactSchema>;

export const consumerSetupArtifactSchema = z.union([
  consumerStoryDirectionsArtifactSchema,
  consumerBookSkeletonSchema,
  consumerVolumePlanSchema,
  consumerCurrentPhasePlanSchema,
  consumerFirstChapterArtifactSchema,
]);

export type ConsumerSetupArtifact = z.infer<typeof consumerSetupArtifactSchema>;

export const consumerCreditEstimateSchema = z.object({
  typical: z.number().nonnegative(),
  minimum: z.number().nonnegative(),
  maximum: z.number().nonnegative(),
  sampleSize: z.number().int().positive(),
});

export type ConsumerCreditEstimate = z.infer<typeof consumerCreditEstimateSchema>;

export const consumerSetupSnapshotSchema = z.object({
  novelId: z.string().min(1),
  idea: z.string(),
  step: consumerSetupStepSchema,
  status: consumerSetupStatusSchema,
  revision: z.number().int().nonnegative(),
  creditEstimate: consumerCreditEstimateSchema.nullable(),
  lastActualCredits: z.number().nonnegative().nullable(),
  directions: consumerStoryDirectionsArtifactSchema.nullable(),
  directionPreviews: z.array(consumerStoryDirectionPreviewSchema).length(3).nullable(),
  selectedDirection: consumerStoryDirectionSchema.nullable(),
  bookSkeleton: consumerBookSkeletonSchema.nullable(),
  volumePlan: consumerVolumePlanSchema.nullable(),
  currentPhase: consumerCurrentPhasePlanSchema.nullable(),
  firstChapter: consumerFirstChapterArtifactSchema.nullable(),
  firstChapterId: z.string().nullable(),
  lastError: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export type ConsumerSetupSnapshot = z.infer<typeof consumerSetupSnapshotSchema>;

export const consumerSetupGenerateRequestSchema = z.object({
  step: consumerSetupStepSchema.exclude(["completed"]),
  expectedRevision: z.number().int().nonnegative(),
  requestKey: z.string().uuid(),
});

export type ConsumerSetupGenerateRequest = z.infer<typeof consumerSetupGenerateRequestSchema>;

export const consumerSetupConfirmRequestSchema = z.object({
  step: consumerSetupStepSchema.exclude(["completed"]),
  expectedRevision: z.number().int().nonnegative(),
  selectedDirectionId: z.string().trim().min(1).max(64).optional(),
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(2_000).optional(),
});

export type ConsumerSetupConfirmRequest = z.infer<typeof consumerSetupConfirmRequestSchema>;
