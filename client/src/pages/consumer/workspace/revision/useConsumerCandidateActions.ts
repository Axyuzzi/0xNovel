import { useState } from "react";
import {
  resolveConsumerChapterCandidate,
  restoreConsumerChapterVersion,
} from "@/api/consumerWorkspace";
import type { ConsumerChapterWorkspace } from "@0xnovelagent/shared/types/consumerWorkspace";

interface UseConsumerCandidateActionsOptions {
  novelId: string;
  chapterId: string;
  persistDraft: () => Promise<number>;
  refreshRevision: () => Promise<void>;
  applyWorkspace: (workspace: ConsumerChapterWorkspace) => void;
  setPanelOpen: (open: boolean) => void;
  onError: (message: string) => void;
}

export function useConsumerCandidateActions({
  novelId,
  chapterId,
  persistDraft,
  refreshRevision,
  applyWorkspace,
  setPanelOpen,
  onError,
}: UseConsumerCandidateActionsOptions) {
  const [activeCandidateId, setActiveCandidateId] = useState("");
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [candidateBusy, setCandidateBusy] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState("");

  const adoptCandidate = async (candidateId: string) => {
    if (!novelId || !chapterId) return;
    setCandidateBusy(true);
    onError("");
    try {
      const expectedRevision = await persistDraft();
      const workspace = await resolveConsumerChapterCandidate(
        novelId,
        chapterId,
        candidateId,
        { action: "adopt", expectedRevision },
      );
      applyWorkspace(workspace);
      setActiveCandidateId("");
      setPreviewOriginal(false);
      setPanelOpen(false);
      await refreshRevision();
    } catch (error) {
      onError(error instanceof Error ? error.message : "修改建议没有采用成功。");
    } finally {
      setCandidateBusy(false);
    }
  };

  const rejectCandidate = async (candidateId: string) => {
    if (!novelId || !chapterId) return;
    setCandidateBusy(true);
    onError("");
    try {
      const workspace = await resolveConsumerChapterCandidate(
        novelId,
        chapterId,
        candidateId,
        { action: "reject" },
      );
      applyWorkspace(workspace);
      const remaining = workspace.candidates.filter(
        (candidate) => candidate.status === "pending",
      );
      setActiveCandidateId(remaining[0]?.id ?? "");
      setPreviewOriginal(false);
      if (remaining.length === 0) setPanelOpen(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "暂时无法保留原文，请重试。");
    } finally {
      setCandidateBusy(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!novelId || !chapterId) return;
    setRestoringVersionId(versionId);
    onError("");
    try {
      const expectedRevision = await persistDraft();
      const workspace = await restoreConsumerChapterVersion(
        novelId,
        chapterId,
        versionId,
        { expectedRevision },
      );
      applyWorkspace(workspace);
    } catch (error) {
      onError(error instanceof Error ? error.message : "历史版本没有恢复成功。");
    } finally {
      setRestoringVersionId("");
    }
  };

  return {
    activeCandidateId,
    setActiveCandidateId,
    previewOriginal,
    setPreviewOriginal,
    candidateBusy,
    restoringVersionId,
    adoptCandidate,
    rejectCandidate,
    restoreVersion,
  };
}
