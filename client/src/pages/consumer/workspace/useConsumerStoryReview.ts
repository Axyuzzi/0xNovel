import { useCallback, useEffect, useState } from "react";
import {
  getConsumerPlanningOverview,
  getConsumerStoryCheckpoint,
  getConsumerStoryReview,
  getConsumerStoryReviewEstimate,
  getLatestConsumerStoryReview,
  resolveConsumerStoryReview,
  restoreConsumerPlanningVersion,
  skipConsumerStoryReview,
  startConsumerStoryAdjustment,
  startConsumerStoryReview,
} from "@/api/consumerStoryReview";
import type {
  ConsumerPlanningOverview,
  ConsumerResolveStoryReviewRequest,
  ConsumerStoryCheckpoint,
  ConsumerStoryReviewOperationKind,
  ConsumerStoryReviewSnapshot,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import type { ConsumerCreditEstimate } from "@0xnovelagent/shared/types/consumerSetup";

type EstimateMap = Record<
  ConsumerStoryReviewOperationKind,
  ConsumerCreditEstimate | null
>;

interface UseConsumerStoryReviewOptions {
  novelId: string;
  onError: (message: string) => void;
  onPlanningChanged: () => Promise<void>;
}

export function useConsumerStoryReview({
  novelId,
  onError,
  onPlanningChanged,
}: UseConsumerStoryReviewOptions) {
  const [checkpoint, setCheckpoint] = useState<ConsumerStoryCheckpoint | null>(null);
  const [planning, setPlanning] = useState<ConsumerPlanningOverview | null>(null);
  const [operation, setOperation] = useState<ConsumerStoryReviewSnapshot | null>(null);
  const [estimates, setEstimates] = useState<EstimateMap>({
    review: null,
    adjustment: null,
    transition: null,
  });
  const [busy, setBusy] = useState(false);

  const refreshCheckpoint = useCallback(async () => {
    if (!novelId) return null;
    const nextCheckpoint = await getConsumerStoryCheckpoint(novelId);
    setCheckpoint(nextCheckpoint);
    if (nextCheckpoint.latestOperation) {
      setOperation(nextCheckpoint.latestOperation);
    }
    return nextCheckpoint;
  }, [novelId]);

  const load = useCallback(async () => {
    if (!novelId) return;
    const [nextCheckpoint, nextPlanning, latest, reviewEstimate, adjustmentEstimate, transitionEstimate] =
      await Promise.all([
        getConsumerStoryCheckpoint(novelId),
        getConsumerPlanningOverview(novelId),
        getLatestConsumerStoryReview(novelId),
        getConsumerStoryReviewEstimate("review"),
        getConsumerStoryReviewEstimate("adjustment"),
        getConsumerStoryReviewEstimate("transition"),
      ]);
    setCheckpoint(nextCheckpoint);
    setPlanning(nextPlanning);
    setOperation(nextCheckpoint.latestOperation ?? latest);
    setEstimates({
      review: reviewEstimate,
      adjustment: adjustmentEstimate,
      transition: transitionEstimate,
    });
  }, [novelId]);

  useEffect(() => {
    void load().catch((error) => {
      onError(error instanceof Error ? error.message : "暂时无法读取故事进度。");
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
        const next = await getConsumerStoryReview(novelId, operation.operationId);
        setOperation(next);
        if (!["created", "running"].includes(next.status)) {
          await Promise.all([load(), onPlanningChanged()]);
        }
      } catch (error) {
        onError(error instanceof Error ? error.message : "暂时无法刷新故事检查。");
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 1_000);
    return () => window.clearInterval(timer);
  }, [load, novelId, onError, onPlanningChanged, operation]);

  const startCheckpoint = useCallback(async (action: "review" | "skip") => {
    if (!novelId || !checkpoint?.key) return;
    setBusy(true);
    try {
      const input = {
        requestKey: crypto.randomUUID(),
        checkpointKey: checkpoint.key,
      };
      const next = action === "review"
        ? await startConsumerStoryReview(novelId, input)
        : await skipConsumerStoryReview(novelId, input);
      setOperation(next);
    } finally {
      setBusy(false);
    }
  }, [checkpoint?.key, novelId]);

  const startAdjustment = useCallback(async (instruction: string) => {
    if (!novelId || !planning) return;
    setBusy(true);
    try {
      const next = await startConsumerStoryAdjustment(novelId, {
        requestKey: crypto.randomUUID(),
        instruction,
        expectedPlanningRevision: planning.revision,
      });
      setOperation(next);
    } finally {
      setBusy(false);
    }
  }, [novelId, planning]);

  const resolve = useCallback(async (
    action: ConsumerResolveStoryReviewRequest["action"],
  ) => {
    if (!novelId || !planning || !operation) return;
    setBusy(true);
    try {
      const next = await resolveConsumerStoryReview(
        novelId,
        operation.operationId,
        { action, expectedPlanningRevision: planning.revision },
      );
      setOperation(next);
      await Promise.all([load(), onPlanningChanged()]);
    } finally {
      setBusy(false);
    }
  }, [load, novelId, onPlanningChanged, operation, planning]);

  const restore = useCallback(async (versionId: string) => {
    if (!novelId || !planning) return;
    setBusy(true);
    try {
      const next = await restoreConsumerPlanningVersion(
        novelId,
        versionId,
        planning.revision,
      );
      setPlanning(next);
      await Promise.all([load(), onPlanningChanged()]);
    } finally {
      setBusy(false);
    }
  }, [load, novelId, onPlanningChanged, planning]);

  return {
    checkpoint,
    planning,
    operation,
    estimates,
    busy,
    load,
    startCheckpoint,
    startAdjustment,
    resolve,
    restore,
    refreshCheckpoint,
  };
}
