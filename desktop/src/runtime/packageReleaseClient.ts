import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const WINDOWS_LATEST_PATH = "/api/internal/apps/0xnovelagent/releases/latest";
const WINDOWS_DOWNLOAD_PATH = /^\/api\/internal\/apps\/0xnovelagent\/releases\/\d+\/download$/u;
const MAX_PACKAGE_SIZE = 512 * 1024 * 1024;

interface ReleaseEnvelope {
  success?: unknown;
  message?: unknown;
  error_code?: unknown;
  error_message?: unknown;
  data?: unknown;
}

export interface PackageRelease {
  id: number;
  appName: string;
  platform: "windows";
  version: string;
  buildNumber: number;
  forcedUpdate: boolean;
  minSupportedVersion: string | null;
  fileName: string;
  fileSize: number;
  sha256: string;
  downloadUrl: string;
  releaseNotes: string;
  publishedAt: number;
}

export interface PackageReleaseClientOptions {
  apiBaseUrl: string;
  packageCode: string;
}

function releaseError(envelope: ReleaseEnvelope, fallback: string): Error {
  const message = typeof envelope.error_message === "string"
    ? envelope.error_message
    : typeof envelope.message === "string"
      ? envelope.message
      : fallback;
  return new Error(message);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("更新服务返回的数据格式不正确。");
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`更新服务缺少 ${field}。`);
  }
  return value.trim();
}

function optionalString(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new Error(`更新服务字段 ${field} 格式不正确。`);
  }
  return value.trim() || null;
}

function requiredPositiveInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`更新服务字段 ${field} 格式不正确。`);
  }
  return Number(value);
}

function requiredNonNegativeInteger(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`更新服务字段 ${field} 格式不正确。`);
  }
  return Number(value);
}

export function parsePackageRelease(value: unknown, apiBaseUrl: string): PackageRelease {
  const record = asRecord(value);
  const appName = requiredString(record, "appName");
  if (appName !== "0xNovelAgent") {
    throw new Error("更新服务返回了不属于 0xNovelAgent 的安装包。");
  }
  const platform = requiredString(record, "platform");
  if (platform !== "windows") {
    throw new Error("更新服务返回了不适用于 Windows 的安装包。");
  }
  const sha256 = requiredString(record, "sha256").toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(sha256)) {
    throw new Error("更新服务返回的安装包校验值无效。");
  }
  const fileSize = requiredPositiveInteger(record, "fileSize");
  if (fileSize > MAX_PACKAGE_SIZE) {
    throw new Error("更新安装包超过允许的大小。");
  }
  const expectedOrigin = new URL(apiBaseUrl).origin;
  const fileName = path.basename(requiredString(record, "fileName"));
  if (!fileName.toLowerCase().endsWith(".exe")) {
    throw new Error("Windows 自动更新只接受 EXE 安装包。");
  }
  const downloadUrl = new URL(requiredString(record, "downloadUrl"));
  if (
    downloadUrl.protocol !== "https:"
    || downloadUrl.origin !== expectedOrigin
    || !WINDOWS_DOWNLOAD_PATH.test(downloadUrl.pathname)
  ) {
    throw new Error("更新服务返回了不受信任的下载地址。");
  }

  return {
    id: requiredPositiveInteger(record, "id"),
    appName,
    platform,
    version: requiredString(record, "version"),
    buildNumber: requiredPositiveInteger(record, "buildNumber"),
    forcedUpdate: record.forcedUpdate === true,
    minSupportedVersion: optionalString(record, "minSupportedVersion"),
    fileName,
    fileSize,
    sha256,
    downloadUrl: downloadUrl.toString(),
    releaseNotes: typeof record.releaseNotes === "string" ? record.releaseNotes.trim() : "",
    publishedAt: requiredNonNegativeInteger(record, "publishedAt"),
  };
}

export async function fetchLatestWindowsRelease(
  options: PackageReleaseClientOptions,
): Promise<PackageRelease | null> {
  const latestUrl = new URL(WINDOWS_LATEST_PATH, options.apiBaseUrl);
  latestUrl.searchParams.set("platform", "windows");
  const response = await fetch(latestUrl, {
    headers: {
      Authorization: `Bearer ${options.packageCode}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const envelope = await response.json().catch(() => ({})) as ReleaseEnvelope;
  if (response.status === 404 && envelope.error_code === "release_not_found") {
    return null;
  }
  if (!response.ok || envelope.success !== true) {
    throw releaseError(envelope, "暂时无法检查软件更新。");
  }
  return parsePackageRelease(envelope.data, options.apiBaseUrl);
}

export async function downloadWindowsRelease(
  release: PackageRelease,
  options: PackageReleaseClientOptions & {
    targetDir: string;
    onProgress?: (progress: {
      receivedBytes: number;
      totalBytes: number;
      percent: number;
      bytesPerSecond: number;
    }) => void;
  },
): Promise<string> {
  fs.mkdirSync(options.targetDir, { recursive: true });
  const targetPath = path.join(options.targetDir, `${release.id}-${release.fileName}`);
  const partialPath = `${targetPath}.part`;
  fs.rmSync(partialPath, { force: true });

  const response = await fetch(release.downloadUrl, {
    headers: {
      Authorization: `Bearer ${options.packageCode}`,
      Accept: "application/octet-stream",
    },
    signal: AbortSignal.timeout(15 * 60_000),
  });
  if (!response.ok || !response.body) {
    throw new Error("新版安装包下载失败，请稍后重试。");
  }

  const responseLength = Number(response.headers.get("content-length") ?? release.fileSize);
  if (
    !Number.isFinite(responseLength)
    || responseLength <= 0
    || responseLength > MAX_PACKAGE_SIZE
  ) {
    throw new Error("更新安装包大小异常，已停止下载。");
  }

  const hasher = crypto.createHash("sha256");
  const startedAt = Date.now();
  let receivedBytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_PACKAGE_SIZE) {
        callback(new Error("更新安装包超过允许的大小。"));
        return;
      }
      hasher.update(chunk);
      const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.1);
      options.onProgress?.({
        receivedBytes,
        totalBytes: release.fileSize,
        percent: Math.min(100, receivedBytes / release.fileSize * 100),
        bytesPerSecond: receivedBytes / elapsedSeconds,
      });
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      Readable.fromWeb(response.body as never),
      meter,
      fs.createWriteStream(partialPath, { flags: "wx" }),
    );
    const actualHash = hasher.digest("hex");
    if (receivedBytes !== release.fileSize || actualHash !== release.sha256) {
      throw new Error("新版安装包校验失败，文件可能不完整。");
    }
    fs.rmSync(targetPath, { force: true });
    fs.renameSync(partialPath, targetPath);
    return targetPath;
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error;
  }
}

function parseSemver(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareStableVersions(left: string, right: string): number {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}
