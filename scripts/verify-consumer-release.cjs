const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function requireText(source, needle, description) {
  if (!source.includes(needle)) {
    throw new Error(`Consumer release gate failed: ${description}.`);
  }
}

function rejectText(source, needle, description) {
  if (source.includes(needle)) {
    throw new Error(`Consumer release gate failed: ${description}.`);
  }
}

function main() {
  const boundary = read("server/src/middleware/consumerProductBoundary.ts");
  for (const forbiddenPrefix of [
    '"/api/novels"',
    '"/api/tasks"',
    '"/api/rag"',
    '"/api/settings"',
    '"/api/visual-assets"',
  ]) {
    rejectText(boundary, forbiddenPrefix, `legacy API prefix ${forbiddenPrefix} is still allowed`);
  }
  requireText(boundary, '"/api/consumer"', "dedicated consumer API is not allowed");
  const serverApp = read("server/src/app.ts");
  requireText(
    serverApp,
    "consumer mode: professional workers and third-party integrations stay disabled",
    "consumer server does not explicitly disable professional background workers",
  );

  const desktopServer = read("desktop/src/runtime/server.ts");
  requireText(desktopServer, 'AI_NOVEL_PRODUCT_MODE: "consumer"', "packaged server does not force consumer mode");
  requireText(desktopServer, "resolvePackagedConsumerReleasePolicy", "packaged relay policy is not enforced");
  requireText(desktopServer, 'LLM_DEBUG_LOG: "false"', "consumer LLM payload logging is not disabled");
  for (const modelEnvironmentName of [
    "OXNOVEL_RELAY_PLANNER_MODEL",
    "OXNOVEL_RELAY_WRITER_MODEL",
    "OXNOVEL_RELAY_REVIEW_MODEL",
  ]) {
    requireText(
      desktopServer,
      modelEnvironmentName,
      `packaged model route ${modelEnvironmentName} is not frozen`,
    );
  }

  const router = read("client/src/router/ConsumerAppRouter.tsx");
  const consumerRouteSection = router;
  for (const forbiddenRoute of [
    '"settings"',
    '"settings/model-routes"',
    '"tasks"',
    '"prompt-workbench"',
    '"creative-hub"',
  ]) {
    rejectText(consumerRouteSection, forbiddenRoute, `consumer router exposes ${forbiddenRoute}`);
  }
  requireText(consumerRouteSection, '"privacy"', "privacy route is missing");
  const desktopClientBuild = read("client/scripts/build-desktop.mjs");
  requireText(
    desktopClientBuild,
    'OXNOVEL_CONSUMER_ONLY_BUILD: "true"',
    "desktop renderer build is not consumer-only",
  );

  const releaseWorkflow = read(".github/workflows/desktop-release.yml");
  rejectText(
    releaseWorkflow,
    "AI_NOVEL_ALLOW_UNSIGNED_RELEASE",
    "public release workflow allows unsigned artifacts",
  );
  for (const requiredSecret of [
    "WINDOWS_CSC_LINK",
    "OXNOVEL_INTERNAL_PACKAGE_CODE",
    "OXNOVEL_RELAY_BASE_URL",
    "OXNOVEL_RELAY_ACCOUNT_BASE_URL",
  ]) {
    requireText(releaseWorkflow, requiredSecret, `release secret ${requiredSecret} is not wired`);
  }

  const builder = read("desktop/electron-builder.config.cjs");
  requireText(builder, "consumer-release.json", "packaged consumer policy is not bundled");
  rejectText(builder, "allowUnsignedRelease", "builder still has an unsigned release bypass");

  const main = read("desktop/src/main.ts");
  requireText(main, "desktop:delete-local-profile", "local data deletion IPC is missing");

  execFileSync(process.execPath, [path.join("scripts", "audit-commercial-egress.cjs")], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  console.log("[verify:consumer-release] consumer product and release boundaries passed.");
}

try {
  main();
} catch (error) {
  console.error("[verify:consumer-release] failed.", error);
  process.exit(1);
}
