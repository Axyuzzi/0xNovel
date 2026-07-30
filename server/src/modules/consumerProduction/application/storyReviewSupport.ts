import { createHash } from "node:crypto";
import {
  consumerStoryReviewArtifactSchema,
  consumerStoryReviewOperationKindSchema,
  type ConsumerStoryCheckpointKind,
  type ConsumerStoryReviewArtifact,
  type ConsumerStoryReviewOperationKind,
  type ConsumerPlanningVersion,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import {
  consumerBookSkeletonSchema,
  consumerCurrentPhasePlanSchema,
  consumerVolumePlanSchema,
} from "@0xnovelagent/shared/types/consumerSetup";
import type {
  ConsumerCreationOperation,
  ConsumerStorySetup,
  Prisma,
} from "@prisma/client";
import { AppError } from "../../../middleware/errorHandler";

export interface StoryReviewPayload {
  kind: ConsumerStoryReviewOperationKind;
  checkpointKey: string | null;
  checkpointKind: ConsumerStoryCheckpointKind | null;
  rangeStart: number | null;
  rangeEnd: number | null;
  instruction: string;
  basePlanningRevision: number;
  basePlanningHash: string;
  baseChapterHash: string;
}

export type SetupPlans = {
  bookSkeleton: ReturnType<typeof consumerBookSkeletonSchema.parse>;
  volumePlan: ReturnType<typeof consumerVolumePlanSchema.parse>;
  currentPhase: ReturnType<typeof consumerCurrentPhasePlanSchema.parse>;
};

export function parseStoryJson(value: string | null, label: string): unknown {
  if (!value) throw new AppError(`${label}尚未准备好。`, 409);
  try {
    return JSON.parse(value);
  } catch {
    throw new AppError(`${label}数据损坏，请从本地备份恢复。`, 500);
  }
}

export function parseSetupPlans(setup: ConsumerStorySetup): SetupPlans {
  return {
    bookSkeleton: consumerBookSkeletonSchema.parse(
      parseStoryJson(setup.bookSkeletonJson, "全书骨架"),
    ),
    volumePlan: consumerVolumePlanSchema.parse(
      parseStoryJson(setup.volumePlanJson, "全部卷规划"),
    ),
    currentPhase: consumerCurrentPhasePlanSchema.parse(
      parseStoryJson(setup.currentPhaseJson, "当前剧情阶段"),
    ),
  };
}

export function storyPlanningHash(plans: SetupPlans): string {
  return createHash("sha256")
    .update(JSON.stringify(plans), "utf8")
    .digest("hex");
}

export function storyOperationKind(kind: ConsumerStoryReviewOperationKind): string {
  if (kind === "review") return "consumer_story_review";
  if (kind === "transition") return "consumer_story_transition";
  return "consumer_story_adjustment";
}

export function parseStoryReviewPayload(
  operation: ConsumerCreationOperation,
): StoryReviewPayload {
  const raw = parseStoryJson(operation.inputJson, "故事检查记录");
  if (!raw || typeof raw !== "object") {
    throw new AppError("故事检查记录缺少必要信息。", 500);
  }
  const value = raw as Record<string, unknown>;
  if (
    typeof value.instruction !== "string"
    || typeof value.basePlanningRevision !== "number"
    || typeof value.basePlanningHash !== "string"
    || typeof value.baseChapterHash !== "string"
  ) {
    throw new AppError("故事检查记录缺少必要信息。", 500);
  }
  return {
    kind: consumerStoryReviewOperationKindSchema.parse(value.kind),
    checkpointKey: typeof value.checkpointKey === "string" ? value.checkpointKey : null,
    checkpointKind: value.checkpointKind === "phase" || value.checkpointKind === "volume"
      ? value.checkpointKind
      : null,
    rangeStart: typeof value.rangeStart === "number" ? value.rangeStart : null,
    rangeEnd: typeof value.rangeEnd === "number" ? value.rangeEnd : null,
    instruction: value.instruction,
    basePlanningRevision: value.basePlanningRevision,
    basePlanningHash: value.basePlanningHash,
    baseChapterHash: value.baseChapterHash,
  };
}

export function parseStoryReviewReport(
  operation: ConsumerCreationOperation,
): ConsumerStoryReviewArtifact | null {
  if (!operation.receivedContent.trim() || operation.status !== "succeeded") return null;
  try {
    return consumerStoryReviewArtifactSchema.parse(JSON.parse(operation.receivedContent));
  } catch {
    throw new AppError("故事检查结果损坏，请重新检查。", 500);
  }
}

export function safeStoryReviewError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.slice(0, 500)
    : "这次检查没有完成。";
}

export function measuredStoryReviewCredits(
  before: number | null,
  after: number | null,
): number | null {
  if (before === null || after === null) return null;
  return Math.max(0, Math.round((before - after) * 1_000));
}

export function storyCompletedChapterHash(
  chapters: Array<{
    id: string;
    order: number;
    content: string | null;
    consumerDraft?: { content: string } | null;
  }>,
): string {
  const frozen = chapters
    .map((chapter) => ({
      id: chapter.id,
      order: chapter.order,
      content: chapter.consumerDraft?.content ?? chapter.content ?? "",
    }))
    .filter((chapter) => chapter.content.trim())
    .sort((left, right) => left.order - right.order);
  return createHash("sha256")
    .update(JSON.stringify(frozen), "utf8")
    .digest("hex");
}

export function serializeConsumerPlanningVersion(version: {
  id: string;
  novelId: string;
  sequence: number;
  label: string;
  reason: string;
  sourceOperationId: string | null;
  restoredFromVersionId: string | null;
  createdAt: Date;
}): ConsumerPlanningVersion {
  return {
    ...version,
    createdAt: version.createdAt.toISOString(),
  };
}

export async function saveConsumerPlanningSnapshot(
  tx: Prisma.TransactionClient,
  setup: ConsumerStorySetup,
  label: string,
  reason: string,
  sourceOperationId?: string,
  restoredFromVersionId?: string,
) {
  const plans = parseSetupPlans(setup);
  const bookSkeletonJson = JSON.stringify(plans.bookSkeleton);
  const volumePlanJson = JSON.stringify(plans.volumePlan);
  const currentPhaseJson = JSON.stringify(plans.currentPhase);
  const latest = await tx.consumerPlanningVersion.findFirst({
    where: { novelId: setup.novelId },
    orderBy: { sequence: "desc" },
  });
  if (
    latest
    && latest.bookSkeletonJson === bookSkeletonJson
    && latest.volumePlanJson === volumePlanJson
    && latest.currentPhaseJson === currentPhaseJson
  ) {
    return latest;
  }
  return tx.consumerPlanningVersion.create({
    data: {
      novelId: setup.novelId,
      sequence: (latest?.sequence ?? 0) + 1,
      label,
      reason,
      bookSkeletonJson,
      volumePlanJson,
      currentPhaseJson,
      sourceOperationId,
      restoredFromVersionId,
    },
  });
}
