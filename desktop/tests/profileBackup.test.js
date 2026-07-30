const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  applyPreparedProfileRestore,
  prepareProfileRestore,
} = require("../dist/runtime/profileBackup.js");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeBackup(filePath, userId, overrides = {}) {
  const salt = "0123456789abcdef0123456789abcdef";
  const database = Buffer.from("restored database");
  const storyFile = Buffer.from("第一章备份正文", "utf8");
  const envelope = {
    format: "0xnovel-profile-backup",
    version: 1,
    createdAt: "2026-07-28T12:00:00.000Z",
    appVersion: "0.4.3",
    account: {
      salt,
      fingerprint: sha256(`${salt}:${userId}`),
    },
    database: {
      name: "dev.db",
      size: database.length,
      sha256: sha256(database),
      dataBase64: database.toString("base64"),
    },
    files: [{
      path: "drafts/chapter-1.txt",
      size: storyFile.length,
      sha256: sha256(storyFile),
      dataBase64: storyFile.toString("base64"),
    }],
    ...overrides,
  };
  fs.writeFileSync(filePath, zlib.gzipSync(Buffer.from(JSON.stringify(envelope), "utf8")));
}

test("profile restore validates account ownership and keeps the previous profile recoverable", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "0xnovel-profile-restore-"));
  const profileDir = path.join(tempDir, "profile");
  const backupPath = path.join(tempDir, "valid.0xnovel-backup");
  const otherAccountBackupPath = path.join(tempDir, "other.0xnovel-backup");
  fs.mkdirSync(path.join(profileDir, "data"), { recursive: true });
  fs.mkdirSync(path.join(profileDir, "storage"), { recursive: true });
  fs.writeFileSync(path.join(profileDir, "data", "dev.db"), "current database");
  fs.writeFileSync(path.join(profileDir, "storage", "current.txt"), "current file");
  writeBackup(backupPath, "relay-user-7");
  writeBackup(otherAccountBackupPath, "relay-user-8");

  try {
    await assert.rejects(
      () => prepareProfileRestore({
        profileDir,
        userId: "relay-user-7",
        backupPath: otherAccountBackupPath,
      }),
      /另一个账号/,
    );

    const prepared = await prepareProfileRestore({
      profileDir,
      userId: "relay-user-7",
      backupPath,
    });
    const recoveryDir = applyPreparedProfileRestore({
      profileDir,
      prepared,
    });

    assert.equal(
      fs.readFileSync(path.join(profileDir, "data", "dev.db"), "utf8"),
      "restored database",
    );
    assert.equal(
      fs.readFileSync(path.join(profileDir, "storage", "drafts", "chapter-1.txt"), "utf8"),
      "第一章备份正文",
    );
    assert.equal(
      fs.readFileSync(path.join(recoveryDir, "data", "dev.db"), "utf8"),
      "current database",
    );
    assert.equal(
      fs.readFileSync(path.join(recoveryDir, "storage", "current.txt"), "utf8"),
      "current file",
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
