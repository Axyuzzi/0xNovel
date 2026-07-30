import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerSegmentRunSnapshotSchema,
  type ConsumerSegmentRunSnapshot,
  type ConsumerStartSegmentRunRequest,
} from "@0xnovelagent/shared/types/consumerSegmentRun";
import { apiClient } from "./client";

function requireData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || "请求没有返回可用结果。");
  }
  return response.data;
}

export async function startConsumerSegmentRun(
  novelId: string,
  input: ConsumerStartSegmentRunRequest,
): Promise<ConsumerSegmentRunSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerSegmentRunSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/segment-runs`,
    input,
    { requiresInternet: true, silentErrorStatuses: [409] },
  );
  return consumerSegmentRunSnapshotSchema.parse(requireData(data));
}

export async function getLatestConsumerSegmentRun(
  novelId: string,
): Promise<ConsumerSegmentRunSnapshot | null> {
  const { data } = await apiClient.get<ApiResponse<ConsumerSegmentRunSnapshot | null>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/segment-runs/latest`,
  );
  return consumerSegmentRunSnapshotSchema.nullable().parse(requireData(data));
}

export async function getConsumerSegmentRun(
  novelId: string,
  runId: string,
): Promise<ConsumerSegmentRunSnapshot> {
  const { data } = await apiClient.get<ApiResponse<ConsumerSegmentRunSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/segment-runs/${encodeURIComponent(runId)}`,
  );
  return consumerSegmentRunSnapshotSchema.parse(requireData(data));
}

export async function pauseConsumerSegmentRun(
  novelId: string,
  runId: string,
): Promise<ConsumerSegmentRunSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerSegmentRunSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/segment-runs/${encodeURIComponent(runId)}/pause`,
  );
  return consumerSegmentRunSnapshotSchema.parse(requireData(data));
}

export async function resumeConsumerSegmentRun(
  novelId: string,
  runId: string,
): Promise<ConsumerSegmentRunSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerSegmentRunSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/segment-runs/${encodeURIComponent(runId)}/resume`,
    undefined,
    { requiresInternet: true, silentErrorStatuses: [409] },
  );
  return consumerSegmentRunSnapshotSchema.parse(requireData(data));
}
