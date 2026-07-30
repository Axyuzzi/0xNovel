import fs from "node:fs";
import path from "node:path";
import { appendDesktopLog, logDesktopError } from "./logging";
import {
  compareStableVersions,
  downloadWindowsRelease,
  fetchLatestWindowsRelease,
  type PackageRelease,
} from "./packageReleaseClient";
import { createUpdaterSnapshot, desktopUpdaterStore } from "./state";

export interface DesktopUpdaterController {
  checkForUpdates: () => Promise<void>;
  getDownloadedInstallerPath: () => string | null;
  markInstalling: () => void;
  scheduleInitialCheck: (delayMs?: number) => void;
}

interface DesktopUpdaterOptions {
  currentVersion: string;
  currentBuildNumber: number;
  updateChannel: string;
  isPackaged: boolean;
  isPortable: boolean;
  apiBaseUrl: string | null;
  packageCode: string | null;
  appDataDir: string;
}

function markUpdaterSnapshot(snapshot: ReturnType<typeof createUpdaterSnapshot>): void {
  desktopUpdaterStore.setSnapshot(snapshot);
}

function baseSnapshot(options: DesktopUpdaterOptions) {
  return {
    currentVersion: options.currentVersion,
    currentBuildNumber: options.currentBuildNumber,
    availableVersion: null,
    availableBuildNumber: null,
    releaseNotes: "",
    fileSize: null,
    forcedUpdate: false,
    minSupportedVersion: null,
    updateRequired: false,
    progressPercent: null,
    bytesPerSecond: null,
    channel: options.updateChannel,
    isPortable: options.isPortable,
    isPackaged: options.isPackaged,
    canInstall: false,
    lastCheckedAt: null,
  };
}

function updaterUnavailableReason(options: DesktopUpdaterOptions): string | null {
  if (!options.isPackaged) {
    return "开发环境不会下载正式更新。";
  }
  if (options.isPortable) {
    return "便携版不会自动安装更新，请下载新版安装包。";
  }
  if (process.env.AI_NOVEL_DESKTOP_DISABLE_UPDATER?.trim() === "true") {
    return "当前环境已经关闭自动更新。";
  }
  if (!options.apiBaseUrl || !options.packageCode) {
    return "当前安装包没有配置更新服务。";
  }
  return null;
}

function releaseRequiresUpdate(
  release: PackageRelease,
  currentVersion: string,
): boolean {
  return release.forcedUpdate
    || Boolean(
      release.minSupportedVersion
      && compareStableVersions(currentVersion, release.minSupportedVersion) < 0,
    );
}

function releaseCacheDir(options: DesktopUpdaterOptions, release: PackageRelease): string {
  return path.join(options.appDataDir, "updates", String(release.id));
}

export function initializeDesktopUpdater(options: DesktopUpdaterOptions): DesktopUpdaterController {
  const unavailableReason = updaterUnavailableReason(options);
  let availableRelease: PackageRelease | null = null;
  let downloadedInstallerPath: string | null = null;

  markUpdaterSnapshot(createUpdaterSnapshot({
    ...baseSnapshot(options),
    status: unavailableReason ? "disabled" : "idle",
    message: unavailableReason ?? "可以检查软件更新。",
    isSupported: unavailableReason == null,
  }));

  if (unavailableReason || !options.apiBaseUrl || !options.packageCode) {
    return {
      async checkForUpdates() {
        return undefined;
      },
      getDownloadedInstallerPath() {
        return null;
      },
      markInstalling() {
        return undefined;
      },
      scheduleInitialCheck() {
        return undefined;
      },
    };
  }

  const clientOptions = {
    apiBaseUrl: options.apiBaseUrl,
    packageCode: options.packageCode,
  };

  const checkForUpdates = async (): Promise<void> => {
    const snapshot = desktopUpdaterStore.getSnapshot();
    if (
      snapshot.status === "checking"
      || snapshot.status === "downloading"
      || snapshot.status === "verifying"
      || snapshot.status === "installing"
    ) {
      return;
    }

    try {
      if (snapshot.status === "update-available" && availableRelease) {
        appendDesktopLog(
          "desktop.updater",
          `Downloading approved update ${availableRelease.version}.`,
        );
        markUpdaterSnapshot(createUpdaterSnapshot({
          ...snapshot,
          status: "downloading",
          message: `正在下载版本 ${availableRelease.version}。`,
          progressPercent: 0,
          bytesPerSecond: 0,
          canInstall: false,
          lastCheckedAt: new Date().toISOString(),
        }));
        downloadedInstallerPath = await downloadWindowsRelease(
          availableRelease,
          {
            ...clientOptions,
            targetDir: releaseCacheDir(options, availableRelease),
            onProgress: ({ percent, bytesPerSecond }) => {
              markUpdaterSnapshot(createUpdaterSnapshot({
                ...desktopUpdaterStore.getSnapshot(),
                status: percent >= 100 ? "verifying" : "downloading",
                message: percent >= 100
                  ? "正在校验新版安装包。"
                  : `正在下载版本 ${availableRelease?.version ?? ""}。`,
                progressPercent: percent,
                bytesPerSecond,
                canInstall: false,
              }));
            },
          },
        );
        markUpdaterSnapshot(createUpdaterSnapshot({
          ...desktopUpdaterStore.getSnapshot(),
          status: "downloaded",
          message: `版本 ${availableRelease.version} 已准备好，可以重新启动并安装。`,
          progressPercent: 100,
          bytesPerSecond: null,
          canInstall: true,
          lastCheckedAt: new Date().toISOString(),
        }));
        return;
      }

      appendDesktopLog("desktop.updater", "Checking the 0xAPI package release service.");
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...snapshot,
        status: "checking",
        message: "正在检查软件更新。",
        progressPercent: null,
        bytesPerSecond: null,
        canInstall: false,
        lastCheckedAt: new Date().toISOString(),
      }));
      const release = await fetchLatestWindowsRelease(clientOptions);
      if (!release || release.buildNumber <= options.currentBuildNumber) {
        availableRelease = null;
        downloadedInstallerPath = null;
        markUpdaterSnapshot(createUpdaterSnapshot({
          ...baseSnapshot(options),
          status: "not-available",
          message: "已经是最新版本。",
          isSupported: true,
          lastCheckedAt: new Date().toISOString(),
        }));
        return;
      }

      availableRelease = release;
      const updateRequired = releaseRequiresUpdate(release, options.currentVersion);
      appendDesktopLog(
        "desktop.updater",
        `Update ${release.version} (${release.buildNumber}) is available.`,
      );
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...baseSnapshot(options),
        status: "update-available",
        message: updateRequired
          ? `版本 ${release.version} 是继续使用创作服务前必须安装的更新。`
          : `发现新版本 ${release.version}。`,
        isSupported: true,
        availableVersion: release.version,
        availableBuildNumber: release.buildNumber,
        releaseNotes: release.releaseNotes,
        fileSize: release.fileSize,
        forcedUpdate: release.forcedUpdate,
        minSupportedVersion: release.minSupportedVersion,
        updateRequired,
        lastCheckedAt: new Date().toISOString(),
      }));
    } catch (error) {
      logDesktopError("desktop.updater", error);
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...desktopUpdaterStore.getSnapshot(),
        status: "error",
        message: error instanceof Error ? error.message : "暂时无法检查软件更新。",
        canInstall: false,
        progressPercent: null,
        bytesPerSecond: null,
        lastCheckedAt: new Date().toISOString(),
      }));
      throw error;
    }
  };

  const scheduleInitialCheck = (delayMs = 3_000): void => {
    const timer = setTimeout(() => {
      void checkForUpdates().catch(() => undefined);
    }, delayMs);
    timer.unref();
  };

  return {
    checkForUpdates,
    getDownloadedInstallerPath() {
      if (
        !downloadedInstallerPath
        || !fs.existsSync(downloadedInstallerPath)
      ) {
        return null;
      }
      return downloadedInstallerPath;
    },
    markInstalling() {
      markUpdaterSnapshot(createUpdaterSnapshot({
        ...desktopUpdaterStore.getSnapshot(),
        status: "installing",
        message: "正在保存创作内容并启动安装程序。",
        canInstall: false,
      }));
    },
    scheduleInitialCheck,
  };
}
