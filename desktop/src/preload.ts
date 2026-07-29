import { contextBridge, ipcRenderer } from "electron";

const BOOTSTRAP_CHANNEL = "desktop:bootstrap-state-changed";
const UPDATER_CHANNEL = "desktop:updater-state-changed";
const PREPARE_CLOSE_CHANNEL = "desktop:prepare-content-close";

function readRuntimeConfig(): unknown {
  const rawConfig = process.env.AI_NOVEL_DESKTOP_RUNTIME?.trim();
  if (!rawConfig) {
    return {};
  }

  try {
    return JSON.parse(rawConfig) as unknown;
  } catch {
    return {};
  }
}

contextBridge.exposeInMainWorld("__AI_NOVEL_RUNTIME__", readRuntimeConfig());
contextBridge.exposeInMainWorld("__AI_NOVEL_DESKTOP__", {
  getBootstrapSnapshot: () => ipcRenderer.invoke("desktop:get-bootstrap-snapshot"),
  subscribeBootstrapState: (listener: (snapshot: unknown) => void) => {
    const wrappedListener = (_event: unknown, snapshot: unknown) => {
      listener(snapshot);
    };
    ipcRenderer.on(BOOTSTRAP_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(BOOTSTRAP_CHANNEL, wrappedListener);
    };
  },
  notifyRendererReady: () => {
    ipcRenderer.send("desktop:renderer-ready");
  },
  notifyAppShellReady: () => {
    ipcRenderer.send("desktop:app-shell-ready");
  },
  getUpdaterSnapshot: () => ipcRenderer.invoke("desktop:get-updater-snapshot"),
  subscribeUpdaterStatus: (listener: (snapshot: unknown) => void) => {
    const wrappedListener = (_event: unknown, snapshot: unknown) => {
      listener(snapshot);
    };
    ipcRenderer.on(UPDATER_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATER_CHANNEL, wrappedListener);
    };
  },
  checkForUpdates: () => ipcRenderer.invoke("desktop:check-for-updates"),
  quitAndInstall: () => ipcRenderer.invoke("desktop:quit-and-install"),
  openLogsDirectory: () => ipcRenderer.invoke("desktop:open-logs-directory"),
  copyLogPath: () => ipcRenderer.invoke("desktop:copy-log-path"),
  restartApp: () => ipcRenderer.invoke("desktop:restart-app"),
  canPersistSession: () => ipcRenderer.invoke("desktop:can-persist-session"),
  persistAuthenticatedSession: (keepSignedIn: boolean) => (
    ipcRenderer.invoke("desktop:persist-authenticated-session", keepSignedIn)
  ),
  clearAuthenticatedSession: () => ipcRenderer.invoke("desktop:clear-authenticated-session"),
  // 换账号：先排空在途创作操作、停掉绑定旧资料域的服务进程、清除凭证，再重启 app，
  // 让新登录从干净的进程和资料域开始。整个 app 会被重启，所以这是最后一步。
  switchAccount: () => ipcRenderer.invoke("desktop:switch-account"),
  createProfileBackup: () => ipcRenderer.invoke("desktop:create-profile-backup"),
  exportProfileBackup: () => ipcRenderer.invoke("desktop:export-profile-backup"),
  openProfileBackupsDirectory: () => ipcRenderer.invoke("desktop:open-profile-backups-directory"),
  restoreProfileBackup: () => ipcRenderer.invoke("desktop:restore-profile-backup"),
  deleteLocalProfile: (confirmation: string) => (
    ipcRenderer.invoke("desktop:delete-local-profile", confirmation)
  ),
  subscribeBeforeContentClose: (listener: () => void | Promise<void>) => {
    const wrappedListener = () => {
      void Promise.resolve(listener())
        .then(() => {
          ipcRenderer.send("desktop:content-close-ready", true);
        })
        .catch(() => {
          ipcRenderer.send("desktop:content-close-ready", false);
        });
    };
    ipcRenderer.on(PREPARE_CLOSE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(PREPARE_CLOSE_CHANNEL, wrappedListener);
    };
  },
});
