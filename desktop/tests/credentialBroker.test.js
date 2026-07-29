const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const {
  exportCredentialFromServer,
  restoreCredentialToServer,
} = require("../dist/runtime/credentialBroker.js");

async function withBrokerServer(handler, callback) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  try {
    await callback({
      port: address.port,
      localApiSessionToken: "local-session",
      credentialBrokerToken: "broker-session",
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("credential broker exports and restores the canonical key with stable user identity", async () => {
  const requests = [];
  await withBrokerServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      requests.push({
        path: request.url,
        localSession: request.headers["x-0xnovel-local-session"],
        brokerSession: request.headers["x-0xnovel-credential-broker"],
        body: rawBody ? JSON.parse(rawBody) : undefined,
      });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        success: true,
        data: request.url.endsWith("/export")
          ? {
              token: "sk-desktop-contract",
              userId: "42",
              username: "0xn_writer",
              displayName: "Writer",
            }
          : { status: "authenticated" },
      }));
    });
  }, async (options) => {
    const credential = await exportCredentialFromServer(options);
    assert.deepEqual(credential, {
      token: "sk-desktop-contract",
      userId: "42",
      username: "0xn_writer",
      displayName: "Writer",
    });
    await restoreCredentialToServer(options, credential);
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].localSession, "local-session");
  assert.equal(requests[0].brokerSession, "broker-session");
  assert.deepEqual(requests[1].body, {
    token: "sk-desktop-contract",
    userId: "42",
    username: "0xn_writer",
    displayName: "Writer",
  });
});

test("credential broker rejects a non-canonical key returned by the local server", async () => {
  await withBrokerServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      success: true,
      data: {
        token: "raw-key",
        userId: "42",
        username: "0xn_writer",
        displayName: "Writer",
      },
    }));
  }, async (options) => {
    await assert.rejects(
      () => exportCredentialFromServer(options),
      (error) => error instanceof Error,
    );
  });
});
