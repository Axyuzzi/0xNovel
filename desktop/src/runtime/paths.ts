import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_NAME = "0xNovelAgent";
const PORTABLE_DATA_SUFFIX = "-data";
const CONSUMER_DATA_DOMAIN = "consumer-v1";

export interface DesktopRuntimeConfig {
  mode: "desktop";
  productMode: "consumer";
  apiBaseUrl: string;
  apiSessionToken: string;
  apiTimeoutMs: number;
  isPackaged: boolean;
  appVersion: string;
  isPortable: boolean;
  updateChannel: string;
}

function resolvePortableDesktopAppDataDir(): string | null {
  const portableExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR?.trim();
  if (!portableExecutableDir) {
    return null;
  }

  const portableAppName = process.env.PORTABLE_EXECUTABLE_APP_FILENAME?.trim() || APP_NAME;
  return path.join(portableExecutableDir, `${portableAppName}${PORTABLE_DATA_SUFFIX}`);
}

export function isPortableDesktopRuntime(): boolean {
  return resolvePortableDesktopAppDataDir() != null;
}

export function resolveDesktopAppDataDir(): string {
  const configuredDir = process.env.AI_NOVEL_APP_DATA_DIR?.trim();
  if (configuredDir) {
    return path.resolve(configuredDir);
  }

  const portableDataDir = resolvePortableDesktopAppDataDir();
  if (portableDataDir) {
    return path.join(portableDataDir, CONSUMER_DATA_DOMAIN);
  }

  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return path.join(localAppData, APP_NAME, CONSUMER_DATA_DOMAIN);
  }

  const appData = process.env.APPDATA?.trim();
  if (appData) {
    return path.join(appData, APP_NAME, CONSUMER_DATA_DOMAIN);
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", APP_NAME, CONSUMER_DATA_DOMAIN);
  }

  return path.join(os.homedir(), `.${APP_NAME}`, CONSUMER_DATA_DOMAIN);
}

export function resolveDesktopLogsDir(): string {
  return path.join(resolveDesktopAppDataDir(), "logs");
}

export function resolveDesktopProfileDataDir(profileId: string): string {
  if (!/^[a-f0-9]{32}$/.test(profileId)) {
    throw new Error("本地作品资料域无效。");
  }
  return path.join(resolveDesktopAppDataDir(), "profiles", profileId);
}

export function resolveDesktopMainLogFile(): string {
  return path.join(resolveDesktopLogsDir(), "desktop-main.log");
}

export function resolveDesktopUpdateChannel(): string {
  const configuredChannel = process.env.AI_NOVEL_UPDATE_CHANNEL?.trim();
  return configuredChannel || "beta";
}

export function resolveDesktopBuildNumber(): number {
  const packagePath = path.resolve(__dirname, "..", "..", "package.json");
  const parsed = JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    buildNumber?: unknown;
  };
  if (!Number.isInteger(parsed.buildNumber) || Number(parsed.buildNumber) <= 0) {
    throw new Error("桌面安装包缺少有效构建号。");
  }
  return Number(parsed.buildNumber);
}

export function resolveDesktopRuntimeConfig(options: {
  port: number;
  isPackaged: boolean;
  appVersion: string;
  apiSessionToken: string;
  updateChannel?: string;
}): DesktopRuntimeConfig {
  return {
    mode: "desktop",
    productMode: "consumer",
    apiBaseUrl: `http://127.0.0.1:${options.port}/api`,
    apiSessionToken: options.apiSessionToken,
    apiTimeoutMs: 10 * 60 * 1000,
    isPackaged: options.isPackaged,
    appVersion: options.appVersion,
    isPortable: isPortableDesktopRuntime(),
    updateChannel: options.updateChannel ?? resolveDesktopUpdateChannel(),
  };
}

export function resolveRendererDevUrl(): string {
  return process.env.AI_NOVEL_DESKTOP_RENDERER_URL?.trim() || "http://127.0.0.1:5173";
}

export function resolveDesktopResourcesDir(): string {
  const configuredDir = process.env.AI_NOVEL_DESKTOP_RESOURCES_DIR?.trim();
  return configuredDir ? path.resolve(configuredDir) : process.resourcesPath;
}

export function resolveRendererIndexHtml(): string {
  return path.join(resolveDesktopResourcesDir(), "client", "dist", "index.html");
}

export function resolveDesktopWindowIcon(): string {
  if (process.env.AI_NOVEL_DESKTOP_ICON_PATH?.trim()) {
    return path.resolve(process.env.AI_NOVEL_DESKTOP_ICON_PATH.trim());
  }

  const packagedIconPath = path.join(resolveDesktopResourcesDir(), "icons", "app-icon.ico");
  if (fs.existsSync(packagedIconPath)) {
    return packagedIconPath;
  }

  return path.resolve(resolveWorkspaceRoot(), "desktop", "builder", "app-icon.ico");
}

export function resolveDesktopBrandImage(): string {
  const packagedBrandImage = path.join(resolveDesktopResourcesDir(), "icons", "app-icon.png");
  if (fs.existsSync(packagedBrandImage)) {
    return packagedBrandImage;
  }

  return path.resolve(resolveWorkspaceRoot(), "desktop", "builder", "app-icon-256.png");
}

export function resolvePackagedServerEntry(): string {
  return path.join(
    resolveDesktopResourcesDir(),
    "app.asar",
    "node_modules",
    "@0xnovelagent",
    "server",
    "dist",
    "app.js",
  );
}

export function resolveWorkspaceRoot(): string {
  return path.resolve(__dirname, "../../..");
}
