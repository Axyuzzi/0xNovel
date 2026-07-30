import type { ConsumerChapterVersion } from "@0xnovelagent/shared/types/consumerWorkspace";
import { LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConsumerVersionHistoryPanelProps {
  versions: ConsumerChapterVersion[];
  restoringVersionId: string;
  onRestore: (versionId: string) => void;
}

function formatVersionTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ConsumerVersionHistoryPanel({
  versions,
  restoringVersionId,
  onRestore,
}: ConsumerVersionHistoryPanelProps) {
  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-slate-200 bg-slate-50/70 p-4 lg:block">
      <h3 className="text-sm font-semibold text-slate-950">历史版本</h3>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        确认正文或采用修改时会留下版本。恢复不会删除后来的记录。
      </p>
      {versions.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">还没有确认过的版本。</p>
      ) : (
        <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
          {versions.map((version) => (
            <div key={version.id} className="py-4">
              <p className="text-sm font-medium text-slate-900">第 {version.sequence} 版</p>
              <p className="mt-1 text-xs text-slate-600">{formatVersionTime(version.createdAt)}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 -ml-2"
                disabled={restoringVersionId !== ""}
                onClick={() => onRestore(version.id)}
              >
                {restoringVersionId === version.id
                  ? <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                  : <RotateCcw className="size-3.5" />}
                恢复这版
              </Button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
