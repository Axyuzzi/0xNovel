import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";
import { resolveDesktopAppDataDir } from "./paths";
import { isCanonicalRelayApiKey } from "./relayApiKey";

const CREDENTIAL_FILE_NAME = "auth-session.bin";
const CREDENTIAL_VERSION = 3;
const PREVIOUS_CREDENTIAL_VERSION = 2;
const SESSION_ONLY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface StoredCredential {
  version: number;
  token: string;
  userId: string;
  username: string;
  displayName: string;
  persistent: boolean;
  expiresAt: number | null;
}

function resolveCredentialFile(): string {
  return path.join(resolveDesktopAppDataDir(), CREDENTIAL_FILE_NAME);
}

function parseStoredCredential(value: string): StoredCredential | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredCredential>;
    if (
      (parsed.version !== CREDENTIAL_VERSION && parsed.version !== PREVIOUS_CREDENTIAL_VERSION)
      || typeof parsed.token !== "string"
      || !isCanonicalRelayApiKey(parsed.token)
      || typeof parsed.userId !== "string"
      || !parsed.userId.trim()
      || typeof parsed.persistent !== "boolean"
      || (parsed.expiresAt !== null && typeof parsed.expiresAt !== "number")
    ) {
      return null;
    }
    if (!parsed.persistent && (parsed.expiresAt ?? 0) <= Date.now()) {
      return null;
    }
    return {
      version: CREDENTIAL_VERSION,
      token: parsed.token,
      userId: parsed.userId.trim(),
      username: typeof parsed.username === "string" ? parsed.username.trim() : "",
      displayName: typeof parsed.displayName === "string" ? parsed.displayName.trim() : "",
      persistent: parsed.persistent,
      expiresAt: parsed.expiresAt ?? null,
    };
  } catch {
    return null;
  }
}

export function canPersistDesktopCredential(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function loadDesktopCredential(): StoredCredential | null {
  const filePath = resolveCredentialFile();
  if (!safeStorage.isEncryptionAvailable() || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const decrypted = safeStorage.decryptString(fs.readFileSync(filePath));
    return parseStoredCredential(decrypted);
  } catch {
    return null;
  }
}

export function saveDesktopCredential(input: {
  token: string;
  userId: string;
  username: string;
  displayName: string;
  persistent: boolean;
}): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统无法安全保存登录状态。");
  }
  if (!isCanonicalRelayApiKey(input.token) || !input.userId.trim() || !input.username.trim()) {
    throw new Error("登录凭证无效，无法保存。");
  }

  const appDataDir = resolveDesktopAppDataDir();
  fs.mkdirSync(appDataDir, { recursive: true });
  const filePath = resolveCredentialFile();
  const encrypted = safeStorage.encryptString(JSON.stringify({
    version: CREDENTIAL_VERSION,
    token: input.token,
    userId: input.userId.trim(),
    username: input.username.trim(),
    displayName: input.displayName.trim() || input.username.trim(),
    persistent: input.persistent,
    expiresAt: input.persistent ? null : Date.now() + SESSION_ONLY_MAX_AGE_MS,
  } satisfies StoredCredential));
  fs.writeFileSync(filePath, encrypted, { mode: 0o600 });
}

export function clearDesktopCredential(): void {
  const filePath = resolveCredentialFile();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
