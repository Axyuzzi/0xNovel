import { useCallback, useEffect, useState } from "react";
import type {
  ConsumerChapterRevisionMode,
  ConsumerChapterRevisionPreset,
  ConsumerChapterRevisionSnapshot,
} from "@0xnovelagent/shared/types/consumerChapterRevision";
import type { ConsumerCreditEstimate } from "@0xnovelagent/shared/types/consumerSetup";
import {
  getConsumerChapterRevision,
  getConsumerChapterRevisionEstimate,
  getLatestConsumerChapterRevision,
  startConsumerChapterRevision,
} from "@/api/consumerChapterRevision";

interface StartRevisionInput {
  mode: ConsumerChapterRevisionMode;
  preset: ConsumerChapterRevisionPreset;
  instruction: string;
  sourceCandidateId?: string;
}

interface UseConsumerChapterRevisionInput {
  novelId: string;
  chapterId: string;
  persistDraft: () => Promise<number>;
  refreshChapter: () => Promise<void>;
  onError: (message: string) => void;
}

export function useConsumerChapterRevision({
  novelId,
  chapterId,
  persistDraft,
  refreshChapter,
  onError,
}: UseConsumerChapterRevisionInput) {
  const [operation, setOperation] = useState<ConsumerChapterRevisionSnapshot | null>(null);
  const [estimates, setEstimates] = useState<Record<
    ConsumerChapterRevisionMode,
    ConsumerCreditEstimate | null
  >>({
    revise: null,
    rewrite: null,
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!novelId || !chapterId) {
      setOperation(null);
      return;
    }
    const [latest, revise, rewrite] = await Promise.all([
      getLatestConsumerChapterRevision(novelId, chapterId),
      getConsumerChapterRevisionEstimate("revise"),
      getConsumerChapterRevisionEstimate("rewrite"),
    ]);
    setOperation(latest);
    setEstimates({ revise, rewrite });
  }, [chapterId, novelId]);

  useEffect(() => {
    void load().catch((error) => {
      onError(error instanceof Error ? error.message : "暂时无法读取 AI 修改状态。");
    });
  }, [load, onError]);

  useEffect(() => {
    if (
      !novelId
      || !operation
      || !["created", "running"].includes(operation.status)
    ) {
      return;
    }
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const next = await getConsumerChapterRevision(novelId, operation.operationId);
        setOperation(next);
        if (!["created", "running"].includes(next.status)) {
          await refreshChapter();
          const nextEstimate = await getConsumerChapterRevisionEstimate(next.mode);
          setEstimates((current) => ({ ...current, [next.mode]: nextEstimate }));
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : "暂时无法刷新 AI 修改状态。");
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 1_000);
    return () => window.clearInterval(timer);
  }, [novelId, onError, operation, refreshChapter]);

  const start = useCallback(async (input: StartRevisionInput) => {
    if (!novelId || !chapterId) return;
    setBusy(true);
    try {
      const expectedRevision = await persistDraft();
      const next = await startConsumerChapterRevision(novelId, chapterId, {
        ...input,
        expectedRevision,
        requestKey: crypto.randomUUID(),
      });
      setOperation(next);
    } finally {
      setBusy(false);
    }
  }, [chapterId, novelId, persistDraft]);

  return {
    operation,
    estimates,
    busy,
    load,
    start,
  };
}
