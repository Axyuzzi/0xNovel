const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(desktopDir, "package.json"), "utf8"),
);
const distDir = path.join(desktopDir, "build", "dist");
const expectedName = `0xNovelAgent-${packageJson.version}-setup-x64.exe`;
const installerPath = path.join(distDir, expectedName);

if (!Number.isInteger(packageJson.buildNumber) || packageJson.buildNumber <= 0) {
  throw new Error("desktop/package.json buildNumber must be a positive integer.");
}
if (!fs.existsSync(installerPath)) {
  throw new Error(`Expected Windows installer at ${installerPath}.`);
}

const content = fs.readFileSync(installerPath);
const manifest = {
  platform: "windows",
  version: packageJson.version,
  buildNumber: packageJson.buildNumber,
  fileName: expectedName,
  fileSize: content.length,
  sha256: crypto.createHash("sha256").update(content).digest("hex"),
  adminUploadPath: "/api/app-releases/",
  uploadRecommendation: {
    isActive: false,
    forcedUpdate: false,
    minSupportedVersion: "",
  },
};
const outputPath = path.join(distDir, "0xNovelAgent-release-manifest.json");
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`[package-release] manifest written to ${outputPath}`);
console.log(`[package-release] version=${manifest.version} build=${manifest.buildNumber}`);
console.log(`[package-release] sha256=${manifest.sha256}`);
