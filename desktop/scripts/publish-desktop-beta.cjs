const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

try {
  execFileSync(process.execPath, [
    path.join("desktop", "scripts", "run-electron-builder.cjs"),
    "--win",
    "nsis",
    "--x64",
  ], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      AI_NOVEL_RELEASE_CHANNEL: "beta",
    },
  });
  execFileSync(process.execPath, [
    path.join("desktop", "scripts", "generate-package-release-manifest.cjs"),
  ], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  console.log("[publish:desktop:beta] upload the inactive installer through 0xAPI admin when ready.");
} catch (error) {
  console.error("[publish:desktop:beta] failed.", error);
  process.exit(1);
}
