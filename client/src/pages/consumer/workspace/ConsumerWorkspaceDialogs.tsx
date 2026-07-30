import type {
  ConsumerChapterSummary,
  ConsumerChapterVersion,
} from "@0xnovelagent/shared/types/consumerWorkspace";
import {
  ArrowLeft,
  BookOpenText,
  ChevronRight,
  GitBranch,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AppDialogContent,
  Dialog,
} from "@/components/ui/dialog";
import { chapterDirectoryLabel } from "./chapterDirectoryLabel";

interface ConsumerWorkspaceDialogsProps {
  novelTitle: string;
  chapters: ConsumerChapterSummary[];
  selectedChapterId: string;
  directoryOpen: boolean;
  onDirectoryOpenChange: (open: boolean) => void;
  onSelectChapter: (chapterId: string) => void;
  onOpenPlanning: () => void;
  onAdjustStory: () => void;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  versions: ConsumerChapterVersion[];
  restoringVersionId: string;
  onRestoreVersion: (versionId: string) => Promise<void>;
}

function formatVersionTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ConsumerWorkspaceDialogs({
  novelTitle,
  chapters,
  selectedChapterId,
  directoryOpen,
  onDirectoryOpenChange,
  onSelectChapter,
  onOpenPlanning,
  onAdjustStory,
  historyOpen,
  onHistoryOpenChange,
  versions,
  restoringVersionId,
  onRestoreVersion,
}: ConsumerWorkspaceDialogsProps) {
  return (
    <>
      <Dialog open={directoryOpen} onOpenChange={onDirectoryOpenChange}>
        <AppDialogContent
          title={novelTitle}
          description="选择要阅读或修改的章节。"
          className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] sm:max-w-lg"
          bodyClassName="px-0 py-2"
        >
          <Link
            to="/novels"
            className="mx-3 flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-slate-900"
            onClick={() => onDirectoryOpenChange(false)}
          >
            <ArrowLeft className="size-4" />
            返回我的作品
          </Link>
          <p className="px-6 pb-2 pt-4 text-xs font-medium text-slate-600">故事</p>
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-3 px-6 py-3 text-left text-sm text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
            onClick={() => {
              onDirectoryOpenChange(false);
              onOpenPlanning();
            }}
          >
            <BookOpenText className="size-4" />
            故事规划
          </button>
          <button
            type="button"
            className="flex min-h-12 w-full items-center gap-3 px-6 py-3 text-left text-sm text-slate-700 outline-none hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
            onClick={() => {
              onDirectoryOpenChange(false);
              onAdjustStory();
            }}
          >
            <GitBranch className="size-4" />
            调整后续剧情
          </button>
          <p className="px-6 pb-2 pt-4 text-xs font-medium text-slate-600">正文</p>
          {chapters.map((chapter) => {
            const selected = chapter.id === selectedChapterId;
            const label = chapterDirectoryLabel(chapter);
            return (
              <button
                key={chapter.id}
                type="button"
                className={`flex min-h-12 w-full items-center gap-3 px-6 py-3 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900 ${
                  selected
                    ? "bg-slate-200/80 font-medium text-slate-950"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
                onClick={() => {
                  onDirectoryOpenChange(false);
                  onSelectChapter(chapter.id);
                }}
              >
                <span className="min-w-0 flex-1" title={label}>
                  <span className="block truncate">{label}</span>
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">
                    {chapter.wordCount.toLocaleString("zh-CN")} 字
                  </span>
                </span>
                {selected ? <ChevronRight className="size-4 shrink-0" /> : null}
              </button>
            );
          })}
        </AppDialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <AppDialogContent
          title="历史版本"
          description="恢复旧版本不会删除后来的记录。"
          className="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] sm:max-w-lg"
        >
          {versions.length === 0 ? (
            <p className="py-6 text-sm text-slate-600">还没有确认过的版本。</p>
          ) : (
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {versions.map((version) => (
                <div key={version.id} className="py-4">
                  <p className="text-sm font-medium text-slate-900">第 {version.sequence} 版</p>
                  <p className="mt-1 text-xs text-slate-600">{formatVersionTime(version.createdAt)}</p>
                  <Button
                    variant="ghost"
                    className="mt-2 min-h-11"
                    disabled={restoringVersionId !== ""}
                    onClick={() => {
                      void onRestoreVersion(version.id).then(() => onHistoryOpenChange(false));
                    }}
                  >
                    {restoringVersionId === version.id
                      ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                      : <RotateCcw className="size-4" />}
                    恢复这版
                  </Button>
                </div>
              ))}
            </div>
          )}
        </AppDialogContent>
      </Dialog>
    </>
  );
}
