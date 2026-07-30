import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerBalanceSchema,
  consumerPaymentInfoSchema,
  consumerUsageLogsSchema,
  relayPaymentOrderSchema,
  relaySessionSchema,
  relayWechatPaymentOrderSchema,
  type ConsumerBalance,
  type ConsumerPaymentInfo,
  type RelayLoginRequest,
  type RelayPaymentOrder,
  type RelayRegisterRequest,
  type RelaySession,
  type RelayUsageLogQuery,
  type ConsumerUsageLogs,
  type RelayWechatPaymentOrder,
} from "@0xnovelagent/shared/types/relay";
import { apiClient } from "./client";

function requireData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || "请求没有返回可用结果。");
  }
  return response.data;
}

export async function registerConsumerAccount(input: RelayRegisterRequest): Promise<RelaySession> {
  const { data } = await apiClient.post<ApiResponse<RelaySession>>("/consumer/auth/register", input, {
    requiresInternet: true,
  });
  return relaySessionSchema.parse(requireData(data));
}

export async function loginConsumerAccount(input: RelayLoginRequest): Promise<RelaySession> {
  const { data } = await apiClient.post<ApiResponse<RelaySession>>("/consumer/auth/login", input, {
    requiresInternet: true,
  });
  return relaySessionSchema.parse(requireData(data));
}

export async function getConsumerSession(): Promise<RelaySession> {
  const { data } = await apiClient.get<ApiResponse<RelaySession>>("/consumer/auth/session", {
    silentErrorStatuses: [401],
  });
  return relaySessionSchema.parse(requireData(data));
}

export async function logoutConsumerAccount(): Promise<RelaySession> {
  const { data } = await apiClient.post<ApiResponse<RelaySession>>("/consumer/auth/logout");
  return relaySessionSchema.parse(requireData(data));
}

export async function getConsumerBalance(): Promise<ConsumerBalance> {
  const { data } = await apiClient.get<ApiResponse<ConsumerBalance>>("/consumer/usage/balance", {
    requiresInternet: true,
  });
  return consumerBalanceSchema.parse(requireData(data));
}

export async function getConsumerUsageLogs(
  input: Partial<RelayUsageLogQuery> = {},
): Promise<ConsumerUsageLogs> {
  const { data } = await apiClient.get<ApiResponse<ConsumerUsageLogs>>("/consumer/usage/logs", {
    params: input,
    requiresInternet: true,
  });
  return consumerUsageLogsSchema.parse(requireData(data));
}

export async function getConsumerPaymentInfo(): Promise<ConsumerPaymentInfo> {
  const { data } = await apiClient.get<ApiResponse<ConsumerPaymentInfo>>("/consumer/payment/info", {
    requiresInternet: true,
  });
  return consumerPaymentInfoSchema.parse(requireData(data));
}

export async function createConsumerWechatOrder(amount: number): Promise<RelayWechatPaymentOrder> {
  const { data } = await apiClient.post<ApiResponse<RelayWechatPaymentOrder>>(
    "/consumer/payment/wechat/native",
    { amount },
    { requiresInternet: true },
  );
  return relayWechatPaymentOrderSchema.parse(requireData(data));
}

export async function getConsumerPaymentOrder(orderNo: string): Promise<RelayPaymentOrder> {
  const { data } = await apiClient.get<ApiResponse<RelayPaymentOrder>>(
    `/consumer/payment/orders/${encodeURIComponent(orderNo)}`,
    { requiresInternet: true },
  );
  return relayPaymentOrderSchema.parse(requireData(data));
}
