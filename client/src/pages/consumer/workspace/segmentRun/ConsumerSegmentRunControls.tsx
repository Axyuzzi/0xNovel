import { useEffect, useState } from "react";
import {
  BookOpenText,
  CircleAlert,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import type { ConsumerSegmentRunSnapshot } from "@0xnovelagent/shared/types/consumerSegmentRun";
import type {
  ConsumerCreditEstimate,
  ConsumerCurrentPhasePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import { Button } from "@/components/ui/button";
import { resolveConsumerSegmentRunPosition } from "./segmentRunPosition";

interface ConsumerSegmentRunControlsProps {
  phase: ConsumerCurrentPhasePlan | null;
  currentChapterOrder: number;
  latestChapterOrder: number;
  estimate: ConsumerCreditEstimate | null;
  availableCredits: number | null;
  run: ConsumerSegmentRunSnapshot | null;
  busy: boolean;
  disabled: boolean;
  onWriteNext: () => void;
  onOpenLatestChapter: () => void;
  onStartSegment: () => void;
  onPause: () => void;
  onResume: () => void;
}

const tokenFormat = new Intl.NumberFormat("zh-CN");

function estimateRange(
  estimate: ConsumerCreditEstimate | null,
  chapterCount: number,
): string | null {
  if (!estimate) return null;
  return `${(estimate.minimum * chapterCount).toFixed(3)}–${(
    estimate.maximum * chapterCount
  ).toFixed(3)} 0x积分`;
}

function SegmentProgress({
  run,
  busy,
  onPause,
  onResume,
}: Pick<
  ConsumerSegmentRunControlsProps,
  "run" | "busy" | "onPause" | "onResume"
> & { run: ConsumerSegmentRunSnapshot }) {
  const percentage = Math.round((run.completedChapters / run.totalChapters) * 100);
  const active = ["created", "running", "pausing"].includes(run.status);
  const paused = run.status === "paused";
  const failed = run.status === "failed";
  const completed = run.status === "completed";

  return (
    <div aria-live="polite">
      <p className="text-sm font-semibold text-slate-950">
        {active
          ? `正在写完“${run.phaseName}”`
          : paused
            ? "连续创作已暂停"
            : completed
              ? "这一段已经写完"
              : "这次连续创作不能继续"}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        {active
          ? `正在处理第 ${run.currentChapterOrder ?? run.firstTargetOrder} 章，目标写到第 ${run.phaseEndOrder} 章。`
          : completed
            ? "正在准备阶段检查，完成后会显示下一段规划。"
            : run.errorMessage || `已写到第 ${run.completedThroughOrder} 章。`}
      </p>

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-label="本段创作进度"
        aria-valuemin={0}
        aria-valuemax={run.totalChapters}
        aria-valuenow={run.completedChapters}
      >
        <div
          className="h-full rounded-full bg-slate-900 transition-[width] duration-200 motion-reduce:transition-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-700">
        {run.completedChapters}/{run.totalChapters} 章完成
      </p>

      <div className="mt-4 space-y-1 border-y border-slate-200 py-3 text-xs leading-5 text-slate-600">
        <p>
          本段累计积分：
          {run.actualCredits === null
            ? "正在与中转同步"
            : `${run.actualCredits.toFixed(3)} 0x积分`}
        </p>
        <p>
          本段累计 Token：{tokenFormat.format(run.tokenUsage.totalTokens)}
          {run.tokenUsage.callCount > 0 ? ` · ${run.tokenUsage.callCount} 次调用` : ""}
        </p>
      </div>

      {active ? (
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-11 w-full"
          disabled={busy || run.status === "pausing"}
          onClick={onPause}
        >
          {busy || run.status === "pausing"
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <Pause className="size-4" />}
          {run.status === "pausing" ? "会在本章结束后暂停" : "写完当前章后暂停"}
        </Button>
      ) : paused ? (
        <Button
          type="button"
          className="mt-4 min-h-11 w-full"
          disabled={busy}
          onClick={onResume}
        >
          {busy
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <RotateCcw className="size-4" />}
          {busy ? "正在恢复连续创作…" : "从当前进度继续"}
        </Button>
      ) : failed ? (
        <div className="mt-4 flex gap-2 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-950">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          请查看最新故事规划，再重新选择创作方式。
        </div>
      ) : null}
    </div>
  );
}

export default function ConsumerSegmentRunControls({
  phase,
  currentChapterOrder,
  latestChapterOrder,
  estimate,
  availableCredits,
  run,
  busy,
  disabled,
  onWriteNext,
  onOpenLatestChapter,
  onStartSegment,
  onPause,
  onResume,
}: ConsumerSegmentRunControlsProps) {
  const [confirming, setConfirming] = useState(false);
  const runVisible = Boolean(
    run
    && ["created", "running", "pausing", "paused", "completed", "failed"].includes(run.status)
    && (
      !["completed", "failed"].includes(run.status)
      || phase?.chapterEnd === run.phaseEndOrder
    ),
  );
  const runInProgress = Boolean(
    run && ["created", "running", "pausing", "paused"].includes(run.status),
  );
  const {
    isViewingHistory,
    firstTargetOrder,
    remainingChapters: remaining,
    phaseCompleted,
  } = resolveConsumerSegmentRunPosition({
    phase,
    currentChapterOrder,
    latestChapterOrder,
  });

  useEffect(() => {
    setConfirming(false);
  }, [phase?.chapterEnd, run?.id, run?.status]);

  if (run && runVisible && runInProgress) {
    return (
      <SegmentProgress
        run={run}
        busy={busy}
        onPause={onPause}
        onResume={onResume}
      />
    );
  }

  if (isViewingHistory) {
    return (
      <div>
        <BookOpenText className="size-5 text-slate-700" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-slate-950">
          正在查看第 {currentChapterOrder} 章
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          作品已经写到第 {latestChapterOrder} 章。这里可以继续阅读和修改，
          后续创作请从最新章节接着写。
        </p>
        <Button
          type="button"
          className="mt-5 w-full"
          onClick={onOpenLatestChapter}
        >
          回到第 {latestChapterOrder} 章继续
        </Button>
      </div>
    );
  }

  if (run && runVisible) {
    return (
      <SegmentProgress
        run={run}
        busy={busy}
        onPause={onPause}
        onResume={onResume}
      />
    );
  }

  if (phaseCompleted) {
    return (
      <div aria-live="polite">
        <p className="text-sm font-semibold text-slate-950">这一段已经写完</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          已写到第 {latestChapterOrder} 章。接下来会进入阶段检查，
          或在确认后准备下一段故事规划。
        </p>
      </div>
    );
  }

  if (!phase || remaining <= 0) {
    return (
      <Button
        className="w-full"
        disabled={busy || disabled}
        onClick={onWriteNext}
      >
        {busy
          ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          : <Play className="size-4" />}
        继续下一章
      </Button>
    );
  }

  if (confirming) {
    const totalEstimate = estimateRange(estimate, remaining);
    return (
      <div>
        <p className="text-sm font-semibold text-slate-950">确认写完这一段</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          将依次创作第 {firstTargetOrder}～{phase.chapterEnd} 章，共 {remaining} 章。
          每章单独保存和计费，可在当前章结束后暂停。
        </p>
        <div className="mt-4 border-y border-slate-200 py-3 text-xs leading-5 text-slate-600">
          <p>
            当前余额：
            {availableCredits === null
              ? "暂时无法读取"
              : `${availableCredits.toFixed(3)} 0x积分`}
          </p>
          <p>
            费用参考：{totalEstimate ?? "暂无同类历史，按每章实际用量计费"}
          </p>
        </div>
        <Button
          className="mt-4 w-full"
          disabled={busy || disabled}
          onClick={onStartSegment}
        >
          {busy
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <Play className="size-4" />}
          开始写第 {firstTargetOrder}～{phase.chapterEnd} 章
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          返回
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm font-semibold text-slate-950">下一段规划已准备好</p>
      <p className="mt-2 text-xs font-medium text-slate-800">
        第 {Math.max(phase.chapterStart, firstTargetOrder)}～{phase.chapterEnd} 章 · {phase.name}
      </p>
      <p className="mt-2 text-xs leading-5 text-slate-600">{phase.objective}</p>
      <Button
        className="mt-5 w-full"
        disabled={busy || disabled}
        onClick={() => setConfirming(true)}
      >
        <Play className="size-4" />
        写完这一段（还剩 {remaining} 章）
      </Button>
      <Button
        type="button"
        variant="outline"
        className="mt-2 w-full"
        disabled={busy || disabled}
        onClick={onWriteNext}
      >
        只写第 {firstTargetOrder} 章
      </Button>
    </div>
  );
}
