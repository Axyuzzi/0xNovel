import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerChapterRevisionSnapshotSchema,
  consumerChapterRevisionModeSchema,
  type ConsumerChapterRevisionMode,
  type ConsumerChapterRevisionSnapshot,
  type ConsumerStartChapterRevisionRequest,
} from "@0xnovelagent/shared/types/consumerChapterRevision";
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

export async function startConsumerChapterRevision(
  novelId: string,
  chapterId: string,
  input: ConsumerStartChapterRevisionRequest,
): Promise<ConsumerChapterRevisionSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterRevisionSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/revisions`,
    input,
    { silentErrorStatuses: [400, 409], requiresInternet: true },
  );
  return consumerChapterRevisionSnapshotSchema.parse(requireData(data));
}

export async function getLatestConsumerChapterRevision(
  novelId: string,
  chapterId: string,
): Promise<ConsumerChapterRevisionSnapshot | null> {
  const { data } = await apiClient.get<ApiResponse<ConsumerChapterRevisionSnapshot | null>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/revisions/latest`,
  );
  return consumerChapterRevisionSnapshotSchema.nullable().parse(requireData(data));
}

export async function getConsumerChapterRevision(
  novelId: string,
  operationId: string,
): Promise<ConsumerChapterRevisionSnapshot> {
  const { data } = await apiClient.get<ApiResponse<ConsumerChapterRevisionSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/revisions/${encodeURIComponent(operationId)}`,
  );
  return consumerChapterRevisionSnapshotSchema.parse(requireData(data));
}

export async function getConsumerChapterRevisionEstimate(
  mode: ConsumerChapterRevisionMode,
): Promise<ConsumerCreditEstimate | null> {
  const parsedMode = consumerChapterRevisionModeSchema.parse(mode);
  const { data } = await apiClient.get<ApiResponse<ConsumerCreditEstimate | null>>(
    "/consumer/production/estimate/chapter-revision",
    { params: { mode: parsedMode } },
  );
  return consumerCreditEstimateSchema.nullable().parse(requireData(data));
}
