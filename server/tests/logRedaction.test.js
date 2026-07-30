const test = require("node:test");
const assert = require("node:assert/strict");
const { redactLogText } = require("../dist/platform/logging/redaction.js");

test("server log redaction removes credentials and caps untrusted text", () => {
  const redacted = redactLogText(
    'POST /callback?token=query-secret&safe=1 {"password":"p@ss","token":"sk-abcdefghijkl","authorization":"Bearer bearer-secret"}',
  );

  assert.equal(redacted.includes("query-secret"), false);
  assert.equal(redacted.includes("p@ss"), false);
  assert.equal(redacted.includes("sk-abcdefghijkl"), false);
  assert.equal(redacted.includes("bearer-secret"), false);
  assert.match(redacted, /safe=1/);
  assert.ok(redactLogText("x".repeat(4_000)).length < 2_100);
});
