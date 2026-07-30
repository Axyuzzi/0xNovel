import { Download, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  checkForDesktopUpdates,
  quitAndInstallDesktopUpdate,
  useDesktopUpdater,
} from "@/lib/desktop";

function dismissKey(buildNumber: number | null): string {
  return `0xnovelagent.update-dismissed.${buildNumber ?? "unknown"}`;
}

export default function DesktopUpdateNotice() {
  const updater = useDesktopUpdater();
  const [dismissed, setDismissed] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    setDismissed(
      updater.availableBuildNumber != null
      && window.sessionStorage.getItem(dismissKey(updater.availableBuildNumber)) === "true",
    );
  }, [updater.availableBuildNumber]);

  const visible = updater.availableVersion
    && (
      ["update-available", "downloading", "verifying", "downloaded", "installing"].includes(
        updater.status,
      )
      || updater.status === "error" && updater.canInstall
    );
  if (!visible || dismissed && !updater.updateRequired) {
    return null;
  }

  const downloading = updater.status === "downloading" || updater.status === "verifying";
  const installing = updater.status === "installing";
  const installerReady = updater.status === "downloaded"
    || updater.status === "error" && updater.canInstall;
  const actionLabel = installerReady
    ? "重新启动并安装"
    : downloading
      ? updater.status === "verifying"
        ? "正在校验"
        : `正在下载 ${Math.round(updater.progressPercent ?? 0)}%`
      : installing
        ? "正在启动安装"
        : "下载更新";

  return (
    <section
      aria-live="polite"
      className={`border-b px-4 py-3 ${
        updater.updateRequired
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-950"
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2">
        {updater.updateRequired ? (
          <ShieldAlert className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
        ) : (
          <Download className="size-5 shrink-0 text-slate-600" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {updater.updateRequired ? "需要更新后继续使用联网创作服务" : "发现新版本"}
            {" "}
            {updater.availableVersion}
          </p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 opacity-80">
            {updater.status === "error"
              ? updater.message
              : updater.releaseNotes || updater.message}
          </p>
        </div>
        <Button
          size="sm"
          onClick={async () => {
            setActionBusy(true);
            try {
              if (installerReady) {
                await quitAndInstallDesktopUpdate();
              } else if (!downloading && !installing) {
                await checkForDesktopUpdates();
              }
            } catch {
              // The shared updater snapshot exposes a recoverable user-facing error.
            } finally {
              setActionBusy(false);
            }
          }}
          disabled={actionBusy || downloading || installing}
          className="min-h-10 shrink-0"
        >
          {downloading || installing ? (
            <RefreshCw className="size-4 animate-spin motion-reduce:animate-none" />
          ) : null}
          {actionLabel}
        </Button>
        {!updater.updateRequired ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            aria-label="本次稍后提醒"
            onClick={() => {
              window.sessionStorage.setItem(
                dismissKey(updater.availableBuildNumber),
                "true",
              );
              setDismissed(true);
            }}
          >
            <X className="size-4" />
          </Button>
        ) : null}
      </div>
    </section>
  );
}
