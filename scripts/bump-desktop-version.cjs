const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const desktopPackagePath = path.join(repoRoot, "desktop", "package.json");

function printHelp() {
  console.log([
    "Usage: node scripts/bump-desktop-version.cjs [--dry-run] X.Y.Z",
    "",
    "Updates desktop/package.json version before a desktop package release.",
    "Use a stable semver without a leading v, for example 0.3.20.",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    version: "",
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    if (options.version) {
      throw new Error(`Unexpected extra version argument: ${arg}`);
    }
    options.version = arg.trim();
  }

  return options;
}

function parseStableSemver(version, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`${label} must be stable semver like 0.3.20, got ${version || "(empty)"}.`);
  }
  return match.slice(1).map((part) => Number(part));
}

function compareSemver(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) {
      return 1;
    }
    if (left[index] < right[index]) {
      return -1;
    }
  }
  return 0;
}

function readDesktopPackageJson() {
  return JSON.parse(fs.readFileSync(desktopPackagePath, "utf8"));
}

function printNextSteps(nextVersion) {
  console.log([
    "",
    "Next release steps:",
    "1. Update docs/releases/release-notes.md and README.md for user-visible changes.",
    "2. Build the signed NSIS installer.",
    "3. Run: pnpm generate:package-release-manifest",
    `4. Upload version ${nextVersion} to 0xAPI as inactive, verify its SHA256, then enable it.`,
  ].join("\n"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  if (!options.version) {
    throw new Error("Missing target version.");
  }

  const packageJson = readDesktopPackageJson();
  const currentVersion = typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  const currentBuildNumber = Number(packageJson.buildNumber);
  if (!Number.isInteger(currentBuildNumber) || currentBuildNumber <= 0) {
    throw new Error("desktop/package.json buildNumber must be a positive integer.");
  }
  const currentParts = parseStableSemver(currentVersion, "desktop/package.json version");
  const nextParts = parseStableSemver(options.version, "Target version");

  if (compareSemver(nextParts, currentParts) <= 0) {
    throw new Error(`Target version ${options.version} must be greater than current version ${currentVersion}.`);
  }

  console.log(`[desktop-version] current=${currentVersion}`);
  console.log(`[desktop-version] next=${options.version}`);
  console.log(`[desktop-version] build=${currentBuildNumber} -> ${currentBuildNumber + 1}`);

  if (options.dryRun) {
    console.log("[desktop-version] dry run passed; desktop/package.json was not changed.");
    printNextSteps(options.version);
    return;
  }

  packageJson.version = options.version;
  packageJson.buildNumber = currentBuildNumber + 1;
  fs.writeFileSync(desktopPackagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  console.log(`[desktop-version] updated desktop/package.json to ${options.version}.`);
  printNextSteps(options.version);
}

try {
  main();
} catch (error) {
  console.error(`[desktop-version] ${error.message}`);
  process.exit(1);
}
