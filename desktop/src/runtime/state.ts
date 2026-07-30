import { EventEmitter } from "node:events";
import { resolveDesktopLogsDir, resolveDesktopMainLogFile } from "./paths";

export type DesktopBootstrapState = "launching" | "starting-server" | "loading-ui" | "ready" | "error";
export type DesktopBootstrapStage =
  | "launching"
  | "app-ready"
  | "server-starting"
  | "server-healthy"
  | "renderer-ready"
  | "main-window-shown"
  | "error";

export interface DesktopBootstrapSnapshot {
  state: DesktopBootstrapState;
  stage: DesktopBootstrapStage;
  title: string;
  detail: string;
  logDir: string;
  logFile: string;
  updatedAt: string;
  canRetry: boolean;
}

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

type SnapshotListener<T> = (snapshot: T) => void;

class SnapshotStore<T> {
  private readonly emitter = new EventEmitter();
  private snapshot: T;

  constructor(initialSnapshot: T) {
    this.snapshot = initialSnapshot;
  }

  getSnapshot(): T {
    return this.snapshot;
  }

  setSnapshot(snapshot: T): void {
    this.snapshot = snapshot;
    this.emitter.emit("snapshot", snapshot);
  }

  subscribe(listener: SnapshotListener<T>): () => void {
    this.emitter.on("snapshot", listener);
    return () => {
      this.emitter.off("snapshot", listener);
    };
  }
}

function nowIsoString(): string {
  return new Date().toISOString();
}

export function createBootstrapSnapshot(
  value: Pick<DesktopBootstrapSnapshot, "state" | "stage" | "title" | "detail">
  & Partial<Pick<DesktopBootstrapSnapshot, "updatedAt" | "canRetry">>,
): DesktopBootstrapSnapshot {
  return {
    state: value.state,
    stage: value.stage,
    title: value.title,
    detail: value.detail,
    logDir: resolveDesktopLogsDir(),
    logFile: resolveDesktopMainLogFile(),
    updatedAt: value.updatedAt ?? nowIsoString(),
    canRetry: value.canRetry ?? value.state === "error",
  };
}

export function createUpdaterSnapshot(
  value: Omit<DesktopUpdaterSnapshot, "updatedAt">
  & Partial<Pick<DesktopUpdaterSnapshot, "updatedAt">>,
): DesktopUpdaterSnapshot {
  return {
    ...value,
    updatedAt: value.updatedAt ?? nowIsoString(),
  };
}

export const desktopBootstrapStore = new SnapshotStore<DesktopBootstrapSnapshot>(
  createBootstrapSnapshot({
    state: "launching",
    stage: "launching",
    title: "正在准备你的创作空间",
    detail: "正在打开 0xNovelAgent。",
    canRetry: false,
  }),
);

export const desktopUpdaterStore = new SnapshotStore<DesktopUpdaterSnapshot>(
  createUpdaterSnapshot({
    status: "disabled",
    message: "Updates are unavailable until the installed desktop build finishes booting.",
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
    lastCheckedAt: null,
  }),
);
