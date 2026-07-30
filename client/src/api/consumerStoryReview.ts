import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerPlanningOverviewSchema,
  consumerStoryCheckpointSchema,
  consumerStoryReviewOperationKindSchema,
  consumerStoryReviewSnapshotSchema,
  type ConsumerPlanningOverview,
  type ConsumerResolveStoryReviewRequest,
  type ConsumerStartStoryAdjustmentRequest,
  type ConsumerStartStoryReviewRequest,
  type ConsumerStoryCheckpoint,
  type ConsumerStoryReviewOperationKind,
  type ConsumerStoryReviewSnapshot,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import {
  consumerCreditEstimateSchema,
  type ConsumerCreditEstimate,
} from "@0xnovelagent/shared/types/consumerSetup";
import { apiClient } from "./client";

function requireData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || "请求没有返回可用结果。");
  }
  return response.data;
}

export async function getConsumerStoryCheckpoint(
  novelId: string,
): Promise<ConsumerStoryCheckpoint> {
  const { data } = await apiClient.get<ApiResponse<ConsumerStoryCheckpoint>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/story-checkpoint`,
  );
  return consumerStoryCheckpointSchema.parse(requireData(data));
}

async function startCheckpointAction(
  novelId: string,
  action: "review" | "skip",
  input: ConsumerStartStoryReviewRequest,
): Promise<ConsumerStoryReviewSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerStoryReviewSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/story-checkpoint/${action}`,
    input,
    { silentErrorStatuses: [400, 409], requiresInternet: true },
  );
  return consumerStoryReviewSnapshotSchema.parse(requireData(data));
}

export function startConsumerStoryReview(
  novelId: string,
  input: ConsumerStartStoryReviewRequest,
): Promise<ConsumerStoryReviewSnapshot> {
  return startCheckpointAction(novelId, "review", input);
}

export function skipConsumerStoryReview(
  novelId: string,
  input: ConsumerStartStoryReviewRequest,
): Promise<ConsumerStoryReviewSnapshot> {
  return startCheckpointAction(novelId, "skip", input);
}

export async function startConsumerStoryAdjustment(
  novelId: string,
  input: ConsumerStartStoryAdjustmentRequest,
): Promise<ConsumerStoryReviewSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerStoryReviewSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/story-adjustments`,
    input,
    { silentErrorStatuses: [400, 409], requiresInternet: true },
  );
  return consumerStoryReviewSnapshotSchema.parse(requireData(data));
}

export async function resolveConsumerStoryReview(
  novelId: string,
  operationId: string,
  input: ConsumerResolveStoryReviewRequest,
): Promise<ConsumerStoryReviewSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerStoryReviewSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/story-reviews/${encodeURIComponent(operationId)}/resolve`,
    input,
    { silentErrorStatuses: [400, 409] },
  );
  return consumerStoryReviewSnapshotSchema.parse(requireData(data));
}

export async function getLatestConsumerStoryReview(
  novelId: string,
): Promise<ConsumerStoryReviewSnapshot | null> {
  const { data } = await apiClient.get<ApiResponse<ConsumerStoryReviewSnapshot | null>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/story-reviews/latest`,
  );
  return consumerStoryReviewSnapshotSchema.nullable().parse(requireData(data));
}

export async function getConsumerStoryReview(
  novelId: string,
  operationId: string,
): Promise<ConsumerStoryReviewSnapshot> {
  const { data } = await apiClient.get<ApiResponse<ConsumerStoryReviewSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/story-reviews/${encodeURIComponent(operationId)}`,
  );
  return consumerStoryReviewSnapshotSchema.parse(requireData(data));
}

export async function getConsumerStoryReviewEstimate(
  kind: ConsumerStoryReviewOperationKind,
): Promise<ConsumerCreditEstimate | null> {
  const parsedKind = consumerStoryReviewOperationKindSchema.parse(kind);
  const { data } = await apiClient.get<ApiResponse<ConsumerCreditEstimate | null>>(
    "/consumer/production/estimate/story-review",
    { params: { kind: parsedKind } },
  );
  return consumerCreditEstimateSchema.nullable().parse(requireData(data));
}

export async function getConsumerPlanningOverview(
  novelId: string,
): Promise<ConsumerPlanningOverview> {
  const { data } = await apiClient.get<ApiResponse<ConsumerPlanningOverview>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/planning`,
  );
  return consumerPlanningOverviewSchema.parse(requireData(data));
}

export async function restoreConsumerPlanningVersion(
  novelId: string,
  versionId: string,
  expectedPlanningRevision: number,
): Promise<ConsumerPlanningOverview> {
  const { data } = await apiClient.post<ApiResponse<ConsumerPlanningOverview>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/planning/versions/${encodeURIComponent(versionId)}/restore`,
    { expectedPlanningRevision },
    { silentErrorStatuses: [409] },
  );
  return consumerPlanningOverviewSchema.parse(requireData(data));
}
