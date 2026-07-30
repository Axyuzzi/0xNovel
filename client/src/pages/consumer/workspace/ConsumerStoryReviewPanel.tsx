import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type {
  ConsumerStoryCheckpoint,
  ConsumerStoryReviewSnapshot,
} from "@0xnovelagent/shared/types/consumerStoryReview";
import type { ConsumerCreditEstimate } from "@0xnovelagent/shared/types/consumerSetup";
import { Button } from "@/components/ui/button";

interface ConsumerStoryReviewPanelProps {
  checkpoint: ConsumerStoryCheckpoint | null;
  operation: ConsumerStoryReviewSnapshot | null;
  reviewEstimate: ConsumerCreditEstimate | null;
  adjustmentEstimate: ConsumerCreditEstimate | null;
  transitionEstimate: ConsumerCreditEstimate | null;
  busy: boolean;
  adjustmentMode: boolean;
  onClose: () => void;
  onStartCheckpoint: (action: "review" | "skip") => Promise<void>;
  onStartAdjustment: (instruction: string) => Promise<void>;
  onResolve: (
    action: "apply_recommendation" | "continue_without_changes" | "reject",
  ) => Promise<void>;
}

function estimateCopy(estimate: ConsumerCreditEstimate | null): string {
  if (!estimate) return "首次同类操作按实际用量计费";
  return `最近 ${estimate.sampleSize} 次通常约 ${estimate.typical.toFixed(3)} 0x积分`;
}

function actualCost(operation: ConsumerStoryReviewSnapshot): string | null {
  return operation.actualCredits === null
    ? null
    : `本次实际使用 ${operation.actualCredits.toFixed(3)} 0x积分`;
}

function ResultView(props: {
  operation: ConsumerStoryReviewSnapshot;
  busy: boolean;
  onResolve: ConsumerStoryReviewPanelProps["onResolve"];
}) {
  const { operation, busy, onResolve } = props;
  const report = operation.report;
  if (!report) return null;
  const adjustment = operation.kind === "adjustment";
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-slate-600">整体结论</p>
        <p className="mt-2 text-sm leading-6 text-slate-900">{report.conclusion}</p>
      </div>
      {report.affectedLocations.length ? (
        <div>
          <p className="text-xs font-medium text-slate-600">具体影响位置</p>
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-800">
            {report.affectedLocations.map((location) => (
              <li key={location}>· {location}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="rounded-xl bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-950">
          <ShieldCheck className="size-4" />
          已有内容保持不变
        </p>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-emerald-900">
          {report.preserved.map((item) => <li key={item}>· {item}</li>)}
        </ul>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-600">推荐怎么继续</p>
        <p className="mt-2 text-sm leading-6 text-slate-900">{report.recommendedAction}</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">
          影响范围：{report.impactLevel === "high" ? "较大" : report.impactLevel === "medium" ? "适中" : "较小"}
          ，采用前不会改变当前规划。
        </p>
      </div>
      {actualCost(operation) ? (
        <p className="text-xs text-slate-600">{actualCost(operation)}</p>
      ) : null}
      <div className="space-y-2">
        <Button
          className="min-h-11 w-full"
          disabled={busy}
          onClick={() => void onResolve("apply_recommendation")}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
          采用推荐方案
        </Button>
        <Button
          variant="outline"
          className="min-h-11 w-full"
          disabled={busy}
          onClick={() => void onResolve(
            adjustment ? "reject" : "continue_without_changes",
          )}
        >
          {adjustment ? "不调整，保留现有规划" : "按原规划进入下一段"}
        </Button>
      </div>
    </div>
  );
}

export default function ConsumerStoryReviewPanel({
  checkpoint,
  operation,
  reviewEstimate,
  adjustmentEstimate,
  transitionEstimate,
  busy,
  adjustmentMode,
  onClose,
  onStartCheckpoint,
  onStartAdjustment,
  onResolve,
}: ConsumerStoryReviewPanelProps) {
  const [instruction, setInstruction] = useState("");
  useEffect(() => {
    if (operation?.kind === "adjustment" && operation.instruction) {
      setInstruction(operation.instruction);
    }
  }, [operation]);

  const active = operation
    && operation.stage !== "completed"
    && (
      operation.kind === "adjustment"
        ? adjustmentMode
        : checkpoint?.key === operation.checkpointKey
    )
      ? operation
      : null;
  const decisionRequired = Boolean(
    active
    && (
      ["created", "running"].includes(active.status)
      || active.status === "succeeded" && active.stage === "awaiting_confirmation"
    ),
  );

  const submitAdjustment = async (event: FormEvent) => {
    event.preventDefault();
    if (instruction.trim()) await onStartAdjustment(instruction.trim());
  };

  return (
    <aside className="w-full shrink-0 border-t border-slate-200 bg-slate-50/80 px-5 py-6 lg:w-[23rem] lg:overflow-y-auto lg:border-l lg:border-t-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">
            {checkpoint?.required ? checkpoint.title : "调整后续剧情"}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            已完成章节会保持不变，只处理后续内容。
          </p>
        </div>
        {!checkpoint?.required && !decisionRequired ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label="关闭"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="mt-6">
        {active && ["created", "running"].includes(active.status) ? (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-5">
            <LoaderCircle className="size-5 animate-spin text-slate-700 motion-reduce:animate-none" />
            <p className="mt-4 text-sm font-medium text-slate-950">
              {active.kind === "transition" ? "正在准备下一段剧情" : "正在整理推荐方案"}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              当前正文和规划不会在结果返回前改变，请稍候。
            </p>
          </div>
        ) : active && ["failed", "outcome_unknown"].includes(active.status) ? (
          <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <CircleAlert className="size-5 text-amber-800" />
            <p className="mt-3 text-sm font-medium text-amber-950">
              {active.status === "outcome_unknown" ? "结果仍在确认" : "这次操作没有完成"}
            </p>
            <p className="mt-2 text-xs leading-5 text-amber-900">
              {active.errorMessage || "现有正文和规划没有改变。重新开始会产生新的消费。"}
            </p>
            {actualCost(active) ? <p className="mt-2 text-xs text-amber-900">{actualCost(active)}</p> : null}
          </div>
        ) : active?.status === "succeeded" && active.stage === "awaiting_confirmation" ? (
          <ResultView operation={active} busy={busy} onResolve={onResolve} />
        ) : checkpoint?.required ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <Sparkles className="size-5 text-slate-700" />
              <p className="mt-3 text-sm font-medium text-slate-950">检查后继续</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                检查这一段的连贯性、人物、节奏和伏笔，只给一套推荐方案。
              </p>
              <p className="mt-3 text-xs text-slate-600">{estimateCopy(reviewEstimate)}</p>
              <Button
                className="mt-4 min-h-11 w-full"
                disabled={busy}
                onClick={() => void onStartCheckpoint("review")}
              >
                检查这一段剧情
              </Button>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-sm font-medium text-slate-950">暂不检查</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                跳过深度检查，只生成下一段必要规划，不会伪装成错误。
              </p>
              <p className="mt-3 text-xs text-slate-600">{estimateCopy(transitionEstimate)}</p>
              <Button
                variant="outline"
                className="mt-4 min-h-11 w-full"
                disabled={busy}
                onClick={() => void onStartCheckpoint("skip")}
              >
                跳过检查，直接继续
              </Button>
            </div>
          </div>
        ) : operation?.stage === "completed"
          && operation.kind === "adjustment"
          && adjustmentMode ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <CheckCircle2 className="size-5 text-emerald-800" />
            <p className="mt-3 text-sm font-medium text-emerald-950">后续规划已经处理</p>
            <p className="mt-2 text-xs leading-5 text-emerald-900">
              已完成章节没有改变，可以返回正文继续创作。
            </p>
            <Button variant="outline" className="mt-4 min-h-11 w-full" onClick={onClose}>
              返回正文
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void submitAdjustment(event)}>
            <label htmlFor="story-adjustment" className="text-sm font-medium text-slate-900">
              接下来想怎么改？
            </label>
            <textarea
              id="story-adjustment"
              value={instruction}
              maxLength={2_000}
              rows={7}
              className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
              placeholder="例如：我想让主角暂时放弃调查，但保留已经发生的救援。"
              onChange={(event) => setInstruction(event.target.value)}
            />
            <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-950">
              系统会先判断影响范围并给出方案。采用前不改变规划，也不会改写已完成章节。
            </div>
            <p className="mt-3 text-xs text-slate-600">{estimateCopy(adjustmentEstimate)}</p>
            <Button
              type="submit"
              className="mt-4 min-h-11 w-full"
              disabled={busy || !instruction.trim()}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
              查看调整方案
            </Button>
          </form>
        )}

      </div>
    </aside>
  );
}
