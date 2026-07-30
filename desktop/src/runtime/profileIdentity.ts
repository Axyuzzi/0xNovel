import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes } from "node:crypto";
import { resolveDesktopAppDataDir } from "./paths";

const PROFILE_SALT_FILE = "profile-salt.bin";

function loadOrCreateProfileSalt(): Buffer {
  const appDataDir = resolveDesktopAppDataDir();
  const saltPath = path.join(appDataDir, PROFILE_SALT_FILE);
  fs.mkdirSync(appDataDir, { recursive: true });
  if (fs.existsSync(saltPath)) {
    const existing = fs.readFileSync(saltPath);
    if (existing.length >= 32) {
      return existing;
    }
  }

  const salt = randomBytes(32);
  const temporaryPath = `${saltPath}.tmp`;
  fs.writeFileSync(temporaryPath, salt, { mode: 0o600 });
  fs.renameSync(temporaryPath, saltPath);
  return salt;
}

export function deriveLocalProfileId(userId: string): string {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("无法确定本地作品归属。");
  }
  return createHmac("sha256", loadOrCreateProfileSalt())
    .update(normalizedUserId, "utf8")
    .digest("hex")
    .slice(0, 32);
}
