import type {
  ConsumerStoryDirectionPreview,
} from "@0xnovelagent/shared/types/consumerSetup";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface StoryDirectionStreamingPreviewProps {
  previews: ConsumerStoryDirectionPreview[] | null;
}

const directionLabels = ["方向一", "方向二", "方向三"] as const;

function LoadingLine({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block h-3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function PreviewField({
  label,
  value,
  width,
}: {
  label: string;
  value: string;
  width: string;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1.5 min-h-10 text-sm leading-6 text-slate-700">
        {value ? value : (
          <span className="space-y-2 pt-1">
            <LoadingLine className={width} />
            <LoadingLine className="w-2/3" />
          </span>
        )}
      </dd>
    </div>
  );
}

function emptyPreview(index: number): ConsumerStoryDirectionPreview {
  return {
    index,
    title: "",
    premise: "",
    protagonist: "",
    centralConflict: "",
    tone: "",
    recommendedLength: "",
  };
}

export default function StoryDirectionStreamingPreview({
  previews,
}: StoryDirectionStreamingPreviewProps) {
  const slots = [0, 1, 2].map((index) => previews?.[index] ?? emptyPreview(index));

  return (
    <section className="mt-10" aria-busy="true" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          <Sparkles aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">
            三个故事方向正在展开
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            标题、故事亮点和核心冲突会陆续出现在下方，你可以边看边比较。
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {slots.map((preview, index) => {
          const hasContent = Boolean(
            preview.title
            || preview.premise
            || preview.protagonist
            || preview.centralConflict
            || preview.tone,
          );
          const isFormed = Boolean(preview.title && preview.premise && preview.centralConflict);
          return (
            <article
              key={preview.index}
              className="min-h-[24rem] rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold tracking-[0.08em] text-slate-500">
                  {directionLabels[index]}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "size-1.5 rounded-full",
                      isFormed ? "bg-emerald-600" : "animate-pulse bg-slate-400 motion-reduce:animate-none",
                    )}
                  />
                  {isFormed ? "方向已成形" : hasContent ? "正在补充细节" : "正在构思"}
                </span>
              </div>

              <div className="mt-5 min-h-20">
                {preview.title ? (
                  <h3 className="text-lg font-semibold leading-7 text-slate-950">
                    {preview.title}
                    {!isFormed ? (
                      <span
                        aria-hidden="true"
                        className="ml-1 inline-block h-5 w-px animate-pulse bg-slate-900 align-[-0.2em] motion-reduce:animate-none"
                      />
                    ) : null}
                  </h3>
                ) : (
                  <div className="space-y-3 pt-1">
                    <LoadingLine className="h-5 w-3/5" />
                    <LoadingLine className="h-5 w-2/5" />
                  </div>
                )}
              </div>

              <div className="min-h-28 text-sm leading-6 text-slate-700">
                {preview.premise ? preview.premise : (
                  <div className="space-y-2 pt-1">
                    <LoadingLine className="w-full" />
                    <LoadingLine className="w-11/12" />
                    <LoadingLine className="w-3/4" />
                  </div>
                )}
              </div>

              <dl className="mt-4 space-y-4 border-t border-slate-200 pt-4">
                <PreviewField label="主角" value={preview.protagonist} width="w-5/6" />
                <PreviewField label="核心冲突" value={preview.centralConflict} width="w-full" />
                <PreviewField label="阅读感觉" value={preview.tone} width="w-1/2" />
              </dl>
            </article>
          );
        })}
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-500">
        生成完成后再选择一个方向；此时不会自动进入下一次付费生成。
      </p>
    </section>
  );
}
