import { useCallback, useEffect, useState } from "react";
import {
  getConsumerSegmentRun,
  getLatestConsumerSegmentRun,
  pauseConsumerSegmentRun,
  resumeConsumerSegmentRun,
  startConsumerSegmentRun,
} from "@/api/consumerSegmentRun";
import type { ConsumerSegmentRunSnapshot } from "@0xnovelagent/shared/types/consumerSegmentRun";

interface UseConsumerSegmentRunOptions {
  novelId: string;
  onError: (message: string) => void;
}

export function useConsumerSegmentRun({
  novelId,
  onError,
}: UseConsumerSegmentRunOptions) {
  const [run, setRun] = useState<ConsumerSegmentRunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!novelId) {
      setRun(null);
      return null;
    }
    const next = await getLatestConsumerSegmentRun(novelId);
    setRun(next);
    return next;
  }, [novelId]);

  useEffect(() => {
    void load().catch((error) => {
      onError(error instanceof Error ? error.message : "暂时无法读取连续创作进度。");
    });
  }, [load, onError]);

  useEffect(() => {
    if (!novelId || !run || !["created", "running", "pausing"].includes(run.status)) {
      return;
    }
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        setRun(await getConsumerSegmentRun(novelId, run.id));
      } catch (error) {
        onError(error instanceof Error ? error.message : "暂时无法刷新连续创作进度。");
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 500);
    return () => window.clearInterval(timer);
  }, [novelId, onError, run?.id, run?.status]);

  const start = useCallback(async (input: {
    sourceChapterId: string;
    expectedRevision: number;
    expectedPlanningRevision: number;
  }) => {
    if (!novelId) return null;
    setBusy(true);
    try {
      const next = await startConsumerSegmentRun(novelId, {
        ...input,
        requestKey: crypto.randomUUID(),
      });
      setRun(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [novelId]);

  const pause = useCallback(async () => {
    if (!novelId || !run) return null;
    setBusy(true);
    try {
      const next = await pauseConsumerSegmentRun(novelId, run.id);
      setRun(next);
      return next;
    } finally {
      setBusy(false);
    }
  }, [novelId, run]);

  const resume = useCallback(async () => {
    if (!novelId || !run) return null;
    setBusy(true);
    try {
      const next = await resumeConsumerSegmentRun(novelId, run.id);
      setRun(next);
      if (next.status === "paused") {
        throw new Error(
          next.errorMessage || "连续创作仍处于暂停状态，请稍后重试。",
        );
      }
      return next;
    } finally {
      setBusy(false);
    }
  }, [novelId, run]);

  return {
    run,
    busy,
    load,
    start,
    pause,
    resume,
  };
}
