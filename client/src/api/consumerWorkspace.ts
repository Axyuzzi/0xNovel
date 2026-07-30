import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerChapterCandidateSchema,
  consumerChapterDraftSchema,
  consumerChapterWorkspaceSchema,
  consumerNovelSummarySchema,
  consumerNovelWorkspaceSchema,
  type ConsumerChapterCandidate,
  type ConsumerChapterDraft,
  type ConsumerChapterWorkspace,
  type ConsumerCommitDraftRequest,
  type ConsumerCreateCandidateRequest,
  type ConsumerCreateChapterRequest,
  type ConsumerCreateNovelRequest,
  type ConsumerNovelSummary,
  type ConsumerNovelWorkspace,
  type ConsumerRestoreVersionRequest,
  type ConsumerResolveCandidateRequest,
  type ConsumerSaveDraftRequest,
} from "@0xnovelagent/shared/types/consumerWorkspace";
import { z } from "zod";
import { apiClient } from "./client";

function requireData<T>(response: ApiResponse<T>): T {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error || response.message || "请求没有返回可用结果。");
  }
  return response.data;
}

export async function listConsumerNovels(): Promise<ConsumerNovelSummary[]> {
  const { data } = await apiClient.get<ApiResponse<ConsumerNovelSummary[]>>(
    "/consumer/workspace/novels",
  );
  return z.array(consumerNovelSummarySchema).parse(requireData(data));
}

export async function createConsumerNovel(
  input: ConsumerCreateNovelRequest,
): Promise<ConsumerNovelSummary> {
  const { data } = await apiClient.post<ApiResponse<ConsumerNovelSummary>>(
    "/consumer/workspace/novels",
    input,
  );
  return consumerNovelSummarySchema.parse(requireData(data));
}

export async function getConsumerNovelWorkspace(
  novelId: string,
): Promise<ConsumerNovelWorkspace> {
  const { data } = await apiClient.get<ApiResponse<ConsumerNovelWorkspace>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}`,
  );
  return consumerNovelWorkspaceSchema.parse(requireData(data));
}

export async function downloadConsumerNovel(
  novelId: string,
  title: string,
): Promise<void> {
  const response = await apiClient.get<Blob>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/export`,
    {
      params: { format: "txt" },
      responseType: "blob",
    },
  );
  const safeTitle = title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 80) || "我的作品";
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeTitle}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function createConsumerChapter(
  novelId: string,
  input: ConsumerCreateChapterRequest,
): Promise<ConsumerChapterWorkspace> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterWorkspace>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters`,
    input,
  );
  return consumerChapterWorkspaceSchema.parse(requireData(data));
}

export async function getConsumerChapterWorkspace(
  novelId: string,
  chapterId: string,
): Promise<ConsumerChapterWorkspace> {
  const { data } = await apiClient.get<ApiResponse<ConsumerChapterWorkspace>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`,
  );
  return consumerChapterWorkspaceSchema.parse(requireData(data));
}

export async function saveConsumerChapterDraft(
  novelId: string,
  chapterId: string,
  input: ConsumerSaveDraftRequest,
): Promise<ConsumerChapterDraft> {
  const { data } = await apiClient.put<ApiResponse<ConsumerChapterDraft>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/draft`,
    input,
    { silentErrorStatuses: [409] },
  );
  return consumerChapterDraftSchema.parse(requireData(data));
}

export async function commitConsumerChapterDraft(
  novelId: string,
  chapterId: string,
  input: ConsumerCommitDraftRequest,
): Promise<ConsumerChapterWorkspace> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterWorkspace>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/commit`,
    input,
    { silentErrorStatuses: [409] },
  );
  return consumerChapterWorkspaceSchema.parse(requireData(data));
}

export async function createConsumerChapterCandidate(
  novelId: string,
  chapterId: string,
  input: ConsumerCreateCandidateRequest,
): Promise<ConsumerChapterCandidate> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterCandidate>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/candidates`,
    input,
  );
  return consumerChapterCandidateSchema.parse(requireData(data));
}

export async function resolveConsumerChapterCandidate(
  novelId: string,
  chapterId: string,
  candidateId: string,
  input: ConsumerResolveCandidateRequest,
): Promise<ConsumerChapterWorkspace> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterWorkspace>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/candidates/${encodeURIComponent(candidateId)}/resolve`,
    input,
    { silentErrorStatuses: [409] },
  );
  return consumerChapterWorkspaceSchema.parse(requireData(data));
}

export async function restoreConsumerChapterVersion(
  novelId: string,
  chapterId: string,
  versionId: string,
  input: ConsumerRestoreVersionRequest,
): Promise<ConsumerChapterWorkspace> {
  const { data } = await apiClient.post<ApiResponse<ConsumerChapterWorkspace>>(
    `/consumer/workspace/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}/versions/${encodeURIComponent(versionId)}/restore`,
    input,
    { silentErrorStatuses: [409] },
  );
  return consumerChapterWorkspaceSchema.parse(requireData(data));
}
