import { LoaderCircle, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import type { ConsumerPlanningOverview } from "@0xnovelagent/shared/types/consumerStoryReview";
import { Button } from "@/components/ui/button";
import { AppDialogContent, Dialog } from "@/components/ui/dialog";

interface ConsumerPlanningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planning: ConsumerPlanningOverview | null;
  restoring: boolean;
  onRestore: (versionId: string) => Promise<void>;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function PlanningSection(props: {
  title: string;
  summary: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="group border-b border-slate-200 py-4" open={props.open}>
      <summary className="min-h-11 cursor-pointer list-none rounded-md py-2 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-slate-900">
        {props.title}
        <span className="mt-1 block text-xs font-normal leading-5 text-slate-600">
          {props.summary}
        </span>
      </summary>
      <div className="pb-2 pt-3 text-sm leading-6 text-slate-800">{props.children}</div>
    </details>
  );
}

export default function ConsumerPlanningDialog({
  open,
  onOpenChange,
  planning,
  restoring,
  onRestore,
}: ConsumerPlanningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent
        title="故事规划"
        description="从整本方向到当前剧情阶段。恢复规划不会改写已完成章节。"
        className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] sm:max-w-2xl"
        bodyClassName="overflow-y-auto"
      >
        {!planning ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-600" role="status">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            正在读取故事规划
          </div>
        ) : (
          <>
            <PlanningSection title="最初想法" summary={planning.idea} open>
              <p>{planning.idea}</p>
            </PlanningSection>
            <PlanningSection
              title="故事方向"
              summary={planning.selectedDirection.premise}
            >
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-slate-600">核心冲突</dt>
                  <dd>{planning.selectedDirection.centralConflict}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">主角的破局优势</dt>
                  <dd>{planning.selectedDirection.coreAdvantage}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">优势的限制和代价</dt>
                  <dd>{planning.selectedDirection.advantageLimit}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">持续阅读回报</dt>
                  <dd>{planning.selectedDirection.payoffPattern}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-600">长期发展</dt>
                  <dd>{planning.selectedDirection.progressionPath}</dd>
                </div>
              </dl>
            </PlanningSection>
            <PlanningSection
              title="全书骨架"
              summary={planning.bookSkeleton.corePromise}
            >
              <p>{planning.bookSkeleton.protagonistArc}</p>
              <p className="mt-3"><span className="text-xs text-slate-600">结局方向：</span>{planning.bookSkeleton.ending}</p>
            </PlanningSection>
            <PlanningSection
              title="全部卷"
              summary={`共 ${planning.volumePlan.volumes.length} 卷`}
            >
              <ol className="space-y-4">
                {planning.volumePlan.volumes.map((volume) => (
                  <li key={volume.order}>
                    <p className="font-medium">第 {volume.order} 卷 · {volume.title}</p>
                    <p className="mt-1 text-slate-700">{volume.goal}</p>
                    <p className="mt-1 text-xs text-slate-600">约 {volume.estimatedChapters} 章</p>
                  </li>
                ))}
              </ol>
            </PlanningSection>
            <PlanningSection
              title="当前剧情阶段"
              summary={`第 ${planning.currentPhase.chapterStart}—${planning.currentPhase.chapterEnd} 章 · ${planning.currentPhase.name}`}
              open
            >
              <p>{planning.currentPhase.objective}</p>
              <ol className="mt-3 space-y-2">
                {planning.currentPhase.beats.map((beat) => (
                  <li key={beat.order}>· {beat.event}</li>
                ))}
              </ol>
            </PlanningSection>

            <div className="pt-6">
              <p className="text-sm font-semibold text-slate-950">规划历史</p>
              {planning.versions.length === 0 ? (
                <p className="mt-2 text-xs text-slate-600">规划调整后会在这里保存历史版本。</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">
                  {planning.versions.map((version) => (
                    <div key={version.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          第 {version.sequence} 版 · {version.label}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">{formatTime(version.createdAt)}</p>
                      </div>
                      <Button
                        variant="ghost"
                        className="min-h-11 shrink-0"
                        disabled={restoring}
                        onClick={() => void onRestore(version.id)}
                      >
                        {restoring
                          ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                          : <RotateCcw className="size-4" />}
                        恢复
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </AppDialogContent>
    </Dialog>
  );
}
