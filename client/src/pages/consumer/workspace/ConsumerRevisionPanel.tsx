import { useEffect, useMemo, useState } from "react";
import type {
  ConsumerChapterRevisionMode,
  ConsumerChapterRevisionPreset,
  ConsumerChapterRevisionSnapshot,
} from "@0xnovelagent/shared/types/consumerChapterRevision";
import type { ConsumerCreditEstimate } from "@0xnovelagent/shared/types/consumerSetup";
import type { ConsumerChapterCandidate } from "@0xnovelagent/shared/types/consumerWorkspace";
import {
  ArrowLeft,
  Check,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const PRESETS: Array<{
  value: Exclude<ConsumerChapterRevisionPreset, "custom">;
  label: string;
  instruction: string;
}> = [
  {
    value: "natural_language",
    label: "语言更自然",
    instruction: "让语言和对话更自然流畅，减少生硬解释，保持情节和人物状态不变。",
  },
  {
    value: "stronger_emotion",
    label: "情绪更有感染力",
    instruction: "增强人物当下的情绪和场景感染力，用行动与细节表达，保持核心事件不变。",
  },
  {
    value: "tighter_pacing",
    label: "节奏更紧凑",
    instruction: "删减重复和拖沓表达，让冲突推进更紧凑，保持必要事件和章末承接不变。",
  },
];

interface GenerateRevisionInput {
  mode: ConsumerChapterRevisionMode;
  preset: ConsumerChapterRevisionPreset;
  instruction: string;
  sourceCandidateId?: string;
}

interface ConsumerRevisionPanelProps {
  mode: ConsumerChapterRevisionMode;
  operation: ConsumerChapterRevisionSnapshot | null;
  estimate: ConsumerCreditEstimate | null;
  candidates: ConsumerChapterCandidate[];
  activeCandidateId: string;
  busy: boolean;
  onClose: () => void;
  onSelectCandidate: (candidateId: string) => void;
  onGenerate: (input: GenerateRevisionInput) => Promise<void>;
  onAdopt: (candidateId: string) => Promise<void>;
  onReject: (candidateId: string) => Promise<void>;
}

function estimateText(estimate: ConsumerCreditEstimate | null): string {
  if (!estimate) return "暂无同类历史记录，本次按实际模型用量扣费。";
  return `参考最近 ${estimate.sampleSize} 次，通常消耗 ${estimate.minimum.toFixed(3)}–${estimate.maximum.toFixed(3)} 0x积分。`;
}

export default function ConsumerRevisionPanel({
  mode,
  operation,
  estimate,
  candidates,
  activeCandidateId,
  busy,
  onClose,
  onSelectCandidate,
  onGenerate,
  onAdopt,
  onReject,
}: ConsumerRevisionPanelProps) {
  const activeCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === activeCandidateId) ?? candidates[0] ?? null,
    [activeCandidateId, candidates],
  );
  const [preset, setPreset] = useState<ConsumerChapterRevisionPreset>(
    mode === "rewrite" ? "custom" : "natural_language",
  );
  const [instruction, setInstruction] = useState(
    mode === "rewrite"
      ? "保留本章核心事件、人物初始状态和章末结果，重新组织场景、行动、对话和节奏。"
      : PRESETS[0].instruction,
  );
  const [adjustingCandidateId, setAdjustingCandidateId] = useState("");

  useEffect(() => {
    setAdjustingCandidateId("");
    if (mode === "rewrite") {
      setPreset("custom");
      setInstruction("保留本章核心事件、人物初始状态和章末结果，重新组织场景、行动、对话和节奏。");
    } else {
      setPreset("natural_language");
      setInstruction(PRESETS[0].instruction);
    }
  }, [mode]);

  const active = operation?.status === "created" || operation?.status === "running";
  const failed = operation?.status === "failed" || operation?.status === "outcome_unknown";
  const showCandidate = Boolean(activeCandidate && !adjustingCandidateId && !active);
  const formMode = adjustingCandidateId ? "revise" : mode;

  return (
    <aside className="w-full shrink-0 border-t border-slate-200 bg-slate-50/70 lg:w-80 lg:border-l lg:border-t-0">
      <div className="flex h-full flex-col overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">
              {showCandidate
                ? "修改建议"
                : formMode === "rewrite"
                  ? "重新生成整章"
                  : adjustingCandidateId
                    ? "继续调整"
                    : "AI 帮我改"}
            </h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {showCandidate
                ? "原正文没有改变。"
                : "生成会产生新的 AI 消费，结果先作为候选稿保存。"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label="返回章节下一步"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        {active ? (
          <div className="mt-8" aria-live="polite">
            <LoaderCircle className="size-5 animate-spin text-slate-700 motion-reduce:animate-none" />
            <p className="mt-3 text-sm font-medium text-slate-950">
              {operation?.mode === "rewrite" ? "正在重新创作这一章" : "正在生成修改建议"}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600">
              当前正文不会被覆盖。完成后再由你决定是否采用。
            </p>
          </div>
        ) : null}

        {showCandidate && activeCandidate ? (
          <div className="mt-6">
            {candidates.length > 1 ? (
              <div className="mb-5">
                <p className="text-xs font-medium text-slate-700">待选择的修改建议</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {candidates.map((candidate, index) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`min-h-10 rounded-md px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                        candidate.id === activeCandidate.id
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300"
                      }`}
                      onClick={() => onSelectCandidate(candidate.id)}
                    >
                      建议 {candidates.length - index}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-emerald-950">
              <div className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0" />
                <div>
                  <p className="text-sm font-medium">修改稿已准备好</p>
                  {operation?.resultCandidateId === activeCandidate.id
                    && operation.actualCredits !== null ? (
                      <p className="mt-1 text-xs">
                        实际消耗 {operation.actualCredits.toFixed(3)} 0x积分
                      </p>
                    ) : null}
                </div>
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-slate-600">
              编辑区正在显示这份修改稿。采用后才会替换当前正文，并自动保留原版本。
            </p>
            <Button
              className="mt-5 w-full"
              disabled={busy}
              onClick={() => void onAdopt(activeCandidate.id)}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Check className="size-4" />}
              采用这版
            </Button>
            <Button
              variant="outline"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => {
                setPreset("custom");
                setInstruction("");
                setAdjustingCandidateId(activeCandidate.id);
              }}
            >
              <RefreshCw className="size-4" />
              继续调整
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full"
              disabled={busy}
              onClick={() => void onReject(activeCandidate.id)}
            >
              <ArrowLeft className="size-4" />
              保留原文
            </Button>
          </div>
        ) : null}

        {!active && !showCandidate ? (
          <form
            className="mt-6"
            onSubmit={(event) => {
              event.preventDefault();
              void onGenerate({
                mode: formMode,
                preset,
                instruction,
                sourceCandidateId: adjustingCandidateId || undefined,
              });
            }}
          >
            {failed && operation ? (
              <div className="mb-5 rounded-lg bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
                <p className="font-medium">
                  {operation.status === "outcome_unknown" ? "上一次结果无法确认" : "上一次生成中断"}
                </p>
                <p className="mt-1">
                  {operation.errorMessage || "当前正文没有改变。再次生成会产生新的消费。"}
                </p>
              </div>
            ) : null}

            {formMode === "revise" && !adjustingCandidateId ? (
              <fieldset>
                <legend className="text-xs font-medium text-slate-700">快速选择</legend>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PRESETS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      className={`min-h-10 rounded-md px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                        preset === item.value
                          ? "bg-slate-900 text-white"
                          : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300"
                      }`}
                      onClick={() => {
                        setPreset(item.value);
                        setInstruction(item.instruction);
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`min-h-10 rounded-md px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                      preset === "custom"
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 ring-1 ring-inset ring-slate-300"
                    }`}
                    onClick={() => {
                      setPreset("custom");
                      setInstruction("");
                    }}
                  >
                    自己说明
                  </button>
                </div>
              </fieldset>
            ) : null}

            {formMode === "rewrite" ? (
              <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">
                原正文和历史版本都会保留。新结果只是候选稿，采用前不会替换正文。
              </p>
            ) : null}

            <label htmlFor="consumer-revision-instruction" className="mt-5 block text-xs font-medium text-slate-700">
              {adjustingCandidateId ? "还希望怎样调整" : "修改要求"}
            </label>
            <textarea
              id="consumer-revision-instruction"
              value={instruction}
              maxLength={2_000}
              rows={6}
              className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 text-slate-950 outline-none placeholder:text-slate-500 focus:border-slate-600 focus:ring-2 focus:ring-slate-900/10"
              placeholder="例如：保留情节，把人物对话写得更克制。"
              onChange={(event) => {
                setPreset("custom");
                setInstruction(event.target.value);
              }}
            />
            <p className="mt-3 text-xs leading-5 text-slate-600">{estimateText(estimate)}</p>
            <Button
              type="submit"
              className="mt-5 w-full"
              disabled={busy || !instruction.trim()}
            >
              {busy
                ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                : <Sparkles className="size-4" />}
              {busy
                ? "正在准备"
                : formMode === "rewrite"
                  ? "生成整章候选稿"
                  : "生成修改建议"}
            </Button>
          </form>
        ) : null}
      </div>
    </aside>
  );
}
