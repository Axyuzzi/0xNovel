import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerSetupSnapshotSchema,
  type ConsumerSetupConfirmRequest,
  type ConsumerSetupGenerateRequest,
  type ConsumerSetupSnapshot,
} from "@0xnovelagent/shared/types/consumerSetup";
import { apiClient } from "./client";

function requireData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || "请求没有返回可用结果。");
  }
  return response.data;
}

export async function getConsumerSetup(novelId: string): Promise<ConsumerSetupSnapshot> {
  const { data } = await apiClient.get<ApiResponse<ConsumerSetupSnapshot>>(
    `/consumer/setup/novels/${encodeURIComponent(novelId)}`,
  );
  return consumerSetupSnapshotSchema.parse(requireData(data));
}

export async function generateConsumerSetupStep(
  novelId: string,
  input: ConsumerSetupGenerateRequest,
): Promise<ConsumerSetupSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerSetupSnapshot>>(
    `/consumer/setup/novels/${encodeURIComponent(novelId)}/generate`,
    input,
    { silentErrorStatuses: [409, 502], requiresInternet: true },
  );
  return consumerSetupSnapshotSchema.parse(requireData(data));
}

export async function confirmConsumerSetupStep(
  novelId: string,
  input: ConsumerSetupConfirmRequest,
): Promise<ConsumerSetupSnapshot> {
  const { data } = await apiClient.post<ApiResponse<ConsumerSetupSnapshot>>(
    `/consumer/setup/novels/${encodeURIComponent(novelId)}/confirm`,
    input,
    { silentErrorStatuses: [400, 409] },
  );
  return consumerSetupSnapshotSchema.parse(requireData(data));
}
