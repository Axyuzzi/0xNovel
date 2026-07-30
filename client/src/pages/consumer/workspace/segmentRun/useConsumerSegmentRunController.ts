import { useEffect, useRef } from "react";
import type {
  ConsumerPlanningOverview,
  ConsumerStoryCheckpoint,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import { useConsumerSegmentRun } from "./useConsumerSegmentRun";

interface UseConsumerSegmentRunControllerOptions {
  novelId: string;
  chapterId: string;
  planning: ConsumerPlanningOverview | null;
  persistDraft: () => Promise<number>;
  loadNovel: () => Promise<void>;
  loadChapter: () => Promise<void>;
  loadProduction: () => Promise<void>;
  refreshCheckpoint: () => Promise<ConsumerStoryCheckpoint | null>;
  navigateToChapter: (chapterId: string) => void;
  onError: (message: string) => void;
}

export function useConsumerSegmentRunController({
  novelId,
  chapterId,
  planning,
  persistDraft,
  loadNovel,
  loadChapter,
  loadProduction,
  refreshCheckpoint,
  navigateToChapter,
  onError,
}: UseConsumerSegmentRunControllerOptions) {
  const workflow = useConsumerSegmentRun({ novelId, onError });
  const lastOpenedChapterRef = useRef("");

  useEffect(() => {
    const run = workflow.run;
    if (
      !run?.currentChapterId
      || !["created", "running", "pausing", "paused"].includes(run.status)
      || lastOpenedChapterRef.current === run.currentChapterId
    ) {
      return;
    }
    const shouldFollowProgress = chapterId === run.sourceChapterId
      || chapterId === lastOpenedChapterRef.current;
    lastOpenedChapterRef.current = run.currentChapterId;
    if (!shouldFollowProgress) return;
    void loadNovel()
      .then(() => navigateToChapter(run.currentChapterId!))
      .catch((error) => {
        onError(error instanceof Error ? error.message : "暂时无法打开正在创作的章节。");
      });
  }, [chapterId, loadNovel, navigateToChapter, onError, workflow.run]);

  useEffect(() => {
    if (workflow.run?.status !== "completed") return;
    void Promise.all([
      loadNovel(),
      loadChapter(),
      loadProduction(),
      refreshCheckpoint(),
    ]).catch((error) => {
      onError(error instanceof Error ? error.message : "这一段已完成，但下一步暂时没有刷新。");
    });
  }, [
    loadChapter,
    loadNovel,
    loadProduction,
    onError,
    refreshCheckpoint,
    workflow.run?.id,
    workflow.run?.status,
  ]);

  const start = async () => {
    if (!novelId || !chapterId || !planning) return;
    onError("");
    try {
      const expectedRevision = await persistDraft();
      await workflow.start({
        sourceChapterId: chapterId,
        expectedRevision,
        expectedPlanningRevision: planning.revision,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "连续创作没有开始，请重试。");
      await workflow.load().catch(() => undefined);
    }
  };

  const pause = async () => {
    onError("");
    try {
      await workflow.pause();
    } catch (error) {
      onError(error instanceof Error ? error.message : "暂时无法暂停连续创作。");
    }
  };

  const resume = async () => {
    onError("");
    try {
      await workflow.resume();
    } catch (error) {
      onError(error instanceof Error ? error.message : "暂时无法继续这一段。");
      await workflow.load().catch(() => undefined);
    }
  };

  return {
    ...workflow,
    start,
    pause,
    resume,
  };
}
