import { RotateCw, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  openDesktopLogsDirectory,
  restartDesktopApp,
  type DesktopBootstrapSnapshot,
} from "@/lib/desktop";
import { cn } from "@/lib/utils";
import DesktopBrandMark from "./DesktopBrandMark";

interface DesktopBootstrapShellProps {
  snapshot: DesktopBootstrapSnapshot;
  overlay?: boolean;
}

function resolveProgressLabel(snapshot: DesktopBootstrapSnapshot): string {
  switch (snapshot.state) {
    case "launching":
      return "正在打开 0xNovelAgent";
    case "starting-server":
      return "正在恢复本机创作资料";
    case "loading-ui":
      return "正在打开创作首页";
    case "ready":
      return "创作空间已准备好";
    case "error":
      return "创作空间暂时没有准备好";
    default:
      return snapshot.title;
  }
}

export default function DesktopBootstrapShell({ snapshot, overlay = false }: DesktopBootstrapShellProps) {
  const isError = snapshot.state === "error";

  return (
    <div
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center px-6 py-8",
        overlay ? "bg-background/95" : "bg-slate-950",
      )}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      <main className="w-full max-w-lg text-center text-slate-50">
        <DesktopBrandMark className="mx-auto h-20 w-20" />

        <div className="mt-8 space-y-3">
          <h1 className="text-balance text-2xl font-semibold tracking-tight">
            {resolveProgressLabel(snapshot)}
          </h1>
          <p className="mx-auto max-w-[60ch] text-pretty text-sm leading-7 text-slate-300">
            {isError
              ? "你的本地作品不会受到影响。可以重新启动，或导出诊断信息后联系支持。"
              : "请稍候，你的故事和上次创作位置会在准备完成后自动打开。"}
          </p>
        </div>

        {!isError ? (
          <div className="mx-auto mt-8 h-1.5 w-48 overflow-hidden rounded-full bg-slate-800">
            <span className="desktop-bootstrap-progress block h-full w-1/2 rounded-full bg-cyan-300" />
          </div>
        ) : (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              type="button"
              className="bg-cyan-300 text-slate-950 hover:bg-cyan-200"
              onClick={() => void restartDesktopApp()}
            >
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              重新启动
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-slate-600 bg-transparent text-slate-100 hover:bg-slate-800 hover:text-white"
              onClick={() => void openDesktopLogsDirectory()}
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              导出诊断信息
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
