import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConsumerSetupSnapshot,
  ConsumerStoryDirection,
} from "@0xnovelagent/shared/types/consumerSetup";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Circle,
  LoaderCircle,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  confirmConsumerSetupStep,
  generateConsumerSetupStep,
  getConsumerSetup,
} from "@/api/consumerSetup";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ConsumerSetupResult from "./ConsumerSetupResult";
import StoryDirectionStreamingPreview from "./StoryDirectionStreamingPreview";
import { activeSetupSteps, setupCopy } from "./setupCopy";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "没有完成这一步，请稍后重试。";
}

function SetupSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse px-5 py-8 motion-reduce:animate-none md:px-8">
      <div className="h-5 w-28 rounded bg-slate-200" />
      <div className="mt-12 h-3 w-full rounded bg-slate-100" />
      <div className="mt-10 h-9 w-2/3 rounded bg-slate-200" />
      <div className="mt-4 h-5 w-1/2 rounded bg-slate-100" />
      <div className="mt-10 h-56 rounded-xl bg-slate-100" />
    </div>
  );
}

function CreditSummary({ setup }: { setup: ConsumerSetupSnapshot }) {
  if (setup.status === "awaiting_confirmation" && setup.lastActualCredits !== null) {
    return (
      <p className="text-sm text-slate-600">
        本次实际消耗 <strong className="font-semibold text-slate-950">{setup.lastActualCredits.toFixed(3)} 0x积分</strong>
      </p>
    );
  }
  if (setup.creditEstimate) {
    const estimate = setup.creditEstimate;
    return (
      <p className="text-sm leading-6 text-slate-600">
        参考最近 {estimate.sampleSize} 次同类生成，通常消耗{" "}
        <strong className="font-semibold text-slate-950">
          {estimate.minimum.toFixed(3)}–{estimate.maximum.toFixed(3)} 0x积分
        </strong>
        ，实际以本次模型用量为准。
      </p>
    );
  }
  return (
    <p className="text-sm leading-6 text-slate-600">
      暂无同类生成记录可供预估。点击后会产生一次按实际用量计费的调用，结果返回前不会继续下一步。
    </p>
  );
}

function ProgressSteps({ setup }: { setup: ConsumerSetupSnapshot }) {
  const currentIndex = setup.step === "completed"
    ? activeSetupSteps.length
    : activeSetupSteps.indexOf(setup.step);
  return (
    <ol className="grid grid-cols-5 gap-2" aria-label="作品准备进度">
      {activeSetupSteps.map((step, index) => {
        const complete = index < currentIndex || setup.step === "completed";
        const current = index === currentIndex;
        return (
          <li key={step} aria-current={current ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full",
                complete || current ? "bg-slate-950" : "bg-slate-200",
              )}
            />
            <div className="mt-2 hidden items-center gap-1.5 text-xs sm:flex">
              {complete ? (
                <Check aria-hidden="true" className="size-3.5 text-emerald-700" />
              ) : (
                <Circle
                  aria-hidden="true"
                  className={cn("size-3", current ? "fill-slate-950 text-slate-950" : "text-slate-400")}
                />
              )}
              <span className={current ? "font-semibold text-slate-950" : "text-slate-600"}>
                {setupCopy[step].label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function ConsumerSetupPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [setup, setSetup] = useState<ConsumerSetupSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedDirectionId, setSelectedDirectionId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const loadSetup = useCallback(async (showLoading = false) => {
    if (!id) return;
    if (showLoading) setLoading(true);
    try {
      const result = await getConsumerSetup(id);
      setSetup(result);
      setError("");
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadSetup(true);
  }, [loadSetup]);

  useEffect(() => {
    const waitingForDirectionStart = (
      busy
      && setup?.step === "story_direction"
      && setup.status !== "awaiting_confirmation"
    );
    if (setup?.status !== "generating" && !waitingForDirectionStart) return;
    const interval = setup?.step === "story_direction" ? 600 : 1_500;
    const timer = window.setInterval(() => {
      void loadSetup();
    }, interval);
    return () => window.clearInterval(timer);
  }, [busy, loadSetup, setup?.status, setup?.step]);

  useEffect(() => {
    if (setup?.step !== "story_direction" || !setup.directions) return;
    const selected = setup.selectedDirection
      ?? setup.directions.directions.find((direction) => direction.id === selectedDirectionId)
      ?? null;
    if (!selected) return;
    setSelectedDirectionId(selected.id);
    setTitle((current) => current || selected.title);
    setDescription((current) => current || selected.premise);
  }, [selectedDirectionId, setup]);

  const currentCopy = useMemo(
    () => setup && setup.step !== "completed" ? setupCopy[setup.step] : null,
    [setup],
  );

  const selectDirection = (direction: ConsumerStoryDirection) => {
    setSelectedDirectionId(direction.id);
    setTitle(direction.title);
    setDescription(direction.premise);
  };

  const generate = async () => {
    if (!id || !setup || setup.step === "completed") return;
    setBusy(true);
    setError("");
    try {
      const result = await generateConsumerSetupStep(id, {
        step: setup.step,
        expectedRevision: setup.revision,
        requestKey: crypto.randomUUID(),
      });
      setSetup(result);
    } catch (generationError) {
      setError(errorMessage(generationError));
      await loadSetup();
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!id || !setup || setup.step === "completed") return;
    if (setup.step === "story_direction" && !selectedDirectionId) {
      setError("请选择一个故事方向。");
      return;
    }
    if (setup.step === "story_direction" && (!title.trim() || !description.trim())) {
      setError("请填写书名和一句话简介。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await confirmConsumerSetupStep(id, {
        step: setup.step,
        expectedRevision: setup.revision,
        selectedDirectionId: setup.step === "story_direction" ? selectedDirectionId : undefined,
        title: setup.step === "story_direction" ? title.trim() : undefined,
        description: setup.step === "story_direction" ? description.trim() : undefined,
      });
      setSetup(result);
      if (result.status === "completed" && result.firstChapterId) {
        navigate(
          `/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(result.firstChapterId)}`,
          { replace: true },
        );
      }
    } catch (confirmError) {
      setError(errorMessage(confirmError));
      await loadSetup();
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <SetupSkeleton />;
  }

  if (!setup || !currentCopy && setup?.status !== "completed") {
    return (
      <div className="mx-auto max-w-xl px-5 py-16 text-center">
        <AlertCircle aria-hidden="true" className="mx-auto size-7 text-red-700" />
        <h1 className="mt-4 text-xl font-semibold text-slate-950">作品准备页没有打开</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{error || "请返回作品列表后重试。"}</p>
        <Button asChild className="mt-6">
          <Link to="/novels">返回我的作品</Link>
        </Button>
      </div>
    );
  }

  if (setup.step === "completed" || setup.status === "completed") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <Check aria-hidden="true" className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.025em] text-slate-950">作品准备完成</h1>
        <p className="mt-3 text-base leading-7 text-slate-600">第一章可以继续阅读、修改和保存。</p>
        <Button
          className="mt-7"
          disabled={!setup.firstChapterId}
          onClick={() => setup.firstChapterId && navigate(
            `/novels/${encodeURIComponent(id)}/chapters/${encodeURIComponent(setup.firstChapterId)}`,
          )}
        >
          打开第一章
        </Button>
      </div>
    );
  }

  const canGenerate = ["awaiting_generation", "failed", "outcome_unknown"].includes(setup.status);
  const isGenerating = setup.status === "generating" || busy && canGenerate;
  const isConfirming = busy && setup.status === "awaiting_confirmation";

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-5xl px-5 pb-14 pt-6 md:px-8 md:pt-8">
        <Link
          to="/novels"
          className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-slate-600 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          返回我的作品
        </Link>

        <div className="mt-8">
          <ProgressSteps setup={setup} />
        </div>

        <header className="mt-10 max-w-3xl">
          <p className="text-sm font-medium text-slate-600">
            第 {activeSetupSteps.indexOf(setup.step) + 1} 步，共 5 步
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.025em] text-slate-950">
            {currentCopy?.title}
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">
            {currentCopy?.description}
          </p>
        </header>

        {isGenerating && setup.step === "story_direction" ? (
          <StoryDirectionStreamingPreview previews={setup.directionPreviews} />
        ) : null}

        {isGenerating && setup.step !== "story_direction" ? (
          <section className="mt-10 rounded-xl bg-slate-50 px-6 py-10 text-center" aria-live="polite">
            <LoaderCircle aria-hidden="true" className="mx-auto size-7 animate-spin text-slate-700 motion-reduce:animate-none" />
            <h2 className="mt-4 text-lg font-semibold text-slate-950">{currentCopy?.label}正在生成</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
              可以停留在此页等待。结果会保存到本机，完成后再由你确认。
            </p>
          </section>
        ) : null}

        {setup.status === "awaiting_confirmation" ? (
          <section className="mt-10">
            <ConsumerSetupResult
              setup={setup}
              selectedDirectionId={selectedDirectionId}
              title={title}
              description={description}
              onSelectDirection={selectDirection}
              onTitleChange={setTitle}
              onDescriptionChange={setDescription}
            />
          </section>
        ) : null}

        {!isGenerating
        && (setup.status === "failed" || setup.status === "outcome_unknown")
        && setup.lastError ? (
          <section
            className="mt-8 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4"
            aria-live="polite"
          >
            <div className="flex gap-3">
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-amber-800" />
              <div>
                <h2 className="font-semibold text-amber-950">
                  {setup.status === "outcome_unknown" ? "上一次结果无法确认" : "这一步没有完成"}
                </h2>
                <p className="mt-1 text-sm leading-6 text-amber-950">{setup.lastError}</p>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <p role="alert" className="mt-5 text-sm leading-6 text-red-800">{error}</p>
        ) : null}

        {!isGenerating ? (
          <footer className="mt-10 flex flex-col gap-5 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <CreditSummary setup={setup} />
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
              {(setup.status === "failed" || setup.status === "outcome_unknown") ? (
                <Button asChild variant="ghost">
                  <Link to="/account">
                    <WalletCards aria-hidden="true" className="size-4" />
                    查看余额与充值
                  </Link>
                </Button>
              ) : null}
              {canGenerate ? (
                <Button disabled={busy} onClick={() => void generate()}>
                  {setup.status === "awaiting_generation" ? null : (
                    <RefreshCw aria-hidden="true" className="size-4" />
                  )}
                  {setup.status === "awaiting_generation" ? currentCopy?.generateAction : "重新生成这一步"}
                </Button>
              ) : null}
              {setup.status === "awaiting_confirmation" ? (
                <Button
                  disabled={
                    isConfirming
                    || setup.step === "story_direction" && (
                      !selectedDirectionId || !title.trim() || !description.trim()
                    )
                  }
                  onClick={() => void confirm()}
                >
                  {isConfirming ? (
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isConfirming ? "正在确认" : currentCopy?.confirmAction}
                </Button>
              ) : null}
            </div>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
