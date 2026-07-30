const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, execSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const desktopDir = path.resolve(__dirname, "..");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const resourcesDir = path.join(buildDir, "resources");
const consumerReleasePolicyPath = path.join(resourcesDir, "consumer-release.json");
const consumerReleaseDefaultsPath = path.join(
  desktopDir,
  "config",
  "consumer-release.defaults.json",
);
const clientSourceDir = path.join(repoRoot, "client", "dist");
const clientTargetDir = path.join(resourcesDir, "client", "dist");
const serverEntry = path.join(appDir, "node_modules", "@0xnovelagent", "server", "dist", "app.js");
const desktopMainEntry = path.join(appDir, "dist", "main.js");
const stagedNodeModulesDir = path.join(appDir, "node_modules");
const stagedNativePackagesToDetach = ["better-sqlite3"];
const electronPackageJsonPath = require.resolve("electron/package.json", { paths: [desktopDir, repoRoot] });
const electronVersion = JSON.parse(fs.readFileSync(electronPackageJsonPath, "utf8")).version;
const prismaClientEntrypointFiles = [
  { fileName: "default.js", generatedEntry: "./generated-client/default" },
  { fileName: "index.js", generatedEntry: "./generated-client/index" },
  { fileName: "edge.js", generatedEntry: "./generated-client/edge" },
];

function readConsumerReleaseDefaults() {
  const parsed = JSON.parse(fs.readFileSync(consumerReleaseDefaultsPath, "utf8"));
  return {
    relayBaseUrl: normalizeOwnedHttpsUrl(
      parsed.relayBaseUrl,
      "consumer-release.defaults.json relayBaseUrl",
      true,
    ),
    relayAccountBaseUrl: normalizeOwnedHttpsUrl(
      parsed.relayAccountBaseUrl,
      "consumer-release.defaults.json relayAccountBaseUrl",
      true,
    ),
    plannerModel: normalizeModelAlias(
      parsed.plannerModel,
      "consumer-release.defaults.json plannerModel",
    ),
    writerModel: normalizeModelAlias(
      parsed.writerModel,
      "consumer-release.defaults.json writerModel",
    ),
    reviewModel: normalizeModelAlias(
      parsed.reviewModel,
      "consumer-release.defaults.json reviewModel",
    ),
  };
}

function runPnpm(args, cwd = repoRoot) {
  const command = `pnpm ${args.map((arg) => `"${arg}"`).join(" ")}`;
  execSync(command, {
    cwd,
    stdio: "inherit",
    env: process.env,
    shell: true,
  });
}

function ensureCleanDir(targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function ensureDir(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyDirectory(sourceDir, targetDir) {
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function replaceDirectoryWithPhysicalCopy(targetDir) {
  const tempDir = `${targetDir}.__detached__`;
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.cpSync(targetDir, tempDir, { recursive: true, force: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.renameSync(tempDir, targetDir);
}

function replaceFileContents(targetPath, contents) {
  fs.rmSync(targetPath, { force: true });
  fs.writeFileSync(targetPath, contents, "utf8");
}

function normalizeOwnedHttpsUrl(value, environmentName, required) {
  const configured = (value || "").trim();
  if (!configured) {
    if (required) {
      throw new Error(`${environmentName} is required for a public consumer release.`);
    }
    return null;
  }
  const parsed = new URL(configured);
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new Error(`${environmentName} must be an HTTPS URL without credentials or a fragment.`);
  }
  return parsed.toString().replace(/\/$/u, "");
}

function normalizePackageReleaseCode(value, required) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured) {
    if (required) {
      throw new Error("OXNOVEL_INTERNAL_PACKAGE_CODE is required for a public consumer release.");
    }
    return null;
  }
  if (!/^[A-Za-z0-9_-]{32}$/.test(configured)) {
    throw new Error("OXNOVEL_INTERNAL_PACKAGE_CODE must be exactly 32 safe characters.");
  }
  return configured;
}

function normalizeModelAlias(value, environmentName) {
  const configured = typeof value === "string" ? value.trim() : "";
  if (!configured || configured.length > 128 || /\s/u.test(configured)) {
    throw new Error(`${environmentName} must be a non-empty model alias without whitespace.`);
  }
  return configured;
}

function writeConsumerReleasePolicy() {
  const releaseChannel = (process.env.AI_NOVEL_RELEASE_CHANNEL || "beta").trim().toLowerCase();
  const publicRelease = releaseChannel !== "beta";
  const defaults = readConsumerReleaseDefaults();
  const relayBaseUrl = normalizeOwnedHttpsUrl(
    process.env.OXNOVEL_RELAY_BASE_URL || defaults.relayBaseUrl,
    "OXNOVEL_RELAY_BASE_URL",
    true,
  );
  const relayAccountBaseUrl = normalizeOwnedHttpsUrl(
    process.env.OXNOVEL_RELAY_ACCOUNT_BASE_URL
      || process.env.OXNOVEL_RELAY_BASE_URL
      || defaults.relayAccountBaseUrl,
    "OXNOVEL_RELAY_ACCOUNT_BASE_URL",
    true,
  );
  const packageReleaseBaseUrl = normalizeOwnedHttpsUrl(
    process.env.OXNOVEL_PACKAGE_RELEASE_BASE_URL || relayAccountBaseUrl,
    "OXNOVEL_PACKAGE_RELEASE_BASE_URL",
    true,
  );
  const packageReleaseCode = normalizePackageReleaseCode(
    process.env.OXNOVEL_INTERNAL_PACKAGE_CODE,
    publicRelease,
  );
  const plannerModel = normalizeModelAlias(
    process.env.OXNOVEL_RELAY_PLANNER_MODEL || defaults.plannerModel,
    "OXNOVEL_RELAY_PLANNER_MODEL",
  );
  const writerModel = normalizeModelAlias(
    process.env.OXNOVEL_RELAY_WRITER_MODEL || defaults.writerModel,
    "OXNOVEL_RELAY_WRITER_MODEL",
  );
  const reviewModel = normalizeModelAlias(
    process.env.OXNOVEL_RELAY_REVIEW_MODEL || defaults.reviewModel,
    "OXNOVEL_RELAY_REVIEW_MODEL",
  );
  const allowedRelayOrigins = Array.from(new Set(
    [relayBaseUrl, relayAccountBaseUrl]
      .filter(Boolean)
      .map((url) => new URL(url).origin),
  ));
  const policy = {
    schemaVersion: 2,
    productMode: "consumer",
    releaseChannel,
    relayBaseUrl,
    relayAccountBaseUrl,
    plannerModel,
    writerModel,
    reviewModel,
    allowedRelayOrigins,
    packageReleaseBaseUrl,
    packageReleaseCode,
  };
  fs.writeFileSync(consumerReleasePolicyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
}

function resolveWorkspacePrismaGeneratedDir() {
  const pnpmVirtualStoreDir = path.join(repoRoot, "node_modules", ".pnpm");
  assertExists(pnpmVirtualStoreDir, "workspace virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  for (const entry of prismaClientStoreEntries) {
    const generatedDir = path.join(pnpmVirtualStoreDir, entry.name, "node_modules", ".prisma");
    if (fs.existsSync(path.join(generatedDir, "client", "default.js"))) {
      return generatedDir;
    }
  }

  throw new Error(`Expected a generated Prisma runtime directory under ${pnpmVirtualStoreDir}, but none was found.`);
}

function resolveStagedPrismaClientPackageDirs() {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const prismaClientStoreEntries = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("@prisma+client@"));

  if (prismaClientStoreEntries.length === 0) {
    throw new Error("Expected at least one staged @prisma/client package in the virtual store.");
  }

  return prismaClientStoreEntries.map((entry) => ({
    storeEntryName: entry.name,
    packageDir: path.join(pnpmVirtualStoreDir, entry.name, "node_modules", "@prisma", "client"),
  }));
}

function resolveStagedPackageDirsByName(packageName) {
  const pnpmVirtualStoreDir = path.join(stagedNodeModulesDir, ".pnpm");
  assertExists(pnpmVirtualStoreDir, "staged virtual store");

  const matches = fs
    .readdirSync(pnpmVirtualStoreDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${packageName}@`))
    .map((entry) => path.join(pnpmVirtualStoreDir, entry.name, "node_modules", packageName))
    .filter((packageDir) => fs.existsSync(packageDir));

  return Array.from(new Set(matches));
}

function patchPrismaClientEntrypoint(entrypointPath, generatedEntry) {
  const entrypointSource = `module.exports = {
  ...require('${generatedEntry}'),
}
`;

  replaceFileContents(entrypointPath, entrypointSource);
}

function embedPrismaGeneratedClient(prismaClientPackageDir, generatedPrismaDir) {
  const generatedPrismaClientDir = path.join(generatedPrismaDir, "client");
  const embeddedGeneratedClientDir = path.join(prismaClientPackageDir, "generated-client");
  const prismaClientPackageJsonPath = path.join(prismaClientPackageDir, "package.json");
  const prismaClientPackageJson = JSON.parse(fs.readFileSync(prismaClientPackageJsonPath, "utf8"));

  copyDirectory(generatedPrismaClientDir, embeddedGeneratedClientDir);

  if (!Array.isArray(prismaClientPackageJson.files)) {
    prismaClientPackageJson.files = [];
  }
  if (!prismaClientPackageJson.files.includes("generated-client")) {
    prismaClientPackageJson.files.push("generated-client");
  }

  replaceFileContents(prismaClientPackageJsonPath, `${JSON.stringify(prismaClientPackageJson, null, 2)}\n`);

  for (const { fileName, generatedEntry } of prismaClientEntrypointFiles) {
    patchPrismaClientEntrypoint(path.join(prismaClientPackageDir, fileName), generatedEntry);
  }
}

function syncPrismaRuntime() {
  const generatedPrismaDir = resolveWorkspacePrismaGeneratedDir();
  const stagedTopLevelPrismaDir = path.join(stagedNodeModulesDir, ".prisma");
  const stagedPrismaClientPackages = resolveStagedPrismaClientPackageDirs();

  copyDirectory(generatedPrismaDir, stagedTopLevelPrismaDir);

  for (const { storeEntryName, packageDir } of stagedPrismaClientPackages) {
    const nestedPrismaDir = path.join(stagedNodeModulesDir, ".pnpm", storeEntryName, "node_modules", ".prisma");
    const packageLocalPrismaDir = path.join(
      stagedNodeModulesDir,
      ".pnpm",
      storeEntryName,
      "node_modules",
      "@prisma",
      "client",
      "node_modules",
      ".prisma",
    );
    copyDirectory(generatedPrismaDir, nestedPrismaDir);
    copyDirectory(generatedPrismaDir, packageLocalPrismaDir);
    embedPrismaGeneratedClient(packageDir, generatedPrismaDir);
  }
}

function detachStagedNativePackages() {
  for (const packageName of stagedNativePackagesToDetach) {
    for (const packageDir of resolveStagedPackageDirsByName(packageName)) {
      replaceDirectoryWithPhysicalCopy(packageDir);
    }
  }
}

function installStagedElectronNativePrebuilds() {
  for (const packageName of stagedNativePackagesToDetach) {
    for (const packageDir of resolveStagedPackageDirsByName(packageName)) {
      const prebuildInstallEntrypoint = require.resolve("prebuild-install/bin.js", {
        paths: [packageDir, repoRoot],
      });
      execFileSync(
        process.execPath,
        [
          prebuildInstallEntrypoint,
          "--runtime=electron",
          `--target=${electronVersion}`,
          `--arch=${process.arch}`,
          `--platform=${process.platform}`,
        ],
        {
          cwd: packageDir,
          env: process.env,
          stdio: "inherit",
        },
      );
      assertExists(
        path.join(packageDir, "build", "Release", "better_sqlite3.node"),
        `${packageName} Electron ${electronVersion} native binding`,
      );
    }
  }
}

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Expected ${description} at ${targetPath}, but it was not found.`);
  }
}

function main() {
  assertExists(clientSourceDir, "built client assets");

  ensureCleanDir(buildDir);
  ensureDir(resourcesDir);
  ensureDir(path.dirname(clientTargetDir));
  writeConsumerReleasePolicy();

  runPnpm([
    "--filter",
    "@0xnovelagent/desktop",
    "deploy",
    "--prod",
    appDir,
  ]);

  copyDirectory(clientSourceDir, clientTargetDir);
  syncPrismaRuntime();
  detachStagedNativePackages();
  installStagedElectronNativePrebuilds();

  assertExists(desktopMainEntry, "desktop main bundle");
  assertExists(serverEntry, "bundled server entry");
  assertExists(path.join(clientTargetDir, "index.html"), "bundled renderer entry");
  assertExists(path.join(stagedNodeModulesDir, ".prisma", "client", "default.js"), "bundled Prisma runtime");
  const [firstStagedPrismaClientPackage] = resolveStagedPrismaClientPackageDirs();
  assertExists(
    path.join(firstStagedPrismaClientPackage.packageDir, "node_modules", ".prisma", "client", "default.js"),
    "bundled Prisma runtime beside @prisma/client",
  );
  assertExists(
    path.join(firstStagedPrismaClientPackage.packageDir, "generated-client", "default.js"),
    "embedded generated Prisma client",
  );

  console.log(`[stage:desktop] app staged at ${appDir}`);
  console.log(`[stage:desktop] renderer resources staged at ${clientTargetDir}`);
}

try {
  main();
} catch (error) {
  console.error("[stage:desktop] failed.", error);
  process.exit(1);
}
