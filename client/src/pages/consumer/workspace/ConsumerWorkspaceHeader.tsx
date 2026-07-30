import {
  Check,
  Clock3,
  Download,
  History,
  List,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type SaveState = "saved" | "waiting" | "saving" | "error";

interface ConsumerWorkspaceHeaderProps {
  chapterTitle: string;
  saveState: SaveState;
  directoryOpen: boolean;
  onOpenDirectory: () => void;
  exporting: boolean;
  onExport: () => void;
  historyOpen: boolean;
  onToggleHistory: () => void;
  mobileHistoryOpen: boolean;
  onOpenMobileHistory: () => void;
}

export default function ConsumerWorkspaceHeader({
  chapterTitle,
  saveState,
  directoryOpen,
  onOpenDirectory,
  exporting,
  onExport,
  historyOpen,
  onToggleHistory,
  mobileHistoryOpen,
  onOpenMobileHistory,
}: ConsumerWorkspaceHeaderProps) {
  return (
    <header className="flex min-h-16 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 sm:gap-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 lg:hidden"
          aria-label="打开作品目录"
          aria-expanded={directoryOpen}
          onClick={onOpenDirectory}
        >
          <List className="size-5" />
        </Button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-950">{chapterTitle}</h2>
          <p className={`mt-1 flex items-center gap-1.5 text-xs ${
            saveState === "error" ? "text-red-700" : "text-slate-600"
          }`}>
            {saveState === "saving"
              ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
              : saveState === "saved"
                ? <Check className="size-3" />
                : <Clock3 className="size-3" />}
            {saveState === "saving"
              ? "正在保存"
              : saveState === "waiting"
                ? "等待保存"
                : saveState === "error"
                  ? "尚未保存"
                  : "已保存在本机"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-11 sm:w-auto sm:px-3"
          aria-label="导出作品"
          disabled={exporting}
          onClick={onExport}
        >
          {exporting
            ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            : <Download className="size-4" />}
          <span className="hidden sm:inline">导出</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden size-11 sm:w-auto sm:px-3 lg:inline-flex"
          aria-expanded={historyOpen}
          onClick={onToggleHistory}
        >
          <History className="size-4" />
          <span className="hidden sm:inline">历史版本</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 lg:hidden"
          aria-label="查看历史版本"
          aria-expanded={mobileHistoryOpen}
          onClick={onOpenMobileHistory}
        >
          <History className="size-4" />
        </Button>
      </div>
    </header>
  );
}
