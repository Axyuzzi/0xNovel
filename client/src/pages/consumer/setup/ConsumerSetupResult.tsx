import type {
  ConsumerSetupSnapshot,
  ConsumerStoryDirection,
} from "@0xnovelagent/shared/types/consumerSetup";
import { BookOpenText, Check, Flag, Route, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ConsumerSetupResultProps {
  setup: ConsumerSetupSnapshot;
  selectedDirectionId: string;
  title: string;
  description: string;
  onSelectDirection: (direction: ConsumerStoryDirection) => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

function SectionHeading({
  icon: Icon,
  children,
}: {
  icon: typeof Sparkles;
  children: string;
}) {
  return (
    <h3 className="flex items-center gap-2 text-base font-semibold text-slate-950">
      <Icon aria-hidden="true" className="size-4 text-slate-600" />
      {children}
    </h3>
  );
}

function DirectionResults({
  setup,
  selectedDirectionId,
  title,
  description,
  onSelectDirection,
  onTitleChange,
  onDescriptionChange,
}: ConsumerSetupResultProps) {
  if (!setup.directions) return null;
  return (
    <div>
      <fieldset>
        <legend className="text-base font-semibold text-slate-950">
          哪一个方向最像你想写的故事？
        </legend>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          选择只会确认方向，不会自动开始下一次生成。
        </p>
        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {setup.directions.directions.map((direction) => {
            const selected = direction.id === selectedDirectionId;
            return (
              <label
                key={direction.id}
                className={cn(
                  "relative cursor-pointer rounded-xl border p-5 outline-none transition-colors",
                  selected
                    ? "border-slate-950 bg-slate-50"
                    : "border-slate-200 bg-white hover:border-slate-400",
                  "focus-within:ring-2 focus-within:ring-slate-900 focus-within:ring-offset-2",
                )}
              >
                <input
                  type="radio"
                  name="story-direction"
                  value={direction.id}
                  checked={selected}
                  className="sr-only"
                  onChange={() => onSelectDirection(direction)}
                />
                <span className="flex items-start justify-between gap-4">
                  <span className="text-lg font-semibold leading-7 text-slate-950">
                    {direction.title}
                  </span>
                  <span
                    className={cn(
                      "mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border",
                      selected
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-300 text-transparent",
                    )}
                  >
                    <Check aria-hidden="true" className="size-3.5" />
                  </span>
                </span>
                <span className="mt-3 block text-sm leading-6 text-slate-700">
                  {direction.premise}
                </span>
                <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm leading-6">
                  <div>
                    <dt className="inline font-medium text-slate-900">主角：</dt>
                    <dd className="inline text-slate-700">{direction.protagonist}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-900">核心冲突：</dt>
                    <dd className="inline text-slate-700">{direction.centralConflict}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-900">破局优势：</dt>
                    <dd className="inline text-slate-700">{direction.coreAdvantage}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-900">持续看点：</dt>
                    <dd className="inline text-slate-700">{direction.payoffPattern}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-900">阅读感觉：</dt>
                    <dd className="inline text-slate-700">{direction.tone}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-slate-900">篇幅：</dt>
                    <dd className="inline text-slate-700">{direction.recommendedLength}</dd>
                  </div>
                </dl>
              </label>
            );
          })}
        </div>
      </fieldset>

      {selectedDirectionId ? (
        <section className="mt-8 border-t border-slate-200 pt-7" aria-labelledby="work-confirmation">
          <h3 id="work-confirmation" className="text-base font-semibold text-slate-950">
            确认作品信息
          </h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            书名和简介可以直接修改，故事规划会跟随所选方向。
          </p>
          <div className="mt-5 grid gap-5">
            <label className="text-sm font-medium text-slate-900">
              书名
              <Input
                value={title}
                maxLength={120}
                className="mt-2 h-11 border-slate-300 bg-white"
                onChange={(event) => onTitleChange(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-slate-900">
              一句话简介
              <textarea
                value={description}
                maxLength={2_000}
                rows={3}
                className="mt-2 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-6 text-slate-950 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/15"
                onChange={(event) => onDescriptionChange(event.target.value)}
              />
            </label>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BookSkeletonResult({ setup }: { setup: ConsumerSetupSnapshot }) {
  const skeleton = setup.bookSkeleton;
  if (!skeleton) return null;
  return (
    <div className="space-y-8">
      <section>
        <SectionHeading icon={Sparkles}>这本书会给读者什么</SectionHeading>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{skeleton.corePromise}</p>
      </section>
      <section>
        <SectionHeading icon={Route}>主角会怎样改变</SectionHeading>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{skeleton.protagonistArc}</p>
      </section>
      <section>
        <SectionHeading icon={Flag}>故事会走向哪里</SectionHeading>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{skeleton.ending}</p>
      </section>
      <section>
        <h3 className="text-base font-semibold text-slate-950">完整故事进程</h3>
        <ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {skeleton.acts.map((act) => (
            <li key={act.order} className="grid gap-2 py-5 sm:grid-cols-[8rem_minmax(0,1fr)]">
              <strong className="text-sm text-slate-950">{act.name}</strong>
              <div className="space-y-2 text-sm leading-6 text-slate-700">
                <p>{act.goal}</p>
                <p><span className="font-medium text-slate-900">重要变化：</span>{act.turningPoint}</p>
                <p><span className="font-medium text-slate-900">阶段结果：</span>{act.outcome}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function VolumePlanResult({ setup }: { setup: ConsumerSetupSnapshot }) {
  if (!setup.volumePlan) return null;
  return (
    <ol className="divide-y divide-slate-200 border-y border-slate-200">
      {setup.volumePlan.volumes.map((volume) => (
        <li key={volume.order} className="py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-950">
              第 {volume.order} 卷 · {volume.title}
            </h3>
            <span className="text-sm text-slate-600">约 {volume.estimatedChapters} 章</span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-950">这一卷要完成</dt>
              <dd className="mt-1">{volume.goal}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-950">主要矛盾</dt>
              <dd className="mt-1">{volume.mainConflict}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-950">关键变化</dt>
              <dd className="mt-1">{volume.turningPoint}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-950">卷末期待</dt>
              <dd className="mt-1">{volume.endingHook}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}

function CurrentPhaseResult({ setup }: { setup: ConsumerSetupSnapshot }) {
  const phase = setup.currentPhase;
  if (!phase) return null;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-xl font-semibold text-slate-950">{phase.name}</h3>
        <span className="text-sm text-slate-600">
          第 {phase.chapterStart}–{phase.chapterEnd} 章
        </span>
      </div>
      <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{phase.objective}</p>
      <ol className="mt-7 border-y border-slate-200">
        {phase.beats.map((beat) => (
          <li
            key={beat.order}
            className="grid gap-2 border-b border-slate-200 py-5 last:border-b-0 sm:grid-cols-[2rem_minmax(0,1fr)]"
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              {beat.order}
            </span>
            <div>
              <p className="font-medium leading-6 text-slate-950">{beat.event}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{beat.purpose}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-sm leading-6 text-slate-700">
        <span className="font-medium text-slate-950">阶段结束时：</span>
        {phase.endingState}
      </p>
    </div>
  );
}

function FirstChapterResult({ setup }: { setup: ConsumerSetupSnapshot }) {
  if (!setup.firstChapter) return null;
  return (
    <article>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
        <BookOpenText aria-hidden="true" className="size-4" />
        第一章候选稿
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-slate-950">
        {setup.firstChapter.title}
      </h2>
      <div className="mt-7 whitespace-pre-wrap text-[1.02rem] leading-8 text-slate-800">
        {setup.firstChapter.content}
      </div>
    </article>
  );
}

export default function ConsumerSetupResult(props: ConsumerSetupResultProps) {
  switch (props.setup.step) {
    case "story_direction":
      return <DirectionResults {...props} />;
    case "book_skeleton":
      return <BookSkeletonResult setup={props.setup} />;
    case "volume_plan":
      return <VolumePlanResult setup={props.setup} />;
    case "current_phase":
      return <CurrentPhaseResult setup={props.setup} />;
    case "first_chapter":
      return <FirstChapterResult setup={props.setup} />;
    case "completed":
      return null;
  }
}
