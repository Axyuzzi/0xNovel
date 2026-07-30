import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  APP_RUNTIME,
  APP_RUNTIME_IS_PACKAGED,
  APP_RUNTIME_IS_PORTABLE,
  APP_PRODUCT_MODE,
  APP_VERSION,
} from "@/lib/constants";
import { checkForDesktopUpdates, quitAndInstallDesktopUpdate, useDesktopUpdater } from "@/lib/desktop";

function formatUpdaterStatus(status: string): string {
  switch (status) {
    case "disabled":
      return "当前版本不支持自动更新";
    case "idle":
      return "可以检查更新";
    case "checking":
      return "正在检查";
    case "update-available":
      return "发现新版本";
    case "downloading":
      return "正在下载";
    case "verifying":
      return "正在校验";
    case "downloaded":
      return "可以安装";
    case "installing":
      return "正在启动安装";
    case "not-available":
      return "已经是最新版";
    case "error":
      return "暂时无法检查";
    default:
      return status;
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "-";
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function DesktopUpdateCard() {
  const updater = useDesktopUpdater();
  const [isBusy, setIsBusy] = useState(false);

  if (APP_RUNTIME !== "desktop") {
    return null;
  }

  const installModeLabel = APP_RUNTIME_IS_PORTABLE ? "便携版" : "安装版";
  const showDownloadButton = updater.status === "update-available";
  const showInstallButton = updater.status === "downloaded"
    || updater.status === "error" && updater.canInstall;
  const updateBusy = ["checking", "downloading", "verifying", "installing"].includes(
    updater.status,
  );
  const showCheckButton = !["downloading", "verifying", "installing"].includes(
    updater.status,
  ) && !showInstallButton;

  return (
    <Card className="border-slate-200 bg-slate-50/80">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>软件更新</CardTitle>
          <Badge variant="outline">{installModeLabel}</Badge>
        </div>
        <CardDescription>
          当前版本 {APP_VERSION}。安装新版本前会先征求你的确认，本地作品不会被卸载程序自动删除。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">当前版本</div>
            <div className="mt-1 font-medium">{APP_VERSION}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">更新状态</div>
            <div className="mt-1 font-medium">{formatUpdaterStatus(updater.status)}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">可用版本</div>
            <div className="mt-1 font-medium">{updater.availableVersion ?? "-"}</div>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="text-xs text-muted-foreground">安装包大小</div>
            <div className="mt-1 font-medium">{formatFileSize(updater.fileSize)}</div>
          </div>
        </div>

        <div className="rounded-md border bg-background p-4 text-sm text-muted-foreground">
          {APP_RUNTIME_IS_PORTABLE
            ? "便携版不会自动安装更新。请从官方发布渠道下载新版，并先备份本地作品。"
            : !APP_RUNTIME_IS_PACKAGED
              ? "开发环境不会下载正式更新。"
              : updater.status === "error"
                ? "暂时无法连接更新服务。你可以继续使用当前版本，稍后再试。"
                : updater.message || formatUpdaterStatus(updater.status)}
          {typeof updater.progressPercent === "number"
            ? ` 下载进度：${Math.round(updater.progressPercent)}%。`
            : ""}
        </div>

        {updater.releaseNotes ? (
          <div className="space-y-1">
            <div className="text-sm font-medium text-slate-900">本次更新</div>
            <p className="max-w-[70ch] whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {updater.releaseNotes}
            </p>
          </div>
        ) : null}

        {updater.updateRequired ? (
          <p className="text-sm font-medium text-amber-800">
            当前版本已经低于支持范围，需要更新后才能继续使用联网创作服务。
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {showCheckButton ? (
            <Button
              onClick={async () => {
                setIsBusy(true);
                try {
                  await checkForDesktopUpdates();
                } catch {
                  // The shared updater snapshot exposes a recoverable user-facing error.
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy || updateBusy || !updater.isSupported}
            >
              {showDownloadButton
                ? "下载新版本"
                : updater.status === "checking"
                  ? "正在检查"
                  : "检查更新"}
            </Button>
          ) : null}
          {showInstallButton ? (
            <Button
              onClick={async () => {
                setIsBusy(true);
                try {
                  await quitAndInstallDesktopUpdate();
                } catch {
                  // The shared updater snapshot exposes a recoverable user-facing error.
                } finally {
                  setIsBusy(false);
                }
              }}
              disabled={isBusy || !updater.canInstall || updater.status === "installing"}
            >
              {updater.status === "installing" ? "正在启动安装" : "重新启动并安装"}
            </Button>
          ) : null}
          {APP_PRODUCT_MODE === "consumer" && updater.status === "disabled" ? (
            <span className="self-center text-xs text-slate-500">
              当前安装方式需要手动更新。
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
