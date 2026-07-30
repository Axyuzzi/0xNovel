const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const desktopDir = path.resolve(__dirname, "..");
const electronBuilderPackageJson = require.resolve("electron-builder/package.json", { paths: [desktopDir] });
const electronBuilderRequire = createRequire(electronBuilderPackageJson);
const asar = electronBuilderRequire("@electron/asar");
const buildDir = path.join(desktopDir, "build");
const appDir = path.join(buildDir, "app");
const unpackedDir = path.join(buildDir, "dist", "win-unpacked");
const builderWindowIcon = path.join(desktopDir, "builder", "app-icon.ico");
const appPackageJsonPath = path.join(appDir, "package.json");
const stagedServerEntry = path.join(appDir, "node_modules", "@0xnovelagent", "server", "dist", "app.js");
const stagedPrismaRuntimeEntry = path.join(appDir, "node_modules", ".prisma", "client", "default.js");
const stagedGeneratedPrismaClientEntry = path.join(
  appDir,
  "node_modules",
  ".pnpm",
  "node_modules",
  "@prisma",
  "client",
  "generated-client",
  "default.js",
);
const stagedServerMigrationsDir = path.join(appDir, "node_modules", "@0xnovelagent", "server", "src", "prisma", "migrations");
const stagedAppUpdateConfig = path.join(buildDir, "resources", "app-update.yml");
const stagedConsumerReleasePolicy = path.join(buildDir, "resources", "consumer-release.json");
const stagedClientIndex = path.join(buildDir, "resources", "client", "dist", "index.html");
const unpackedClientIndex = path.join(unpackedDir, "resources", "client", "dist", "index.html");
const unpackedAppArchive = path.join(unpackedDir, "resources", "app.asar");
const unpackedWindowIcon = path.join(unpackedDir, "resources", "icons", "app-icon.ico");
const unpackedBrandImage = path.join(unpackedDir, "resources", "icons", "app-icon.png");
const unpackedConsumerReleasePolicy = path.join(unpackedDir, "resources", "consumer-release.json");
const stagedRuntimeFile = path.join(appDir, "dist", "runtime", "server.js");

function assertExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

function assertNotExists(targetPath, description) {
  if (fs.existsSync(targetPath)) {
    throw new Error(`Unexpected ${description}: ${targetPath}`);
  }
}

function assertResolvesWithinDirectory(targetPath, expectedParentDir, description) {
  const resolvedPath = fs.realpathSync(targetPath);
  const normalizedParentDir = path.resolve(expectedParentDir);
  if (!resolvedPath.startsWith(normalizedParentDir)) {
    throw new Error(`${description} must resolve inside ${normalizedParentDir}, but resolved to ${resolvedPath}.`);
  }
}

function assertSomeMatch(entries, pattern, description) {
  const matchedEntry = entries.find((entry) => pattern.test(entry));
  if (!matchedEntry) {
    throw new Error(`Packaged app archive is missing ${description}.`);
  }
}

function assertNoMatch(entries, pattern, description) {
  const matchedEntry = entries.find((entry) => pattern.test(entry));
  if (matchedEntry) {
    throw new Error(`Packaged consumer app still contains ${description}: ${matchedEntry}`);
  }
}

function main() {
  assertExists(appPackageJsonPath, "staged desktop package.json");
  assertExists(builderWindowIcon, "builder desktop window icon");
  assertExists(stagedClientIndex, "staged renderer index");
  assertExists(unpackedClientIndex, "packaged renderer index");
  assertExists(unpackedAppArchive, "packaged app archive");
  assertExists(unpackedWindowIcon, "packaged desktop window icon");
  assertExists(unpackedBrandImage, "packaged desktop brand image");
  assertExists(stagedConsumerReleasePolicy, "staged consumer release policy");
  assertExists(unpackedConsumerReleasePolicy, "packaged consumer release policy");
  assertExists(stagedRuntimeFile, "desktop runtime server bundle");
  assertNotExists(path.join(appDir, "src"), "desktop source directory inside staged app");
  assertNotExists(path.join(appDir, "node_modules", "electron"), "Electron runtime inside staged app node_modules");
  assertResolvesWithinDirectory(
    path.join(appDir, "node_modules", "@0xnovelagent", "server"),
    appDir,
    "Staged server package",
  );

  const appPackageJson = JSON.parse(fs.readFileSync(appPackageJsonPath, "utf8"));
  if (appPackageJson.dependencies?.electron) {
    throw new Error("Electron must not be bundled as an application dependency in the staged app.");
  }

  const runtimeSource = fs.readFileSync(stagedRuntimeFile, "utf8");
  if (runtimeSource.includes("pnpm --filter @0xnovelagent/server start")) {
    throw new Error("Packaged desktop runtime still references pnpm-based server startup.");
  }
  const stagedClientIndexSource = fs.readFileSync(stagedClientIndex, "utf8");
  if (stagedClientIndexSource.includes('src="/assets/') || stagedClientIndexSource.includes('href="/assets/')) {
    throw new Error("Packaged desktop renderer still references absolute /assets paths.");
  }
  const stagedRendererFiles = [];
  const collectRendererFiles = (directoryPath) => {
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      const fullPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        collectRendererFiles(fullPath);
      } else if (entry.isFile()) {
        stagedRendererFiles.push(path.relative(path.dirname(stagedClientIndex), fullPath).replace(/\\/g, "/"));
      }
    }
  };
  collectRendererFiles(path.dirname(stagedClientIndex));
  for (const [pattern, description] of [
    [/PromptWorkbenchPage-/u, "Prompt workbench route chunk"],
    [/ModelRoutesPage-/u, "model routing route chunk"],
    [/TaskCenterPage-/u, "task center route chunk"],
    [/CreativeHubPage-/u, "professional creative hub route chunk"],
    [/SettingsPage-/u, "provider settings route chunk"],
  ]) {
    assertNoMatch(stagedRendererFiles, pattern, description);
  }
  if (fs.existsSync(stagedAppUpdateConfig)) {
    throw new Error("Packaged desktop must not include the retired latest.yml updater feed.");
  }
  const consumerReleasePolicy = JSON.parse(
    fs.readFileSync(stagedConsumerReleasePolicy, "utf8"),
  );
  if (
    consumerReleasePolicy.schemaVersion !== 2
    || consumerReleasePolicy.productMode !== "consumer"
    || !Array.isArray(consumerReleasePolicy.allowedRelayOrigins)
  ) {
    throw new Error("Packaged consumer release policy is invalid.");
  }
  for (const field of ["plannerModel", "writerModel", "reviewModel"]) {
    const value = consumerReleasePolicy[field];
    if (typeof value !== "string" || !value || value.length > 128 || /\s/u.test(value)) {
      throw new Error(`Packaged consumer release policy requires a valid ${field}.`);
    }
  }
  for (const origin of consumerReleasePolicy.allowedRelayOrigins) {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== origin) {
      throw new Error(`Packaged relay allowlist contains an unsafe origin: ${origin}`);
    }
  }
  if (consumerReleasePolicy.releaseChannel !== "beta") {
    for (const field of ["relayBaseUrl", "relayAccountBaseUrl", "packageReleaseBaseUrl"]) {
      const value = consumerReleasePolicy[field];
      if (typeof value !== "string" || new URL(value).protocol !== "https:") {
        throw new Error(`Public consumer release policy requires HTTPS ${field}.`);
      }
    }
    if (
      typeof consumerReleasePolicy.packageReleaseCode !== "string"
      || !/^[A-Za-z0-9_-]{32}$/.test(consumerReleasePolicy.packageReleaseCode)
    ) {
      throw new Error("Public consumer release policy requires a 32-character package release code.");
    }
  }

  const packagedFiles = new Set(asar.listPackage(unpackedAppArchive).map((entry) => entry.replace(/^\\/, "").replace(/\\/g, "/")));
  const packagedEntries = Array.from(packagedFiles);
  assertSomeMatch(
    packagedEntries,
    /^dist\/runtime\/server\.js$/,
    "desktop runtime server bundle inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@0xnovelagent\/server\/dist\/app\.js$/,
    "bundled server entry inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@0xnovelagent\/server\/src\/prisma\/migrations\/[^/]+\/migration\.sql$/,
    "bundled Prisma migration files inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/generated-client\/default\.js$/,
    "embedded generated Prisma client inside app.asar",
  );
  assertSomeMatch(
    packagedEntries,
    /^node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?@prisma\/client\/default\.js$/,
    "packaged Prisma client entrypoint inside app.asar",
  );

  console.log("[verify:desktop-package] staged package layout looks valid.");
  console.log(`[verify:desktop-package] unpacked app inspected at ${unpackedDir}`);
}

try {
  main();
} catch (error) {
  console.error("[verify:desktop-package] failed.", error);
  process.exit(1);
}
