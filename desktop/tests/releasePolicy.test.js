const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  resolvePackagedConsumerReleasePolicy,
} = require("../dist/runtime/releasePolicy.js");

test("desktop release defaults always include the owned relay endpoints", () => {
  const defaults = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, "..", "config", "consumer-release.defaults.json"),
    "utf8",
  ));
  assert.deepEqual(defaults, {
    relayBaseUrl: "https://api.0xkey.cn/v1",
    relayAccountBaseUrl: "https://api.0xkey.cn",
  });
});

function withResourcesDir(resourcesDir, run) {
  const previous = process.env.AI_NOVEL_DESKTOP_RESOURCES_DIR;
  process.env.AI_NOVEL_DESKTOP_RESOURCES_DIR = resourcesDir;
  try {
    return run();
  } finally {
    if (previous == null) {
      delete process.env.AI_NOVEL_DESKTOP_RESOURCES_DIR;
    } else {
      process.env.AI_NOVEL_DESKTOP_RESOURCES_DIR = previous;
    }
  }
}

test("packaged consumer policy freezes relay origins and rejects mismatches", () => {
  const resourcesDir = fs.mkdtempSync(path.join(os.tmpdir(), "0xnovel-release-policy-"));
  const policyPath = path.join(resourcesDir, "consumer-release.json");
  fs.writeFileSync(policyPath, JSON.stringify({
    schemaVersion: 1,
    productMode: "consumer",
    releaseChannel: "release",
    relayBaseUrl: "https://relay.example.com/v1",
    relayAccountBaseUrl: "https://account.example.com",
    allowedRelayOrigins: [
      "https://relay.example.com",
      "https://account.example.com",
    ],
    updateUrl: "https://updates.example.com/windows",
  }));

  const resolved = withResourcesDir(
    resourcesDir,
    () => resolvePackagedConsumerReleasePolicy(),
  );
  assert.equal(resolved.productMode, "consumer");
  assert.deepEqual(resolved.allowedRelayOrigins, [
    "https://relay.example.com",
    "https://account.example.com",
  ]);

  fs.writeFileSync(policyPath, JSON.stringify({
    ...resolved,
    allowedRelayOrigins: ["https://unexpected.example.com"],
  }));
  assert.throws(
    () => withResourcesDir(resourcesDir, () => resolvePackagedConsumerReleasePolicy()),
    /不一致/,
  );
});
