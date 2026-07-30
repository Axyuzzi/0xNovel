import type { ConsumerCurrentPhasePlan } from "@0xnovelagent/shared/types/consumerSetup";
import type { ConsumerChapterSummary } from "@0xnovelagent/shared/types/consumerWorkspace";

export interface ConsumerSegmentRunPosition {
  isViewingHistory: boolean;
  firstTargetOrder: number;
  remainingChapters: number;
  phaseCompleted: boolean;
}

export function findLatestConsumerChapter(
  chapters: ConsumerChapterSummary[],
): ConsumerChapterSummary | null {
  return chapters.reduce<ConsumerChapterSummary | null>(
    (latest, chapter) => !latest || chapter.order > latest.order ? chapter : latest,
    null,
  );
}

export function resolveConsumerSegmentRunPosition(input: {
  phase: ConsumerCurrentPhasePlan | null;
  currentChapterOrder: number;
  latestChapterOrder: number;
}): ConsumerSegmentRunPosition {
  const latestChapterOrder = Math.max(
    input.currentChapterOrder,
    input.latestChapterOrder,
  );
  const firstTargetOrder = latestChapterOrder + 1;
  const remainingChapters = input.phase
    ? Math.max(0, input.phase.chapterEnd - latestChapterOrder)
    : 0;

  return {
    isViewingHistory: input.currentChapterOrder < latestChapterOrder,
    firstTargetOrder,
    remainingChapters,
    phaseCompleted: Boolean(
      input.phase && latestChapterOrder >= input.phase.chapterEnd,
    ),
  };
}
