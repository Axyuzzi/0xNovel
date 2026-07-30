const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compareStableVersions,
  parsePackageRelease,
} = require("../dist/runtime/packageReleaseClient.js");

const validRelease = {
  id: 12,
  appName: "0xNovelAgent",
  platform: "windows",
  version: "0.4.17",
  buildNumber: 417,
  forcedUpdate: false,
  minSupportedVersion: "0.4.10",
  fileName: "0xNovelAgent-0.4.17-setup-x64.exe",
  fileSize: 130_000_000,
  sha256: "a".repeat(64),
  downloadUrl: "https://api.0xkey.cn/api/internal/apps/0xnovelagent/releases/12/download",
  releaseNotes: "修复更新问题。",
  publishedAt: 1779870000,
};

test("package release parser accepts the owned Windows release contract", () => {
  const release = parsePackageRelease(validRelease, "https://api.0xkey.cn");
  assert.equal(release.buildNumber, 417);
  assert.equal(release.fileName, "0xNovelAgent-0.4.17-setup-x64.exe");
});

test("package release parser rejects a cross-origin download URL", () => {
  assert.throws(
    () => parsePackageRelease({
      ...validRelease,
      downloadUrl: "https://download.example.com/installer.exe",
    }, "https://api.0xkey.cn"),
    /不受信任/,
  );
});

test("package release parser rejects another app and non-EXE installers", () => {
  assert.throws(
    () => parsePackageRelease({
      ...validRelease,
      appName: "another-app",
    }, "https://api.0xkey.cn"),
    /不属于 0xNovelAgent/,
  );

  assert.throws(
    () => parsePackageRelease({
      ...validRelease,
      fileName: "0xNovelAgent-0.4.17.zip",
    }, "https://api.0xkey.cn"),
    /EXE/,
  );
});

test("stable version comparison supports minimum supported version checks", () => {
  assert.equal(compareStableVersions("0.4.16", "0.4.10"), 1);
  assert.equal(compareStableVersions("0.4.16", "0.4.16"), 0);
  assert.equal(compareStableVersions("0.4.9", "0.4.10"), -1);
});
