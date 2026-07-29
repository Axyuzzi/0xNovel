import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { appendDesktopLog, cleanupDesktopLogs, logDesktopError } from "./runtime/logging";
import { resolveDesktopServerPort, startDesktopServer } from "./runtime/server";
import {
  isPortableDesktopRuntime,
  resolveDesktopAppDataDir,
  resolveDesktopProfileDataDir,
  resolveDesktopLogsDir,
  resolveDesktopRuntimeConfig,
  resolveDesktopUpdateChannel,
  resolveDesktopWindowIcon,
  resolveRendererDevUrl,
  resolveRendererIndexHtml,
} from "./runtime/paths";
import {
  createBootstrapSnapshot,
  desktopBootstrapStore,
  desktopUpdaterStore,
} from "./runtime/state";
import { initializeDesktopUpdater, type DesktopUpdaterController } from "./runtime/updater";
import {
  exportCredentialFromServer,
  restoreCredentialToServer,
} from "./runtime/credentialBroker";
import {
  canPersistDesktopCredential,
  clearDesktopCredential,
  loadDesktopCredential,
  saveDesktopCredential,
} from "./runtime/credentialVault";
import { deriveLocalProfileId } from "./runtime/profileIdentity";
import {
  applyPreparedProfileRestore,
  createProfileBackup,
  discardPreparedProfileRestore,
  exportProfileBackup,
  prepareProfileRestore,
  resolveProfileBackupsDir,
} from "./runtime/profileBackup";
import {
  LOCAL_PROFILE_DELETION_CONFIRMATION,
  moveLocalProfileToTrash,
} from "./runtime/profileDeletion";

const APP_USER_MODEL_ID = "com.0xnovelagent.desktop";
const MAIN_WINDOW_BACKGROUND = "#08101f";
const BOOTSTRAP_CHANNEL = "desktop:bootstrap-state-changed";
const UPDATER_CHANNEL = "desktop:updater-state-changed";
const PREPARE_CLOSE_CHANNEL = "desktop:prepare-content-close";
const localApiSessionToken = randomBytes(32).toString("base64url");
const credentialBrokerToken = randomBytes(32).toString("base64url");
const ANONYMOUS_PROFILE_ID = "00000000000000000000000000000000";

let mainWindow: BrowserWindow | null = null;
let stopServer: (() => Promise<void>) | null = null;
let updaterController: DesktopUpdaterController | null = null;
let rendererReady = false;
let appShellReady = false;
let serverHealthy = false;
let mainWindowShown = false;
let bootstrapFailed = false;
let initialUpdateCheckScheduled = false;
let desktopServerPort: number | null = null;
let activeProfileId = ANONYMOUS_PROFILE_ID;
let activeRelayUserId: string | null = null;
let activeCredentialPersistent = false;
let appRelaunchScheduled = false;
let allowMainWindowClose = false;
let closeRequestPending = false;

function getCredentialBrokerOptions() {
  if (desktopServerPort == null) {
    throw new Error("创作服务仍在启动，请稍后重试。");
  }
  return {
    port: desktopServerPort,
    localApiSessionToken,
    credentialBrokerToken,
  };
}

// 换账号前调服务端的 drain 接口，把所有 running 的创作操作标为 outcome_unknown，
// 避免停服务杀掉在途流式写入后这些操作永远卡在 running。best-effort：调用方吞掉错误。
async function drainInFlightOperationsFromDesktop(): Promise<void> {
  if (desktopServerPort == null) {
    return;
  }
  const response = await fetch(
    `http://127.0.0.1:${desktopServerPort}/api/consumer/production/operations/drain`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-0xnovel-local-session": localApiSessionToken,
        "x-0xnovel-credential-broker": credentialBrokerToken,
      },
    },
  );
  if (!response.ok) {
    throw new Error(`drain responded ${response.status}`);
  }
}

function relaunchApp(): void {
  appRelaunchScheduled = true;
  app.relaunch();
  app.exit(0);
}

function appendBootstrapStage(stage: string, detail: string): void {
  appendDesktopLog("desktop.bootstrap.stage", `${stage}: ${detail}`);
}

function broadcastToMainWindow(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send(channel, payload);
}

function publishBootstrapSnapshot(): void {
  broadcastToMainWindow(BOOTSTRAP_CHANNEL, desktopBootstrapStore.getSnapshot());
}

function publishUpdaterSnapshot(): void {
  broadcastToMainWindow(UPDATER_CHANNEL, desktopUpdaterStore.getSnapshot());
}

function setBootstrapSnapshot(snapshot: ReturnType<typeof createBootstrapSnapshot>): void {
  desktopBootstrapStore.setSnapshot(snapshot);
}

function initializeDesktopUpdaterController(): void {
  if (updaterController) {
    return;
  }

  updaterController = initializeDesktopUpdater({
    currentVersion: app.getVersion(),
    updateChannel: resolveDesktopUpdateChannel(),
    isPackaged: app.isPackaged,
    isPortable: isPortableDesktopRuntime(),
  });
}

function maybeScheduleUpdateCheck(delayMs?: number): void {
  if (initialUpdateCheckScheduled || !updaterController) {
    return;
  }

  updaterController.scheduleInitialCheck(delayMs);
  initialUpdateCheckScheduled = true;
}

function updateBootstrapProgress(): void {
  if (bootstrapFailed) {
    return;
  }

  if (!serverHealthy) {
    setBootstrapSnapshot(createBootstrapSnapshot({
      state: "starting-server",
      stage: "server-starting",
      title: "正在准备你的创作空间",
      detail: rendererReady
        ? "界面已经准备好，正在恢复本机创作资料。"
        : "正在加载创作所需的本机资料。",
    }));
    return;
  }

  if (!appShellReady) {
    setBootstrapSnapshot(createBootstrapSnapshot({
      state: "loading-ui",
      stage: "server-healthy",
      title: "马上就好",
      detail: "正在打开你的创作首页。",
    }));
    return;
  }

  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "ready",
    stage: "main-window-shown",
    title: "创作空间已准备好",
    detail: "可以继续你的故事了。",
    canRetry: false,
  }));
  maybeScheduleUpdateCheck();
}

function showMainWindowIfReady(): void {
  if (!mainWindow || mainWindowShown || !rendererReady || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.show();
  mainWindow.focus();
  mainWindowShown = true;
  appendBootstrapStage(
    "main-window-shown",
    serverHealthy
      ? "主窗口已经显示。"
      : "主窗口已经显示，本地服务仍在继续启动中。",
  );
  updateBootstrapProgress();
}

function createMainWindow(port: number): BrowserWindow {
  const runtimeConfig = resolveDesktopRuntimeConfig({
    port,
    isPackaged: app.isPackaged,
    appVersion: app.getVersion(),
    apiSessionToken: localApiSessionToken,
    updateChannel: resolveDesktopUpdateChannel(),
  });
  process.env.AI_NOVEL_DESKTOP_RUNTIME = JSON.stringify(runtimeConfig);
  const windowIcon = resolveDesktopWindowIcon();

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: MAIN_WINDOW_BACKGROUND,
    icon: windowIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  window.webContents.on("did-finish-load", () => {
    publishBootstrapSnapshot();
    publishUpdaterSnapshot();
  });
  window.on("close", (event) => {
    if (allowMainWindowClose || !window.webContents.getURL().includes("/novels/")) {
      return;
    }
    event.preventDefault();
    if (closeRequestPending) {
      return;
    }
    closeRequestPending = true;
    window.webContents.send(PREPARE_CLOSE_CHANNEL);
  });

  if (process.env.AI_NOVEL_DESKTOP_RENDERER_URL?.trim()) {
    void window.loadURL(resolveRendererDevUrl());
  } else if (!app.isPackaged) {
    void window.loadURL(resolveRendererDevUrl());
  } else {
    void window.loadFile(resolveRendererIndexHtml());
  }

  return window;
}

async function bootstrapDesktopApp(): Promise<void> {
  appendBootstrapStage("app-ready", "Electron app reported ready.");
  cleanupDesktopLogs();
  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "launching",
    stage: "app-ready",
    title: "正在准备你的创作空间",
    detail: "正在打开 0xNovelAgent。",
    canRetry: false,
  }));
  initializeDesktopUpdaterController();
  maybeScheduleUpdateCheck(1_000);
  const persistedCredential = loadDesktopCredential();
  activeRelayUserId = persistedCredential?.userId ?? null;
  activeProfileId = persistedCredential
    ? deriveLocalProfileId(persistedCredential.userId)
    : ANONYMOUS_PROFILE_ID;
  activeCredentialPersistent = persistedCredential?.persistent ?? false;

  const port = await resolveDesktopServerPort({ isPackaged: app.isPackaged });
  mainWindow = createMainWindow(port);
  mainWindow.on("closed", () => {
    mainWindow = null;
    mainWindowShown = false;
  });

  appendBootstrapStage("server-starting", `Starting desktop server on 127.0.0.1:${port}.`);
  updateBootstrapProgress();

  const server = await startDesktopServer({
    isPackaged: app.isPackaged,
    localApiSessionToken,
    credentialBrokerToken,
    profileId: activeProfileId,
    port,
  });
  stopServer = server.stop;
  serverHealthy = true;
  desktopServerPort = server.port;
  if (persistedCredential) {
    try {
      await restoreCredentialToServer(getCredentialBrokerOptions(), persistedCredential.token);
      appendBootstrapStage("session-restored", "Saved user session restored.");
    } catch (error) {
      logDesktopError("desktop.session.restore", error);
    }
  }
  appendBootstrapStage("server-healthy", `Desktop server is healthy on 127.0.0.1:${server.port}.`);
  updateBootstrapProgress();
}

function focusExistingWindow(): void {
  const targetWindow = mainWindow;
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  if (targetWindow.isMinimized()) {
    targetWindow.restore();
  }
  targetWindow.show();
  targetWindow.focus();
}

function createBootstrapFailureHtml(): string {
  return `<!DOCTYPE html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta
        http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
      />
      <title>0xNovelAgent</title>
      <style>
        :root {
          color-scheme: dark;
          font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif;
        }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #08101f, #122033);
          color: #f8fafc;
        }
        main {
          width: min(520px, calc(100vw - 48px));
          text-align: center;
        }
        h1 { margin: 0 0 12px; font-size: 28px; }
        p { margin: 0; color: #cbd5e1; line-height: 1.8; }
        .actions {
          margin-top: 28px;
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        button {
          border: 0;
          border-radius: 12px;
          padding: 12px 20px;
          background: #67e8f9;
          color: #082f49;
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        button.secondary {
          background: #1e293b;
          color: #e2e8f0;
        }
      </style>
    </head>
    <body>
      <main>
        <h1>创作空间暂时没有准备好</h1>
        <p>你的本地作品不会受到影响。可以重新启动，或导出诊断信息后联系支持。</p>
        <div class="actions">
          <button type="button" onclick="window.__AI_NOVEL_DESKTOP__?.restartApp?.()">重新启动</button>
          <button type="button" class="secondary" onclick="window.__AI_NOVEL_DESKTOP__?.openLogsDirectory?.()">导出诊断信息</button>
        </div>
      </main>
    </body>
  </html>`;
}

async function showBootstrapFailureInProductWindow(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = new BrowserWindow({
      width: 960,
      height: 720,
      minWidth: 760,
      minHeight: 560,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: MAIN_WINDOW_BACKGROUND,
      icon: resolveDesktopWindowIcon(),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
  }

  const failureUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(createBootstrapFailureHtml())}`;
  await mainWindow.loadURL(failureUrl);
  mainWindow.show();
  mainWindow.focus();
  mainWindowShown = true;
}

function registerDesktopIpcHandlers(): void {
  ipcMain.handle("desktop:get-bootstrap-snapshot", () => desktopBootstrapStore.getSnapshot());
  ipcMain.handle("desktop:get-updater-snapshot", () => desktopUpdaterStore.getSnapshot());
  ipcMain.handle("desktop:check-for-updates", async () => {
    await updaterController?.checkForUpdates();
    return desktopUpdaterStore.getSnapshot();
  });
  ipcMain.handle("desktop:quit-and-install", () => {
    updaterController?.quitAndInstall();
    return true;
  });
  ipcMain.handle("desktop:open-logs-directory", () => shell.openPath(resolveDesktopLogsDir()));
  ipcMain.handle("desktop:copy-log-path", () => {
    const logPath = desktopBootstrapStore.getSnapshot().logFile;
    clipboard.writeText(logPath);
    return logPath;
  });
  ipcMain.handle("desktop:restart-app", () => {
    relaunchApp();
    return true;
  });
  ipcMain.handle("desktop:can-persist-session", () => canPersistDesktopCredential());
  ipcMain.handle("desktop:persist-authenticated-session", async (_event, keepSignedIn) => {
    const credential = await exportCredentialFromServer(getCredentialBrokerOptions());
    const persistent = keepSignedIn !== false;
    saveDesktopCredential({
      ...credential,
      persistent,
    });
    activeCredentialPersistent = persistent;
    activeRelayUserId = credential.userId;
    const nextProfileId = deriveLocalProfileId(credential.userId);
    const restartRequired = nextProfileId !== activeProfileId;
    if (restartRequired) {
      setTimeout(() => relaunchApp(), 250);
    }
    return { persisted: true, restartRequired };
  });
  ipcMain.handle("desktop:clear-authenticated-session", () => {
    clearDesktopCredential();
    activeRelayUserId = null;
    return { cleared: true };
  });
  // 换账号：排空在途创作操作 → 停掉绑定旧资料域的服务 → 清凭证 → 重启。
  // 复刻 delete-local-profile 的成熟停服务→重启路径，但不清除作品数据。
  // drain 是 best-effort：失败也不阻断换账号，重启后 reconcileOperation 会兜底处理残留 running。
  ipcMain.handle("desktop:switch-account", async () => {
    try {
      await drainInFlightOperationsFromDesktop();
    } catch (error) {
      logDesktopError("[desktop] switch-account drain failed (will continue)", error);
    }
    await stopServer?.();
    stopServer = null;
    clearDesktopCredential();
    activeRelayUserId = null;
    setTimeout(() => relaunchApp(), 100);
    return { switched: true };
  });
  ipcMain.handle("desktop:create-profile-backup", async () => {
    if (!activeRelayUserId || activeProfileId === ANONYMOUS_PROFILE_ID) {
      throw new Error("登录后才能备份本地作品。");
    }
    const data = await createProfileBackup({
      profileDir: resolveDesktopProfileDataDir(activeProfileId),
      userId: activeRelayUserId,
      appVersion: app.getVersion(),
    });
    return {
      canceled: false,
      ...data,
    };
  });
  ipcMain.handle("desktop:export-profile-backup", async () => {
    if (!activeRelayUserId || activeProfileId === ANONYMOUS_PROFILE_ID) {
      throw new Error("登录后才能导出本地作品。");
    }
    const backup = await createProfileBackup({
      profileDir: resolveDesktopProfileDataDir(activeProfileId),
      userId: activeRelayUserId,
      appVersion: app.getVersion(),
    });
    const selected = await dialog.showSaveDialog({
      title: "导出本地作品备份",
      defaultPath: path.basename(backup.path),
      buttonLabel: "导出备份",
      filters: [{
        name: "0xNovelAgent 作品备份",
        extensions: ["0xnovel-backup"],
      }],
    });
    if (selected.canceled || !selected.filePath) {
      return { canceled: true };
    }
    const destinationPath = selected.filePath.endsWith(".0xnovel-backup")
      ? selected.filePath
      : `${selected.filePath}.0xnovel-backup`;
    exportProfileBackup(backup.path, destinationPath);
    return {
      canceled: false,
      path: destinationPath,
      createdAt: backup.createdAt,
      size: backup.size,
    };
  });
  ipcMain.handle("desktop:open-profile-backups-directory", () => {
    if (activeProfileId === ANONYMOUS_PROFILE_ID) {
      throw new Error("登录后才能查看本地备份。");
    }
    const backupsDir = resolveProfileBackupsDir(resolveDesktopProfileDataDir(activeProfileId));
    fs.mkdirSync(backupsDir, { recursive: true });
    return shell.openPath(backupsDir);
  });
  ipcMain.handle("desktop:restore-profile-backup", async () => {
    if (!activeRelayUserId || activeProfileId === ANONYMOUS_PROFILE_ID) {
      throw new Error("登录后才能恢复本地作品。");
    }
    const selected = await dialog.showOpenDialog({
      title: "选择本地作品备份",
      buttonLabel: "选择备份",
      properties: ["openFile"],
      filters: [{
        name: "0xNovelAgent 作品备份",
        extensions: ["0xnovel-backup"],
      }],
    });
    if (selected.canceled || !selected.filePaths[0]) {
      return { canceled: true };
    }
    const profileDir = resolveDesktopProfileDataDir(activeProfileId);
    const prepared = await prepareProfileRestore({
      profileDir,
      userId: activeRelayUserId,
      backupPath: selected.filePaths[0],
    });
    const confirmation = await dialog.showMessageBox({
      type: "warning",
      title: "恢复本地作品",
      message: "要恢复这个备份吗？",
      detail: "当前作品会先自动创建安全备份。恢复完成后软件将重新启动。",
      buttons: ["恢复并重新启动", "取消"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (confirmation.response !== 0) {
      discardPreparedProfileRestore(profileDir, prepared);
      return { canceled: true };
    }
    const safetyBackup = await createProfileBackup({
      profileDir,
      userId: activeRelayUserId,
      appVersion: app.getVersion(),
    });
    try {
      await stopServer?.();
      stopServer = null;
      const recoveryDir = applyPreparedProfileRestore({
        profileDir,
        prepared,
      });
      setTimeout(() => relaunchApp(), 100);
      return {
        canceled: false,
        safetyBackupPath: safetyBackup.path,
        recoveryDir,
      };
    } catch (error) {
      setTimeout(() => relaunchApp(), 100);
      throw error;
    }
  });
  ipcMain.handle("desktop:delete-local-profile", async (_event, confirmation) => {
    if (!activeRelayUserId || activeProfileId === ANONYMOUS_PROFILE_ID) {
      throw new Error("登录后才能删除当前账号的本地作品。");
    }
    if (confirmation !== LOCAL_PROFILE_DELETION_CONFIRMATION) {
      throw new Error(`请输入“${LOCAL_PROFILE_DELETION_CONFIRMATION}”后再继续。`);
    }

    const prompt = await dialog.showMessageBox({
      type: "warning",
      title: "删除这台电脑上的作品",
      message: "确定删除当前账号在这台电脑上的全部作品吗？",
      detail: "软件会退出登录并重新启动。资料会移入系统回收站，清空回收站后无法恢复；账号、积分和中转消费记录不会被删除。",
      buttons: ["删除本机作品", "取消"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    if (prompt.response !== 0) {
      return { canceled: true, deleted: false };
    }

    const profileDir = resolveDesktopProfileDataDir(activeProfileId);
    try {
      await stopServer?.();
      stopServer = null;
      const result = await moveLocalProfileToTrash({
        appDataDir: resolveDesktopAppDataDir(),
        profileDir,
        confirmation,
        trashItem: (targetPath) => shell.trashItem(targetPath),
      });
      clearDesktopCredential();
      activeRelayUserId = null;
      setTimeout(() => relaunchApp(), 100);
      return {
        canceled: false,
        deleted: result.deleted,
      };
    } catch (error) {
      setTimeout(() => relaunchApp(), 100);
      throw error;
    }
  });

  ipcMain.on("desktop:renderer-ready", () => {
    if (rendererReady) {
      return;
    }
    rendererReady = true;
    appendBootstrapStage("renderer-ready", "Renderer bootstrap shell is ready.");
    showMainWindowIfReady();
    updateBootstrapProgress();
  });

  ipcMain.on("desktop:app-shell-ready", () => {
    if (appShellReady) {
      return;
    }
    appShellReady = true;
    updateBootstrapProgress();
  });
  ipcMain.on("desktop:content-close-ready", (_event, success) => {
    if (!closeRequestPending) {
      return;
    }
    closeRequestPending = false;
    if (success !== true) {
      mainWindow?.show();
      mainWindow?.focus();
      return;
    }
    allowMainWindowClose = true;
    mainWindow?.close();
  });
}

function registerStoreBroadcasts(): void {
  desktopBootstrapStore.subscribe(() => {
    publishBootstrapSnapshot();
  });
  desktopUpdaterStore.subscribe(() => {
    publishUpdaterSnapshot();
  });
}

async function handleBootstrapFailure(error: unknown): Promise<void> {
  bootstrapFailed = true;
  initializeDesktopUpdaterController();
  maybeScheduleUpdateCheck(0);
  logDesktopError("desktop.main.bootstrap", error);
  setBootstrapSnapshot(createBootstrapSnapshot({
    state: "error",
    stage: "error",
    title: "创作空间暂时没有准备好",
    detail: "你的本地作品不会受到影响。请重新启动，或导出诊断信息后联系支持。",
  }));

  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) {
    showMainWindowIfReady();
    return;
  }

  await showBootstrapFailureInProductWindow();
}

app.setPath("userData", resolveDesktopAppDataDir());
app.setAppUserModelId(APP_USER_MODEL_ID);
registerDesktopIpcHandlers();
registerStoreBroadcasts();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  focusExistingWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (!activeCredentialPersistent && !appRelaunchScheduled) {
    clearDesktopCredential();
  }
  if (stopServer) {
    void stopServer();
  }
});

app.whenReady()
  .then(() => bootstrapDesktopApp())
  .catch(async (error) => {
    console.error("[desktop] bootstrap failed.", error);
    await handleBootstrapFailure(error);
  });
