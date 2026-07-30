const test = require("node:test");
const assert = require("node:assert/strict");
const { consumerProductBoundary } = require("../dist/middleware/consumerProductBoundary.js");
const {
  LOCAL_API_SESSION_HEADER,
  localApiSessionGuard,
} = require("../dist/middleware/localApiSession.js");
const {
  CREDENTIAL_BROKER_HEADER,
  credentialBrokerGuard,
} = require("../dist/relay/http/credentialBrokerGuard.js");
const { relayCredentialStore } = require("../dist/relay/auth/RelayCredentialStore.js");
const {
  resolveConsumerRelayModelRole,
  resolveConsumerRelayPolicy,
} = require("../dist/relay/llm/consumerRelayPolicy.js");

function withEnvironment(values, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value == null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("consumer product boundary hides professional configuration routes", async () => {
  await withEnvironment({ AI_NOVEL_PRODUCT_MODE: "consumer" }, async () => {
    let nextCalled = false;
    let statusCode = 200;
    let body = null;
    const response = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(value) {
        body = value;
        return this;
      },
    };

    consumerProductBoundary(
      { path: "/api/settings/model-routes" },
      response,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 404);
    assert.deepEqual(body, {
      success: false,
      error: "该功能不在当前产品中提供。",
    });
  });
});

test("consumer product boundary keeps only the dedicated consumer API available", async () => {
  await withEnvironment({ AI_NOVEL_PRODUCT_MODE: "consumer" }, async () => {
    let nextCalled = false;

    consumerProductBoundary(
      { path: "/api/consumer/workspace/novels/example" },
      {
        status() {
          throw new Error("consumer route should not be blocked");
        },
        json() {
          throw new Error("consumer route should not be blocked");
        },
      },
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  });
});

test("consumer product boundary rejects legacy novel and asset routes", async () => {
  await withEnvironment({ AI_NOVEL_PRODUCT_MODE: "consumer" }, async () => {
    for (const path of [
      "/api/novels/example",
      "/api/novel-workflows",
      "/api/rag/jobs",
      "/api/tasks",
      "/api/visual-assets",
    ]) {
      let nextCalled = false;
      let statusCode = 200;

      consumerProductBoundary(
        { path },
        {
          status(code) {
            statusCode = code;
            return this;
          },
          json() {
            return this;
          },
        },
        () => {
          nextCalled = true;
        },
      );

      assert.equal(nextCalled, false, `${path} should stay unreachable`);
      assert.equal(statusCode, 404);
    }
  });
});

test("consumer product boundary rejects routes outside the explicit allowlist", async () => {
  await withEnvironment({ AI_NOVEL_PRODUCT_MODE: "consumer" }, async () => {
    let nextCalled = false;
    let statusCode = 200;

    consumerProductBoundary(
      { path: "/api/creative-hub" },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json() {
          return this;
        },
      },
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, false);
    assert.equal(statusCode, 404);
  });
});

test("consumer local API session guard requires the per-launch desktop credential", async () => {
  await withEnvironment({
    AI_NOVEL_PRODUCT_MODE: "consumer",
    OXNOVEL_LOCAL_API_SESSION_TOKEN: "local-session-test",
  }, async () => {
    const invoke = (headerValue) => {
      let nextCalled = false;
      let statusCode = 200;
      localApiSessionGuard(
        {
          header(name) {
            return name === LOCAL_API_SESSION_HEADER ? headerValue : undefined;
          },
        },
        {
          status(code) {
            statusCode = code;
            return this;
          },
          json() {
            return this;
          },
        },
        () => {
          nextCalled = true;
        },
      );
      return { nextCalled, statusCode };
    };

    assert.deepEqual(invoke(undefined), { nextCalled: false, statusCode: 401 });
    assert.deepEqual(invoke("wrong-session"), { nextCalled: false, statusCode: 401 });
    assert.deepEqual(invoke("local-session-test"), { nextCalled: true, statusCode: 200 });
  });
});

test("credential broker uses a separate main-process-only credential", async () => {
  await withEnvironment({
    OXNOVEL_CREDENTIAL_BROKER_TOKEN: "broker-session-test",
  }, async () => {
    const invoke = (headerValue) => {
      let nextCalled = false;
      let statusCode = 200;
      credentialBrokerGuard(
        {
          header(name) {
            return name === CREDENTIAL_BROKER_HEADER ? headerValue : undefined;
          },
        },
        {
          status(code) {
            statusCode = code;
            return this;
          },
          json() {
            return this;
          },
        },
        () => {
          nextCalled = true;
        },
      );
      return { nextCalled, statusCode };
    };

    assert.deepEqual(invoke(undefined), { nextCalled: false, statusCode: 403 });
    assert.deepEqual(invoke("local-session-test"), { nextCalled: false, statusCode: 403 });
    assert.deepEqual(invoke("broker-session-test"), { nextCalled: true, statusCode: 200 });
  });
});

test("consumer LLM policy resolves only the configured relay and authenticated user token", async () => {
  await withEnvironment({
    AI_NOVEL_PRODUCT_MODE: "consumer",
    NODE_ENV: "production",
    OXNOVEL_RELAY_BASE_URL: "https://relay.example.com/v1/",
    OXNOVEL_RELAY_ALLOWED_ORIGINS: "https://relay.example.com",
    OXNOVEL_RELAY_MODEL: "auto",
  }, async () => {
    relayCredentialStore.setAuthenticatedSession({
      token: "sk-consumer-test",
      user: {
        id: "42",
        username: "writer",
        displayName: "Writer",
      },
    });

    try {
      const resolved = resolveConsumerRelayPolicy();

      assert.equal(resolved.provider, "relay");
      assert.equal(resolved.providerName, "0xNovelAgent 创作服务");
      assert.equal(resolved.apiKey, "sk-consumer-test");
      assert.equal(resolved.baseURL, "https://relay.example.com/v1");
      assert.equal(resolved.model, "auto");
      assert.equal(resolved.modelRole, "planner");
      assert.equal(resolved.modelRoute, "consumer:planner");
      assert.equal(resolved.requestProtocol, "openai_compatible");
    } finally {
      relayCredentialStore.clear();
    }
  });
});

test("consumer LLM policy routes prompts to planner, writer and review models", async () => {
  await withEnvironment({
    AI_NOVEL_PRODUCT_MODE: "consumer",
    NODE_ENV: "production",
    OXNOVEL_RELAY_BASE_URL: "https://relay.example.com/v1",
    OXNOVEL_RELAY_ALLOWED_ORIGINS: "https://relay.example.com",
    OXNOVEL_RELAY_MODEL: null,
    OXNOVEL_RELAY_PLANNER_MODEL: null,
    OXNOVEL_RELAY_WRITER_MODEL: null,
    OXNOVEL_RELAY_REVIEW_MODEL: null,
  }, async () => {
    relayCredentialStore.setAuthenticatedSession({
      token: "sk-consumer-test",
      user: {
        id: "42",
        username: "writer",
        displayName: "Writer",
      },
    });

    try {
      const cases = [
        ["consumer.setup.story_direction", "writer", "qwen3.7-plus"],
        ["consumer.setup.book_skeleton", "review", "claude-sonnet-4-6"],
        ["consumer.setup.volume_plan", "planner", "deepseek-v4-flash"],
        ["consumer.setup.current_phase", "planner", "deepseek-v4-flash"],
        ["consumer.setup.first_chapter", "writer", "qwen3.7-plus"],
        ["consumer.chapter.task", "planner", "deepseek-v4-flash"],
        ["consumer.chapter.write", "writer", "qwen3.7-plus"],
        ["consumer.chapter.continue", "writer", "qwen3.7-plus"],
        ["consumer.chapter.revise", "writer", "qwen3.7-plus"],
        ["consumer.chapter.rewrite", "writer", "qwen3.7-plus"],
        ["consumer.story.review", "review", "claude-sonnet-4-6"],
        ["consumer.story.adjust", "planner", "deepseek-v4-flash"],
        ["consumer.story.transition", "planner", "deepseek-v4-flash"],
      ];

      for (const [promptId, expectedRole, expectedModel] of cases) {
        assert.equal(resolveConsumerRelayModelRole({ promptId }), expectedRole);
        const policy = resolveConsumerRelayPolicy({ promptId });
        assert.equal(policy.modelRole, expectedRole);
        assert.equal(policy.model, expectedModel);
        assert.equal(policy.modelRoute, `consumer:${expectedRole}`);
      }
    } finally {
      relayCredentialStore.clear();
    }
  });
});

test("consumer relay policy rejects a production URL outside the packaged allowlist", async () => {
  await withEnvironment({
    AI_NOVEL_PRODUCT_MODE: "consumer",
    NODE_ENV: "production",
    OXNOVEL_RELAY_BASE_URL: "https://unexpected.example.com/v1",
    OXNOVEL_RELAY_ALLOWED_ORIGINS: "https://relay.example.com",
  }, async () => {
    relayCredentialStore.setAuthenticatedSession({
      token: "sk-consumer-test",
      user: {
        id: "42",
        username: "writer",
        displayName: "Writer",
      },
    });
    try {
      assert.throws(
        () => resolveConsumerRelayPolicy(),
        /不在允许范围/,
      );
    } finally {
      relayCredentialStore.clear();
    }
  });
});
