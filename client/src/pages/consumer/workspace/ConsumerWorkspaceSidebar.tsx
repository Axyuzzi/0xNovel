import {
  ArrowLeft,
  BookOpenText,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { ConsumerChapterSummary } from "@0xnovelagent/shared/types/consumerWorkspace";
import { chapterDirectoryLabel } from "./chapterDirectoryLabel";
import {
  readChapterDirectoryScrollPosition,
  writeChapterDirectoryScrollPosition,
} from "./chapterDirectoryScroll";

interface ConsumerWorkspaceSidebarProps {
  novelId: string;
  novelTitle: string;
  chapters: ConsumerChapterSummary[];
  selectedChapterId: string;
  onSelectChapter: (chapterId: string) => void;
  onOpenPlanning: () => void;
  onAdjustStory: () => void;
}

export default function ConsumerWorkspaceSidebar({
  novelId,
  novelTitle,
  chapters,
  selectedChapterId,
  onSelectChapter,
  onOpenPlanning,
  onAdjustStory,
}: ConsumerWorkspaceSidebarProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    scrollContainer.scrollTop = readChapterDirectoryScrollPosition(
      novelId,
      window.sessionStorage,
    );
  }, [novelId]);

  const rememberScrollPosition = () => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    writeChapterDirectoryScrollPosition(
      novelId,
      scrollContainer.scrollTop,
      window.sessionStorage,
    );
  };

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 lg:flex">
      <div className="border-b border-slate-200 px-4 py-4">
        <Link
          to="/novels"
          className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-slate-600 outline-none hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <ArrowLeft className="size-3.5" />
          我的作品
        </Link>
        <h1 className="mt-1 truncate text-sm font-semibold text-slate-950" title={novelTitle}>
          {novelTitle}
        </h1>
      </div>

      <div
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto py-2"
        onScroll={rememberScrollPosition}
      >
        <p className="px-4 py-2 text-xs font-medium text-slate-600">故事</p>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
          onClick={onOpenPlanning}
        >
          <BookOpenText className="size-4 shrink-0" />
          故事规划
        </button>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 outline-none hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900"
          onClick={onAdjustStory}
        >
          <GitBranch className="size-4 shrink-0" />
          调整后续剧情
        </button>

        <p className="mt-3 px-4 py-2 text-xs font-medium text-slate-600">正文</p>
        {chapters.map((chapter) => {
          const selected = chapter.id === selectedChapterId;
          const label = chapterDirectoryLabel(chapter);
          return (
            <button
              key={chapter.id}
              type="button"
              className={`flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900 ${
                selected
                  ? "bg-slate-200/80 font-medium text-slate-950"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950"
              }`}
              onClick={() => {
                rememberScrollPosition();
                onSelectChapter(chapter.id);
              }}
            >
              <span className="min-w-0 flex-1" title={label}>
                <span className="block truncate">{label}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                  {chapter.wordCount.toLocaleString("zh-CN")} 字
                </span>
              </span>
              {selected ? <ChevronRight className="size-3.5 shrink-0" /> : null}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
