const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { z } = require("zod");
const { ChatOpenAI } = require("@langchain/openai");
const { relayCredentialStore } = require("../dist/relay/auth/RelayCredentialStore.js");
const { resolveConsumerRelayPolicy } = require("../dist/relay/llm/consumerRelayPolicy.js");

async function withEnvironment(values, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function completionEnvelope(content) {
  return {
    id: "chatcmpl-relay-contract",
    object: "chat.completion",
    created: 1779417600,
    model: "contract-model",
    choices: [{
      index: 0,
      message: { role: "assistant", content },
      finish_reason: "stop",
      logprobs: null,
    }],
    usage: {
      prompt_tokens: 1,
      completion_tokens: 1,
      total_tokens: 2,
    },
  };
}

test("consumer relay supports plain, streaming and structured model output with the same key", async () => {
  const requests = [];
  const server = http.createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(rawBody);
      requests.push({
        authorization: request.headers.authorization,
        path: request.url,
        body,
      });

      if (body.stream === true) {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        });
        response.write(`data: ${JSON.stringify({
          id: "chatcmpl-relay-stream",
          object: "chat.completion.chunk",
          created: 1779417600,
          model: "contract-model",
          choices: [{
            index: 0,
            delta: { role: "assistant", content: "stream-ok" },
            finish_reason: null,
          }],
        })}\n\n`);
        response.write(`data: ${JSON.stringify({
          id: "chatcmpl-relay-stream",
          object: "chat.completion.chunk",
          created: 1779417600,
          model: "contract-model",
          choices: [{
            index: 0,
            delta: {},
            finish_reason: "stop",
          }],
        })}\n\n`);
        response.end("data: [DONE]\n\n");
        return;
      }

      const isStructured = Boolean(body.response_format);
      const content = isStructured
        ? JSON.stringify({ value: "structured-ok" })
        : "plain-ok";
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(completionEnvelope(content)));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");

  await withEnvironment({
    AI_NOVEL_PRODUCT_MODE: "consumer",
    NODE_ENV: "development",
    OXNOVEL_RELAY_BASE_URL: `http://127.0.0.1:${address.port}/v1`,
    OXNOVEL_RELAY_MODEL: "contract-model",
  }, async () => {
    relayCredentialStore.setAuthenticatedSession({
      token: "sk-relay-llm-contract",
      user: {
        id: "42",
        username: "0xn_writer",
        displayName: "Writer",
      },
    });
    try {
      const policy = resolveConsumerRelayPolicy();
      assert.equal(policy.apiKey, "sk-relay-llm-contract");
      assert.equal(policy.model, "contract-model");
      assert.equal(policy.baseURL, `http://127.0.0.1:${address.port}/v1`);
      const createRelayLlm = () => new ChatOpenAI({
        apiKey: policy.apiKey,
        model: policy.model,
        configuration: { baseURL: policy.baseURL },
      });

      const plainLlm = createRelayLlm();
      const plain = await plainLlm.invoke("plain contract");
      assert.equal(plain.content, "plain-ok");

      const streamingLlm = createRelayLlm();
      const stream = await streamingLlm.stream("stream contract");
      let streamedText = "";
      for await (const chunk of stream) {
        streamedText += typeof chunk.content === "string" ? chunk.content : "";
      }
      assert.equal(streamedText, "stream-ok");

      const structuredLlm = createRelayLlm();
      const runnable = structuredLlm.withStructuredOutput(
        z.object({ value: z.string() }),
        { name: "relay_contract", method: "jsonSchema" },
      );
      assert.deepEqual(await runnable.invoke("structured contract"), {
        value: "structured-ok",
      });
    } finally {
      relayCredentialStore.clear();
    }
  });

  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.equal(request.authorization, "Bearer sk-relay-llm-contract");
    assert.equal(request.path, "/v1/chat/completions");
    assert.equal(request.body.model, "contract-model");
  }
});
