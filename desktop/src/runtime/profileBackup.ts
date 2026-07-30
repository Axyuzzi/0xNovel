import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gzip, gunzip } from "node:zlib";
import Database from "better-sqlite3";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const BACKUP_FORMAT = "0xnovel-profile-backup";
const BACKUP_VERSION = 1;
const BACKUP_EXTENSION = ".0xnovel-backup";
const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
const MAX_BACKUP_FILES = 20_000;

interface BackupFileRecord {
  path: string;
  size: number;
  sha256: string;
  dataBase64: string;
}

interface ProfileBackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  createdAt: string;
  appVersion: string;
  account: {
    salt: string;
    fingerprint: string;
  };
  database: {
    name: "dev.db";
    size: number;
    sha256: string;
    dataBase64: string;
  };
  files: BackupFileRecord[];
}

export interface ProfileBackupSummary {
  path: string;
  createdAt: string;
  size: number;
}

export interface PreparedProfileRestore {
  stagingDir: string;
  createdAt: string;
  appVersion: string;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function accountFingerprint(userId: string, salt: string): string {
  return sha256(`${salt}:${userId.trim()}`);
}

function ensureDirectory(directoryPath: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function isPathInside(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(targetPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function removeOwnedStagingDirectory(profileDir: string, stagingDir: string): void {
  const backupsDir = path.join(profileDir, "backups");
  if (!isPathInside(backupsDir, stagingDir)) {
    throw new Error("备份临时目录不在当前作品资料域内。");
  }
  fs.rmSync(stagingDir, { recursive: true, force: true });
}

function safeArchiveRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized.includes("\0")
    || normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error("备份包包含无效文件路径。");
  }
  return normalized;
}

function walkStorageFiles(storageDir: string): string[] {
  if (!fs.existsSync(storageDir)) {
    return [];
  }
  const files: string[] = [];
  const pending = [storageDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        pending.push(absolutePath);
      } else if (entry.isFile()) {
        files.push(absolutePath);
      }
      if (files.length > MAX_BACKUP_FILES) {
        throw new Error("本地素材文件过多，请先整理后再创建备份。");
      }
    }
  }
  return files.sort();
}

async function createDatabaseSnapshot(sourcePath: string, destinationPath: string): Promise<void> {
  const database = new Database(sourcePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    await database.backup(destinationPath);
  } finally {
    database.close();
  }
}

function assertEnvelope(value: unknown): asserts value is ProfileBackupEnvelope {
  if (!value || typeof value !== "object") {
    throw new Error("无法识别这个备份文件。");
  }
  const record = value as Partial<ProfileBackupEnvelope>;
  if (
    record.format !== BACKUP_FORMAT
    || record.version !== BACKUP_VERSION
    || typeof record.createdAt !== "string"
    || typeof record.appVersion !== "string"
    || !record.account
    || typeof record.account.salt !== "string"
    || typeof record.account.fingerprint !== "string"
    || !record.database
    || record.database.name !== "dev.db"
    || typeof record.database.size !== "number"
    || typeof record.database.sha256 !== "string"
    || typeof record.database.dataBase64 !== "string"
    || !Array.isArray(record.files)
  ) {
    throw new Error("备份文件格式不完整。");
  }
}

function decodeAndVerify(
  encoded: string,
  expectedSize: number,
  expectedHash: string,
): Buffer {
  const content = Buffer.from(encoded, "base64");
  if (
    content.length !== expectedSize
    || content.length > MAX_BACKUP_BYTES
    || sha256(content) !== expectedHash
  ) {
    throw new Error("备份文件校验失败，内容可能已经损坏。");
  }
  return content;
}

export function resolveProfileBackupsDir(profileDir: string): string {
  return path.join(profileDir, "backups");
}

export async function createProfileBackup(input: {
  profileDir: string;
  userId: string;
  appVersion: string;
}): Promise<ProfileBackupSummary> {
  if (!input.userId.trim()) {
    throw new Error("登录后才能备份本地作品。");
  }
  const databasePath = path.join(input.profileDir, "data", "dev.db");
  if (!fs.existsSync(databasePath)) {
    throw new Error("本地作品数据库尚未创建。");
  }

  const backupsDir = resolveProfileBackupsDir(input.profileDir);
  ensureDirectory(backupsDir);
  const stagingDir = fs.mkdtempSync(path.join(backupsDir, ".staging-"));
  const snapshotPath = path.join(stagingDir, "dev.db");
  const createdAt = new Date().toISOString();
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const destinationPath = path.join(backupsDir, `0xNovelAgent-${timestamp}${BACKUP_EXTENSION}`);

  try {
    await createDatabaseSnapshot(databasePath, snapshotPath);
    const databaseContent = fs.readFileSync(snapshotPath);
    let totalBytes = databaseContent.length;
    const files = walkStorageFiles(path.join(input.profileDir, "storage")).map((filePath) => {
      const content = fs.readFileSync(filePath);
      totalBytes += content.length;
      if (totalBytes > MAX_BACKUP_BYTES) {
        throw new Error("本地作品和素材超过 512 MB，当前版本无法创建单文件备份。");
      }
      return {
        path: safeArchiveRelativePath(path.relative(path.join(input.profileDir, "storage"), filePath)),
        size: content.length,
        sha256: sha256(content),
        dataBase64: content.toString("base64"),
      } satisfies BackupFileRecord;
    });
    const salt = randomBytes(16).toString("hex");
    const envelope: ProfileBackupEnvelope = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt,
      appVersion: input.appVersion,
      account: {
        salt,
        fingerprint: accountFingerprint(input.userId, salt),
      },
      database: {
        name: "dev.db",
        size: databaseContent.length,
        sha256: sha256(databaseContent),
        dataBase64: databaseContent.toString("base64"),
      },
      files,
    };
    const compressed = await gzipAsync(Buffer.from(JSON.stringify(envelope), "utf8"), {
      level: 9,
    });
    fs.writeFileSync(destinationPath, compressed, {
      flag: "wx",
      mode: 0o600,
    });
    return {
      path: destinationPath,
      createdAt,
      size: compressed.length,
    };
  } finally {
    removeOwnedStagingDirectory(input.profileDir, stagingDir);
  }
}

export function exportProfileBackup(sourcePath: string, destinationPath: string): void {
  if (!sourcePath.endsWith(BACKUP_EXTENSION)) {
    throw new Error("源备份文件格式无效。");
  }
  fs.copyFileSync(sourcePath, destinationPath);
}

export async function prepareProfileRestore(input: {
  profileDir: string;
  userId: string;
  backupPath: string;
}): Promise<PreparedProfileRestore> {
  const compressedSize = fs.statSync(input.backupPath).size;
  if (compressedSize <= 0 || compressedSize > MAX_BACKUP_BYTES) {
    throw new Error("备份文件大小无效。");
  }
  const decompressed = await gunzipAsync(fs.readFileSync(input.backupPath), {
    maxOutputLength: MAX_BACKUP_BYTES * 2,
  });
  let rawEnvelope: unknown;
  try {
    rawEnvelope = JSON.parse(decompressed.toString("utf8")) as unknown;
  } catch {
    throw new Error("无法读取这个备份文件。");
  }
  assertEnvelope(rawEnvelope);
  if (
    accountFingerprint(input.userId, rawEnvelope.account.salt)
    !== rawEnvelope.account.fingerprint
  ) {
    throw new Error("这个备份属于另一个账号，无法恢复到当前作品空间。");
  }
  if (rawEnvelope.files.length > MAX_BACKUP_FILES) {
    throw new Error("备份文件数量超出当前版本的恢复范围。");
  }

  const backupsDir = resolveProfileBackupsDir(input.profileDir);
  ensureDirectory(backupsDir);
  const stagingDir = fs.mkdtempSync(path.join(backupsDir, ".restore-"));
  try {
    const stagedDataDir = path.join(stagingDir, "data");
    const stagedStorageDir = path.join(stagingDir, "storage");
    ensureDirectory(stagedDataDir);
    ensureDirectory(stagedStorageDir);
    fs.writeFileSync(
      path.join(stagedDataDir, "dev.db"),
      decodeAndVerify(
        rawEnvelope.database.dataBase64,
        rawEnvelope.database.size,
        rawEnvelope.database.sha256,
      ),
      { mode: 0o600 },
    );

    let totalBytes = rawEnvelope.database.size;
    for (const file of rawEnvelope.files) {
      if (
        !file
        || typeof file.path !== "string"
        || typeof file.size !== "number"
        || typeof file.sha256 !== "string"
        || typeof file.dataBase64 !== "string"
      ) {
        throw new Error("备份包中的素材记录无效。");
      }
      totalBytes += file.size;
      if (totalBytes > MAX_BACKUP_BYTES) {
        throw new Error("备份内容超过当前版本的恢复范围。");
      }
      const relativePath = safeArchiveRelativePath(file.path);
      const destinationPath = path.resolve(stagedStorageDir, ...relativePath.split("/"));
      if (!isPathInside(stagedStorageDir, destinationPath)) {
        throw new Error("备份包包含越界文件路径。");
      }
      ensureDirectory(path.dirname(destinationPath));
      fs.writeFileSync(
        destinationPath,
        decodeAndVerify(file.dataBase64, file.size, file.sha256),
        { mode: 0o600 },
      );
    }
    return {
      stagingDir,
      createdAt: rawEnvelope.createdAt,
      appVersion: rawEnvelope.appVersion,
    };
  } catch (error) {
    removeOwnedStagingDirectory(input.profileDir, stagingDir);
    throw error;
  }
}

export function applyPreparedProfileRestore(input: {
  profileDir: string;
  prepared: PreparedProfileRestore;
}): string {
  const backupsDir = resolveProfileBackupsDir(input.profileDir);
  if (!isPathInside(backupsDir, input.prepared.stagingDir)) {
    throw new Error("待恢复内容不属于当前作品资料域。");
  }
  const stagedDataDir = path.join(input.prepared.stagingDir, "data");
  const stagedStorageDir = path.join(input.prepared.stagingDir, "storage");
  if (!fs.existsSync(path.join(stagedDataDir, "dev.db"))) {
    throw new Error("待恢复数据库不存在。");
  }

  const recoveryDir = path.join(
    input.profileDir,
    "restore-recovery",
    new Date().toISOString().replace(/[:.]/g, "-"),
  );
  ensureDirectory(recoveryDir);
  const currentDataDir = path.join(input.profileDir, "data");
  const currentStorageDir = path.join(input.profileDir, "storage");
  const recoveryDataDir = path.join(recoveryDir, "data");
  const recoveryStorageDir = path.join(recoveryDir, "storage");
  let dataMoved = false;
  let storageMoved = false;
  let restoredDataInstalled = false;
  let restoredStorageInstalled = false;

  try {
    if (fs.existsSync(currentDataDir)) {
      fs.renameSync(currentDataDir, recoveryDataDir);
      dataMoved = true;
    }
    if (fs.existsSync(currentStorageDir)) {
      fs.renameSync(currentStorageDir, recoveryStorageDir);
      storageMoved = true;
    }
    fs.renameSync(stagedDataDir, currentDataDir);
    restoredDataInstalled = true;
    fs.renameSync(stagedStorageDir, currentStorageDir);
    restoredStorageInstalled = true;
    removeOwnedStagingDirectory(input.profileDir, input.prepared.stagingDir);
    return recoveryDir;
  } catch (error) {
    if (restoredStorageInstalled && fs.existsSync(currentStorageDir)) {
      fs.renameSync(currentStorageDir, stagedStorageDir);
    }
    if (restoredDataInstalled && fs.existsSync(currentDataDir)) {
      fs.renameSync(currentDataDir, stagedDataDir);
    }
    if (dataMoved && fs.existsSync(recoveryDataDir)) {
      fs.renameSync(recoveryDataDir, currentDataDir);
    }
    if (storageMoved && fs.existsSync(recoveryStorageDir)) {
      fs.renameSync(recoveryStorageDir, currentStorageDir);
    }
    throw error;
  }
}

export function discardPreparedProfileRestore(
  profileDir: string,
  prepared: PreparedProfileRestore,
): void {
  removeOwnedStagingDirectory(profileDir, prepared.stagingDir);
}
