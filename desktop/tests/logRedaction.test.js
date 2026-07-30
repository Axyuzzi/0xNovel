const test = require("node:test");
const assert = require("node:assert/strict");
const {
  redactDesktopLogMessage,
} = require("../dist/runtime/logRedaction.js");

test("desktop log redaction removes relay credentials from child-process output", () => {
  const redacted = redactDesktopLogMessage(
    'authorization=Bearer-secret token=sk-abcdefghijkl {"password":"hidden","apiKey":"api-secret"}',
  );

  assert.equal(redacted.includes("Bearer-secret"), false);
  assert.equal(redacted.includes("sk-abcdefghijkl"), false);
  assert.equal(redacted.includes("hidden"), false);
  assert.equal(redacted.includes("api-secret"), false);
  assert.ok(redactDesktopLogMessage("x".repeat(4_000)).length < 2_100);
});
