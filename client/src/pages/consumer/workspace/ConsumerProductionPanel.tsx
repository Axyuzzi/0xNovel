import type { ConsumerChapterProductionSnapshot } from "@0xnovelagent/shared/types/consumerChapterProduction";
import type { ConsumerSegmentRunSnapshot } from "@0xnovelagent/shared/types/consumerSegmentRun";
import type {
  ConsumerCreditEstimate,
  ConsumerCurrentPhasePlan,
} from "@0xnovelagent/shared/types/consumerSetup";
import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  MoreHorizontal,
  PenLine,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ConsumerSegmentRunControls from "./segmentRun/ConsumerSegmentRunControls";

interface ConsumerProductionPanelProps {
  production: ConsumerChapterProductionSnapshot | null;
  estimate: ConsumerCreditEstimate | null;
  progress: ConsumerChapterProductionSnapshot[];
  currentPhase: ConsumerCurrentPhasePlan | null;
  currentChapterOrder: number;
  latestChapterOrder: number;
  availableCredits: number | null;
  segmentRun: ConsumerSegmentRunSnapshot | null;
  segmentBusy: boolean;
  busy: boolean;
  saveBlocked: boolean;
  hasContent: boolean;
  onContinueNext: () => void;
  onOpenLatestChapter: () => void;
  onStartSegment: () => void;
  onPauseSegment: () => void;
  onResumeSegment: () => void;
  onResume: () => void;
  onOpenRevision: (mode: "revise" | "rewrite") => void;
}

function stageText(production: ConsumerChapterProductionSnapshot): string {
  if (production.stage === "preparing_task") return "正在安排下一章内容";
  if (production.stage === "continuing") return "正在接着已有正文写";
  return "正在写下一章";
}

function costText(production: ConsumerChapterProductionSnapshot): string | null {
  return production.actualCredits === null || production.actualCredits <= 0
    ? null
    : `${production.actualCredits.toFixed(3)} 0x积分`;
}

function chapterTotalText(production: ConsumerChapterProductionSnapshot): string | null {
  return production.chapterTotalCredits === null || production.chapterTotalCredits <= 0
    ? null
    : `${production.chapterTotalCredits.toFixed(3)} 0x积分`;
}

const tokenNumberFormat = new Intl.NumberFormat("zh-CN");

function tokenText(production: ConsumerChapterProductionSnapshot): string | null {
  return production.tokenUsage.totalTokens > 0
    ? `${tokenNumberFormat.format(production.tokenUsage.totalTokens)} Token`
    : null;
}

function ChapterUsageSummary({
  production,
}: {
  production: ConsumerChapterProductionSnapshot;
}) {
  const usage = production.chapterTokenUsage;
  const totalCredits = chapterTotalText(production);
  return (
    <div className="mt-1 space-y-1 text-xs leading-5">
      {totalCredits ? (
        <p>本章累计消耗 {totalCredits}</p>
      ) : (
        <p>实际积分正在与中转同步，请以账户消费记录为准。</p>
      )}
      {usage.totalTokens > 0 ? (
        <>
          <p className="font-medium">
            本章累计使用 {tokenNumberFormat.format(usage.totalTokens)} Token
          </p>
          <p className="text-emerald-900/75">
            输入 {tokenNumberFormat.format(usage.promptTokens)}
            {" · "}
            输出 {tokenNumberFormat.format(usage.completionTokens)}
            {" · "}
            {usage.callCount} 次模型调用
          </p>
        </>
      ) : (
        <p className="text-emerald-900/75">Token 用量正在统计。</p>
      )}
      {production.length ? (
        <p className="font-medium">
          本章约 {tokenNumberFormat.format(production.length.characterCount)} 字
          <span className="font-normal text-emerald-900/75">
            {" · "}
            建议 {tokenNumberFormat.format(production.length.minimumCharacters)}
            —
            {tokenNumberFormat.format(production.length.maximumCharacters)} 字
          </span>
        </p>
      ) : null}
      {production.qualityWarnings.length > 0 ? (
        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
          <p className="font-medium">有 {production.qualityWarnings.length} 项表达建议，不影响继续创作</p>
          {production.qualityWarnings.map((warning) => (
            <p key={warning.code} className="mt-1 text-amber-900/80">
              {warning.message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EstimateText({ estimate }: { estimate: ConsumerCreditEstimate | null }) {
  if (!estimate) {
    return (
      <p className="text-xs leading-5 text-slate-600">
        暂无同类历史记录。生成会按实际模型用量扣费，点击按钮只授权下一章。
      </p>
    );
  }
  return (
    <p className="text-xs leading-5 text-slate-600">
      参考最近 {estimate.sampleSize} 次，通常消耗{" "}
      <strong className="font-semibold text-slate-900">
        {estimate.minimum.toFixed(3)}–{estimate.maximum.toFixed(3)} 0x积分
      </strong>
      ，实际以本次用量为准。
    </p>
  );
}

function ProgressHistory({ progress }: { progress: ConsumerChapterProductionSnapshot[] }) {
  return (
    <details className="border-t border-slate-200 pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md text-sm font-medium text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-900">
        创作进度
        <ChevronDown aria-hidden="true" className="size-4" />
      </summary>
      {progress.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-slate-600">生成下一章后会在这里留下记录。</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {progress.slice(0, 8).map((item) => (
            <li key={item.operationId} className="text-xs leading-5">
              <p className="font-medium text-slate-800">
                {item.status === "succeeded"
                  ? "章节正文已保存"
                  : item.status === "running" || item.status === "created"
                    ? "章节正在生成"
                    : item.status === "outcome_unknown"
                      ? "生成结果无法确认"
                      : "生成中断"}
              </p>
              <p className="text-slate-600">
                {new Intl.DateTimeFormat("zh-CN", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(item.updatedAt))}
                {costText(item) ? ` · ${costText(item)}` : ""}
                {tokenText(item) ? ` · ${tokenText(item)}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}

export default function ConsumerProductionPanel({
  production,
  estimate,
  progress,
  currentPhase,
  currentChapterOrder,
  latestChapterOrder,
  availableCredits,
  segmentRun,
  segmentBusy,
  busy,
  saveBlocked,
  hasContent,
  onContinueNext,
  onOpenLatestChapter,
  onStartSegment,
  onPauseSegment,
  onResumeSegment,
  onResume,
  onOpenRevision,
}: ConsumerProductionPanelProps) {
  const active = production?.status === "created" || production?.status === "running";
  const recoverable = production?.status === "failed" || production?.status === "outcome_unknown";
  const segmentVisible = Boolean(
    segmentRun
    && ["created", "running", "pausing", "paused", "completed", "failed"].includes(segmentRun.status)
    && (
      !["completed", "failed"].includes(segmentRun.status)
      || currentPhase?.chapterEnd === segmentRun.phaseEndOrder
    ),
  );

  return (
    <aside className="w-full shrink-0 border-t border-slate-200 bg-slate-50/70 lg:w-80 lg:border-l lg:border-t-0">
      <div className="flex h-full flex-col overflow-y-auto p-5">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-slate-950">下一步</h3>

          {segmentVisible ? (
            <div className="mt-5">
              <ConsumerSegmentRunControls
                phase={currentPhase}
                currentChapterOrder={currentChapterOrder}
                latestChapterOrder={latestChapterOrder}
                estimate={estimate}
                availableCredits={availableCredits}
                run={segmentRun}
                busy={segmentBusy}
                disabled={saveBlocked || !hasContent}
                onWriteNext={onContinueNext}
                onOpenLatestChapter={onOpenLatestChapter}
                onStartSegment={onStartSegment}
                onPause={onPauseSegment}
                onResume={onResumeSegment}
              />
            </div>
          ) : active && production ? (
            <div className="mt-5" aria-live="polite">
              <LoaderCircle
                aria-hidden="true"
                className="size-5 animate-spin text-slate-700 motion-reduce:animate-none"
              />
              <p className="mt-3 text-sm font-medium text-slate-950">{stageText(production)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                收到的正文会持续保存到本机。生成完成后可以直接阅读和修改。
              </p>
              {production.chapterTokenUsage.totalTokens > 0 ? (
                <p className="mt-3 text-xs font-medium text-slate-700">
                  已使用 {tokenNumberFormat.format(production.chapterTokenUsage.totalTokens)} Token
                </p>
              ) : null}
            </div>
          ) : null}

          {!segmentVisible && recoverable && production ? (
            <div className="mt-5">
              <AlertCircle aria-hidden="true" className="size-5 text-amber-800" />
              <p className="mt-3 text-sm font-semibold text-slate-950">
                {production.status === "outcome_unknown" ? "上一次结果无法确认" : "章节生成中断"}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-700">
                {production.errorMessage || "收到的正文保存在编辑器中。"}
              </p>
              <Button
                className="mt-5 w-full"
                disabled={busy || saveBlocked}
                onClick={onResume}
              >
                {busy
                  ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  : <RefreshCw aria-hidden="true" className="size-4" />}
                {hasContent ? "从现有正文继续" : "重新生成这一章"}
              </Button>
              <Button asChild variant="ghost" className="mt-2 w-full">
                <Link to="/account">
                  <WalletCards aria-hidden="true" className="size-4" />
                  查看余额与充值
                </Link>
              </Button>
            </div>
          ) : null}

          {!segmentVisible && !active && !recoverable ? (
            <div className="mt-5">
              {production?.status === "succeeded" ? (
                <div className="mb-5 flex gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-emerald-950">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">本章正文生成完成</p>
                    <ChapterUsageSummary production={production} />
                  </div>
                </div>
              ) : null}
              <ConsumerSegmentRunControls
                phase={currentPhase}
                currentChapterOrder={currentChapterOrder}
                latestChapterOrder={latestChapterOrder}
                estimate={estimate}
                availableCredits={availableCredits}
                run={segmentRun}
                busy={busy || segmentBusy}
                disabled={saveBlocked || !hasContent}
                onWriteNext={onContinueNext}
                onOpenLatestChapter={onOpenLatestChapter}
                onStartSegment={onStartSegment}
                onPause={onPauseSegment}
                onResume={onResumeSegment}
              />
              <div className="mt-4">
                <EstimateText estimate={estimate} />
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-2 w-full"
                disabled={busy || saveBlocked || !hasContent}
                onClick={() => onOpenRevision("revise")}
              >
                <PenLine aria-hidden="true" className="size-4" />
                AI 帮我改
              </Button>
              <details className="mt-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 rounded-md text-xs font-medium text-slate-600 outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-900">
                  <MoreHorizontal aria-hidden="true" className="size-4" />
                  更多
                </summary>
                <Button
                  type="button"
                  variant="ghost"
                  className="mt-1 w-full"
                  disabled={busy || saveBlocked || !hasContent}
                  onClick={() => onOpenRevision("rewrite")}
                >
                  重新生成整章
                </Button>
              </details>
            </div>
          ) : null}
        </div>

        <div className="mt-7">
          <ProgressHistory progress={progress} />
        </div>
      </div>
    </aside>
  );
}
