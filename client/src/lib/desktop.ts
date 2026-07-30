import { useEffect, useState } from "react";
import { APP_RUNTIME } from "./constants";
import { runPrepareLogoutHandlers } from "./prepareLogout";

export type DesktopBootstrapState = "launching" | "starting-server" | "loading-ui" | "ready" | "error";
export type DesktopUpdaterStatus =
  | "disabled"
  | "idle"
  | "checking"
  | "update-available"
  | "downloading"
  | "verifying"
  | "downloaded"
  | "installing"
  | "not-available"
  | "error";

export interface DesktopBootstrapSnapshot {
  state: DesktopBootstrapState;
  stage: string;
  title: string;
  detail: string;
  logDir: string;
  logFile: string;
  updatedAt: string;
  canRetry: boolean;
}

export interface DesktopUpdaterSnapshot {
  status: DesktopUpdaterStatus;
  message: string;
  currentVersion: string;
  currentBuildNumber: number;
  availableVersion: string | null;
  availableBuildNumber: number | null;
  releaseNotes: string;
  fileSize: number | null;
  forcedUpdate: boolean;
  minSupportedVersion: string | null;
  updateRequired: boolean;
  progressPercent: number | null;
  bytesPerSecond: number | null;
  channel: string;
  isPortable: boolean;
  isPackaged: boolean;
  isSupported: boolean;
  canInstall: boolean;
  updatedAt: string;
  lastCheckedAt: string | null;
}

const DEFAULT_BOOTSTRAP_SNAPSHOT: DesktopBootstrapSnapshot = {
  state: "launching",
  stage: "launching",
  title: "正在启动桌面工作区",
  detail: "正在准备桌面本地运行时。",
  logDir: "",
  logFile: "",
  updatedAt: "",
  canRetry: false,
};

const DEFAULT_UPDATER_SNAPSHOT: DesktopUpdaterSnapshot = {
  status: "disabled",
  message: "Updates are not available in this runtime.",
  currentVersion: "0.0.0",
  currentBuildNumber: 0,
  availableVersion: null,
  availableBuildNumber: null,
  releaseNotes: "",
  fileSize: null,
  forcedUpdate: false,
  minSupportedVersion: null,
  updateRequired: false,
  progressPercent: null,
  bytesPerSecond: null,
  channel: "beta",
  isPortable: false,
  isPackaged: false,
  isSupported: false,
  canInstall: false,
  updatedAt: "",
  lastCheckedAt: null,
};

let currentUpdaterSnapshot = DEFAULT_UPDATER_SNAPSHOT;

function getDesktopBridge() {
  if (typeof window === "undefined" || APP_RUNTIME !== "desktop") {
    return null;
  }

  return window.__AI_NOVEL_DESKTOP__ ?? null;
}

export function notifyDesktopRendererReady(): void {
  getDesktopBridge()?.notifyRendererReady?.();
}

export function notifyDesktopAppShellReady(): void {
  getDesktopBridge()?.notifyAppShellReady?.();
}

export async function checkForDesktopUpdates(): Promise<void> {
  await getDesktopBridge()?.checkForUpdates?.();
}

export async function quitAndInstallDesktopUpdate(): Promise<void> {
  await runPrepareLogoutHandlers();
  await getDesktopBridge()?.quitAndInstall?.();
}

export function isDesktopUpdateRequired(): boolean {
  return APP_RUNTIME === "desktop" && currentUpdaterSnapshot.updateRequired;
}

export async function openDesktopLogsDirectory(): Promise<void> {
  await getDesktopBridge()?.openLogsDirectory?.();
}

export async function copyDesktopLogPath(): Promise<string | undefined> {
  return getDesktopBridge()?.copyLogPath?.();
}

export async function restartDesktopApp(): Promise<void> {
  await getDesktopBridge()?.restartApp?.();
}

export async function canPersistDesktopSession(): Promise<boolean> {
  return (await getDesktopBridge()?.canPersistSession?.()) ?? false;
}

export async function persistDesktopAuthenticatedSession(keepSignedIn: boolean): Promise<boolean> {
  const result = await getDesktopBridge()?.persistAuthenticatedSession?.(keepSignedIn);
  return result?.persisted === true;
}

export async function clearDesktopAuthenticatedSession(): Promise<void> {
  await getDesktopBridge()?.clearAuthenticatedSession?.();
}

// 换账号：桌面端会排空在途创作操作、停掉旧资料域服务、清凭证并重启 app。
// 整个 app 会被重启到登录页，所以调用方不需要在之后更新 UI 状态。
export async function switchDesktopAccount(): Promise<void> {
  await getDesktopBridge()?.switchAccount?.();
}

export interface DesktopProfileBackupResult {
  canceled: boolean;
  path?: string;
  createdAt?: string;
  size?: number;
}

export async function createDesktopProfileBackup(): Promise<DesktopProfileBackupResult> {
  const bridge = getDesktopBridge();
  if (!bridge?.createProfileBackup) {
    throw new Error("本地备份仅在桌面版中提供。");
  }
  return bridge.createProfileBackup();
}

export async function exportDesktopProfileBackup(): Promise<DesktopProfileBackupResult> {
  const bridge = getDesktopBridge();
  if (!bridge?.exportProfileBackup) {
    throw new Error("本地备份仅在桌面版中提供。");
  }
  return bridge.exportProfileBackup();
}

export async function openDesktopProfileBackupsDirectory(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.openProfileBackupsDirectory) {
    throw new Error("本地备份仅在桌面版中提供。");
  }
  await bridge.openProfileBackupsDirectory();
}

export async function restoreDesktopProfileBackup(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.restoreProfileBackup) {
    throw new Error("本地备份仅在桌面版中提供。");
  }
  const result = await bridge.restoreProfileBackup();
  return result.canceled !== true;
}

export async function deleteDesktopLocalProfile(
  confirmation: string,
): Promise<{ canceled: boolean; deleted: boolean }> {
  const bridge = getDesktopBridge();
  if (!bridge?.deleteLocalProfile) {
    throw new Error("删除本机作品仅在桌面版中提供。");
  }
  return bridge.deleteLocalProfile(confirmation);
}

export function subscribeDesktopBeforeContentClose(
  listener: () => void | Promise<void>,
): () => void {
  const unsubscribe = getDesktopBridge()?.subscribeBeforeContentClose?.(listener);
  return typeof unsubscribe === "function" ? unsubscribe : () => undefined;
}

export function useDesktopBootstrap(): DesktopBootstrapSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopBootstrapSnapshot>(DEFAULT_BOOTSTRAP_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getBootstrapSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getBootstrapSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeBootstrapState?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}

export function useDesktopUpdater(): DesktopUpdaterSnapshot {
  const [snapshot, setSnapshot] = useState<DesktopUpdaterSnapshot>(DEFAULT_UPDATER_SNAPSHOT);

  useEffect(() => {
    const bridge = getDesktopBridge();
    if (!bridge?.getUpdaterSnapshot) {
      return undefined;
    }

    let cancelled = false;

    void bridge.getUpdaterSnapshot().then((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        currentUpdaterSnapshot = nextSnapshot;
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = bridge.subscribeUpdaterStatus?.((nextSnapshot) => {
      if (!cancelled && nextSnapshot) {
        currentUpdaterSnapshot = nextSnapshot;
        setSnapshot(nextSnapshot);
      }
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return snapshot;
}
