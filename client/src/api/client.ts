import axios, { AxiosError } from "axios";
import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import { API_BASE_URL, API_TIMEOUT_MS } from "@/lib/constants";
import { toast } from "@/components/ui/toast";
import { createApiSessionHeaderRecord } from "./requestHeaders";
import { isBrowserOnline } from "@/features/network/onlineStatus";
import { isDesktopUpdateRequired } from "@/lib/desktop";

export interface ApiHttpError extends Error {
  status?: number;
  details?: unknown;
}

declare module "axios" {
  interface AxiosRequestConfig {
    silentErrorStatuses?: number[];
    requiresInternet?: boolean;
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: createApiSessionHeaderRecord(),
});

apiClient.interceptors.request.use((config) => {
  if (config.requiresInternet && isDesktopUpdateRequired()) {
    return Promise.reject(new AxiosError(
      "当前版本需要更新后才能继续使用联网服务。",
      "OXNOVEL_UPDATE_REQUIRED",
      config,
    ));
  }
  if (config.requiresInternet && !isBrowserOnline()) {
    return Promise.reject(new AxiosError(
      "当前未联网。作品仍可编辑，联网后再使用 AI 或充值。",
      "OXNOVEL_OFFLINE",
      config,
    ));
  }
  return config;
});

const AUTO_DISMISS_SERVER_ERROR_TOAST = {
  duration: 4000,
  closeButton: false,
} as const;

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse<unknown>>) => {
    const status = error.response?.status;
    const backendError = error.response?.data?.error;
    const backendMessage = error.response?.data?.message;
    const silentErrorStatuses = error.config?.silentErrorStatuses ?? [];
    let title = backendError ?? error.message ?? "请求失败。";
    let description = backendMessage && backendMessage !== backendError ? backendMessage : undefined;

    if (error.code === "OXNOVEL_UPDATE_REQUIRED") {
      title = "请先更新软件。";
      description = "本地作品仍可阅读、编辑、保存和导出，更新后可以继续使用联网创作服务。";
    } else if (error.code === "OXNOVEL_OFFLINE") {
      title = "当前未联网。";
      description = "作品仍可编辑，联网后再使用 AI 或充值。";
    } else if (!status) {
      title = "网络连接失败，请检查网络后重试。";
      description = undefined;
    } else if (status >= 500) {
      title = backendError ?? "服务器错误，请稍后重试。";
      description = backendMessage && backendMessage !== title ? backendMessage : undefined;
    }

    if (!status || !silentErrorStatuses.includes(status)) {
      const isGenericServerErrorToast = title === "服务器错误，请稍后重试。";

      if (description) {
        toast.error(
          title,
          isGenericServerErrorToast
            ? {
                description,
                ...AUTO_DISMISS_SERVER_ERROR_TOAST,
              }
            : { description },
        );
      } else {
        toast.error(title, isGenericServerErrorToast ? AUTO_DISMISS_SERVER_ERROR_TOAST : undefined);
      }
    }

    const message = description ? `${title} ${description}` : title;

    const normalizedError = new Error(
      message,
    ) as ApiHttpError;
    normalizedError.status = status;
    normalizedError.details = error.response?.data;
    return Promise.reject(normalizedError);
  },
);
