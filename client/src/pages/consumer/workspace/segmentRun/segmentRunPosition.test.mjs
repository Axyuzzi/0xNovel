import assert from "node:assert/strict";
import test from "node:test";
import {
  findLatestConsumerChapter,
  resolveConsumerSegmentRunPosition,
} from "./segmentRunPosition.ts";

const phase = {
  name: "当前剧情阶段",
  chapterStart: 1,
  chapterEnd: 24,
  objective: "完成当前阶段。",
  openingState: "故事开始。",
  beats: [{ order: 1, event: "事件", purpose: "推进" }],
  characterChanges: ["人物发生变化。"],
  endingState: "阶段完成。",
};

test("segment progress follows the latest chapter instead of the chapter being viewed", () => {
  assert.deepEqual(
    resolveConsumerSegmentRunPosition({
      phase,
      currentChapterOrder: 1,
      latestChapterOrder: 6,
    }),
    {
      isViewingHistory: true,
      firstTargetOrder: 7,
      remainingChapters: 18,
      phaseCompleted: false,
    },
  );
});

test("latest chapter selection does not depend on API array order", () => {
  const latest = findLatestConsumerChapter([
    { id: "chapter-6", novelId: "novel", title: "第六章", order: 6, content: "", wordCount: 0, updatedAt: "2026-07-30T00:00:00.000Z", createdAt: "2026-07-30T00:00:00.000Z" },
    { id: "chapter-1", novelId: "novel", title: "第一章", order: 1, content: "", wordCount: 0, updatedAt: "2026-07-30T00:00:00.000Z", createdAt: "2026-07-30T00:00:00.000Z" },
  ]);

  assert.equal(latest?.id, "chapter-6");
});

test("a finished phase stays finished while an older chapter is being viewed", () => {
  const position = resolveConsumerSegmentRunPosition({
    phase,
    currentChapterOrder: 1,
    latestChapterOrder: 24,
  });

  assert.equal(position.isViewingHistory, true);
  assert.equal(position.remainingChapters, 0);
  assert.equal(position.phaseCompleted, true);
});

test("segment progress starts after the latest chapter", () => {
  assert.deepEqual(
    resolveConsumerSegmentRunPosition({
      phase,
      currentChapterOrder: 6,
      latestChapterOrder: 6,
    }),
    {
      isViewingHistory: false,
      firstTargetOrder: 7,
      remainingChapters: 18,
      phaseCompleted: false,
    },
  );
});
