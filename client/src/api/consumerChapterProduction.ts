import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerChapterProductionSnapshotSchema,
  type ConsumerChapterProductionSnapshot,
  type ConsumerResumeChapterRequest,
  type ConsumerStartNextChapterRequest,
} from "@0xnovelagent/shared/types/consumerChapterProduction";
import {
  consumerCreditEstimateSchema,
  type ConsumerCreditEstimate,
} from "@0xnovelagent/shared/types/consumerSetup";
import { z } from "zod";
import { apiClient } from "./client";

function requireData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || "请求没有返回可用结果。");
  }
  return response.data;
}

export async function getNextChapterEstimate(): Promise<ConsumerCreditEstimate | null> {
  const { data } = await apiClient.get<ApiResponse<ConsumerCreditEstimate | null>>(
    "/consumer/production/estimate/next-chapter",
  );
  return consumerCreditEstimateSchema.nullable().parse(requireData(data));
}

export async function startNextConsumerChapter(
  novelId: string,
  chapterId: string,
  input: ConsumerStartNextChapterRequest,
): Promise<ConsumerChapterProductionSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterProductionSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/next`,
    input,
    { silentErrorStatuses: [400, 409], requiresInternet: true },
  );
  return consumerChapterProductionSnapshotSchema.parse(requireData(data));
}

export async function resumeConsumerChapter(
  novelId: string,
  chapterId: string,
  input: ConsumerResumeChapterRequest,
): Promise<ConsumerChapterProductionSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterProductionSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/resume`,
    input,
    { silentErrorStatuses: [404, 409], requiresInternet: true },
  );
  return consumerChapterProductionSnapshotSchema.parse(requireData(data));
}

export async function getConsumerChapterProduction(
  novelId: string,
  operationId: string,
): Promise<ConsumerChapterProductionSnapshot> {
  const { data } = await apiClient.get<ApiResponse<ConsumerChapterProductionSnapshot>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/operations/${encodeURIComponent(operationId)}`,
  );
  return consumerChapterProductionSnapshotSchema.parse(requireData(data));
}

export async function getLatestConsumerChapterProduction(
  novelId: string,
  chapterId: string,
): Promise<ConsumerChapterProductionSnapshot | null> {
  const { data } = await apiClient.get<ApiResponse<ConsumerChapterProductionSnapshot | null>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/latest`,
  );
  return consumerChapterProductionSnapshotSchema.nullable().parse(requireData(data));
}

export async function listConsumerCreationProgress(
  novelId: string,
): Promise<ConsumerChapterProductionSnapshot[]> {
  const { data } = await apiClient.get<ApiResponse<ConsumerChapterProductionSnapshot[]>>(
    `/consumer/production/novels/${encodeURIComponent(novelId)}/progress`,
  );
  return z.array(consumerChapterProductionSnapshotSchema).parse(requireData(data));
}
