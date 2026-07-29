const test = require("node:test");
const assert = require("node:assert/strict");
const { RelayHttpClient, RelayHttpError } = require("../dist/relay/client/RelayHttpClient.js");
const { RelayAuthService } = require("../dist/relay/auth/RelayAuthService.js");
const { relayCredentialStore } = require("../dist/relay/auth/RelayCredentialStore.js");
const { RelayUsageService } = require("../dist/relay/usage/RelayUsageService.js");
const { RelayPaymentService } = require("../dist/relay/payment/RelayPaymentService.js");
const {
  toConsumerRelayErrorMessage,
} = require("../dist/relay/errors/consumerRelayError.js");
const {
  resolveRelayModelAlias,
} = require("../dist/relay/config/relayConfig.js");
const {
  StructuredOutputError,
} = require("../dist/llm/structuredOutput.js");

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function balanceEnvelope(overrides = {}) {
  return {
    success: true,
    message: "",
    data: {
      userId: 123,
      username: "0xn_demo_user",
      quota: 5_000_000,
      balance: "10.00",
      usedQuota: 250_000,
      usedBalance: "0.50",
      quotaPerUnit: 500_000,
      group: "default",
      tokenId: 88,
      tokenName: "0xNovelAgent",
      tokenUnlimited: false,
      tokenQuota: 3_000_000,
      tokenBalance: "6.00",
      ...overrides,
    },
  };
}

test("registration freezes request fields and completes register-login-key-session provisioning", async () => {
  const requests = [];
  let listCount = 0;
  const fakeFetch = async (url, init) => {
    const target = new URL(String(url));
    const headers = new Headers(init.headers);
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ path: target.pathname, method: init.method, headers, body });

    if (target.pathname === "/api/user/register") {
      assert.deepEqual(body, {
        username: "0xn_demo_user",
        password: "password123",
        email: "demo@example.com",
        verification_code: "internal-code",
      });
      return jsonResponse({ success: true, data: { id: 123 } });
    }
    if (target.pathname === "/api/user/login") {
      assert.deepEqual(body, {
        username: "0xn_demo_user",
        password: "password123",
      });
      return jsonResponse(
        { success: true, data: { id: 123, username: "0xn_demo_user" } },
        { headers: { "set-cookie": "session=relay-cookie; Path=/; HttpOnly" } },
      );
    }
    if (target.pathname === "/api/token" && init.method === "GET") {
      assert.equal(headers.get("cookie"), "session=relay-cookie");
      assert.equal(headers.get("new-api-user"), "123");
      listCount += 1;
      return jsonResponse({
        success: true,
        data: {
          items: listCount === 1
            ? [{ id: 7, name: "other-client", status: 1, expired_time: -1 }]
            : [
                { id: 7, name: "other-client", status: 1, expired_time: -1 },
                {
                  id: 88,
                  name: "0xNovelAgent",
                  status: 1,
                  expired_time: -1,
                  unlimited_quota: true,
                  remain_quota: 0,
                },
              ],
        },
      });
    }
    if (target.pathname === "/api/token" && init.method === "POST") {
      assert.deepEqual(body, {
        name: "0xNovelAgent",
        expired_time: -1,
        remain_quota: 0,
        unlimited_quota: true,
        model_limits_enabled: false,
      });
      return jsonResponse({ success: true, data: { id: 88 } });
    }
    if (target.pathname === "/api/token/88/key") {
      return jsonResponse({ success: true, data: "register-token-without-prefix" });
    }
    if (target.pathname === "/api/usage/balance") {
      assert.equal(headers.get("authorization"), "Bearer sk-register-token-without-prefix");
      return jsonResponse(balanceEnvelope({
        tokenUnlimited: true,
        tokenQuota: 0,
      }));
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const client = new RelayHttpClient(fakeFetch, () => "https://relay.example.test");
  const auth = new RelayAuthService(client, new RelayUsageService(client));

  try {
    const session = await auth.register({
      username: "demo_user",
      password: "password123",
      email: "demo@example.com",
      verificationCode: "internal-code",
    });

    assert.deepEqual(session, {
      status: "authenticated",
      user: {
        id: "123",
        username: "0xn_demo_user",
        displayName: "0xn_demo_user",
      },
      balance: {
        userId: "123",
        username: "0xn_demo_user",
        availableCredits: 10,
        usedCredits: 0.5,
      },
    });
    assert.equal("token" in session, false);
    assert.equal(relayCredentialStore.getTokenForServerRequest(), "sk-register-token-without-prefix");
    assert.equal(requests.length, 7);
  } finally {
    relayCredentialStore.clear();
  }
});

test("login reuses only the newest active product key and restores user identity from balance", async () => {
  let tokenCreateCalls = 0;
  const fakeFetch = async (url, init) => {
    const target = new URL(String(url));
    const headers = new Headers(init.headers);
    if (target.pathname === "/api/user/login") {
      assert.deepEqual(JSON.parse(init.body), {
        username: "0xn_cookie_user",
        password: "password123",
      });
      return jsonResponse(
        { success: true, data: { id: 456, username: "0xn_cookie_user" } },
        { headers: { "set-cookie": "session=relay-cookie; Path=/; HttpOnly" } },
      );
    }
    if (target.pathname === "/api/token" && init.method === "GET") {
      return jsonResponse({
        success: true,
        data: {
          items: [
            { id: 3, name: "unrelated", status: 1, expired_time: -1 },
            { id: 40, name: "0xNovelAgent", status: 2, expired_time: -1 },
            { id: 41, name: "0xNovelAgent", status: 1, expired_time: 1 },
            { id: 42, name: "0xNovelAgent", status: 1, expired_time: -1 },
            { id: 43, name: "0xNovelAgent", status: 1, expired_time: -1 },
            {
              id: 44,
              name: "0xNovelAgent",
              status: 1,
              expired_time: 0,
              unlimited_quota: false,
              remain_quota: 0,
            },
          ],
        },
      });
    }
    if (target.pathname === "/api/token" && init.method === "POST") {
      tokenCreateCalls += 1;
    }
    if (target.pathname === "/api/token/43/key") {
      assert.equal(headers.get("cookie"), "session=relay-cookie");
      return jsonResponse({ success: true, data: { key: "sk-cookie-token" } });
    }
    if (target.pathname === "/api/usage/balance") {
      assert.equal(headers.get("authorization"), "Bearer sk-cookie-token");
      return jsonResponse(balanceEnvelope({
        userId: 456,
        username: "0xn_cookie_user",
      }));
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const client = new RelayHttpClient(fakeFetch, () => "https://relay.example.test");
  const auth = new RelayAuthService(client, new RelayUsageService(client));

  try {
    const session = await auth.login({
      username: "cookie_user",
      password: "password123",
    });
    assert.equal(session.status, "authenticated");
    assert.equal(session.user.id, "456");
    assert.equal(tokenCreateCalls, 0);
    assert.equal(relayCredentialStore.getTokenForServerRequest(), "sk-cookie-token");

    const restored = await auth.restore({
      token: "sk-cookie-token",
      user: { id: "stale", username: "stale", displayName: "stale" },
    });
    assert.equal(restored.user.id, "456");
    assert.equal(restored.user.username, "0xn_cookie_user");
    assert.equal(restored.user.displayName, "0xn_cookie_user");
  } finally {
    relayCredentialStore.clear();
  }
});

test("saved zero-quota product key is rejected before entering the product", async () => {
  const fakeFetch = async () => jsonResponse(balanceEnvelope({
    tokenUnlimited: false,
    tokenQuota: 0,
  }));
  const client = new RelayHttpClient(fakeFetch, () => "https://relay.example.test");
  const auth = new RelayAuthService(client, new RelayUsageService(client));

  await assert.rejects(
    () => auth.restore({
      token: "sk-expired-product-token",
      user: {
        id: "123",
        username: "0xn_demo_user",
        displayName: "demo",
      },
    }),
    (error) => error instanceof RelayHttpError
      && error.statusCode === 401
      && error.message === "创作凭证已失效，请重新登录以刷新凭证。",
  );
});

test("consumer-facing relay errors hide SDK troubleshooting details", () => {
  const message = toConsumerRelayErrorMessage(
    new Error(
      "[STRUCTURED_OUTPUT:transport_error] 401 Invalid token "
      + "Troubleshooting URL: https://docs.langchain.com/errors/MODEL_AUTHENTICATION/",
    ),
    "生成没有完成。",
  );
  assert.equal(message, "创作凭证已失效，请退出账号后重新登录。");

  const previousMode = process.env.AI_NOVEL_PRODUCT_MODE;
  process.env.AI_NOVEL_PRODUCT_MODE = "consumer";
  try {
    const structuredError = new StructuredOutputError({
      message:
        "401 Invalid token Troubleshooting URL: "
        + "https://docs.langchain.com/errors/MODEL_AUTHENTICATION/",
      category: "transport_error",
      diagnostics: {},
    });
    assert.equal(
      structuredError.message,
      "[STRUCTURED_OUTPUT:transport_error] 创作凭证已失效，请退出账号后重新登录。",
    );
  } finally {
    if (previousMode === undefined) {
      delete process.env.AI_NOVEL_PRODUCT_MODE;
    } else {
      process.env.AI_NOVEL_PRODUCT_MODE = previousMode;
    }
  }
});

test("consumer relay defaults to a model exposed by the owned relay", () => {
  const previous = process.env.OXNOVEL_RELAY_MODEL;
  delete process.env.OXNOVEL_RELAY_MODEL;
  try {
    assert.equal(resolveRelayModelAlias(), "qwen3.6-plus");
  } finally {
    if (previous === undefined) {
      delete process.env.OXNOVEL_RELAY_MODEL;
    } else {
      process.env.OXNOVEL_RELAY_MODEL = previous;
    }
  }
});

test("one relay API key authorizes balance, logs and payment contracts", async () => {
  const seenAuthorizedPaths = [];
  const fakeFetch = async (url, init) => {
    const target = new URL(String(url));
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer sk-adapter-token");
    seenAuthorizedPaths.push(target.pathname);
    if (target.pathname === "/api/usage/logs") {
      assert.equal(target.searchParams.get("p"), "2");
      assert.equal(target.searchParams.get("page_size"), "25");
      assert.equal(target.searchParams.get("type"), "2");
      assert.equal(target.searchParams.get("model_name"), "auto");
      assert.equal(target.searchParams.get("token_name"), "0xNovelAgent");
      assert.equal(target.searchParams.get("group"), "default");
      assert.equal(target.searchParams.get("request_id"), "req_1");
      assert.equal(target.searchParams.get("upstream_request_id"), "up_1");
      return jsonResponse({
        success: true,
        message: "",
        data: {
          page: 2,
          page_size: 25,
          total: 1,
          items: [{
            id: 1,
            user_id: 123,
            created_at: 1779417600,
            type: 2,
            content: "创作消费",
            username: "0xn_demo_user",
            token_name: "0xNovelAgent",
            model_name: "auto",
            quota: 500_000,
            prompt_tokens: 100,
            completion_tokens: 200,
            request_id: "req_1",
            upstream_request_id: "up_1",
            other: "{}",
          }],
        },
      });
    }
    if (target.pathname === "/api/usage/balance") {
      return jsonResponse(balanceEnvelope());
    }
    if (target.pathname === "/api/usage/payment/info") {
      return jsonResponse({
        success: true,
        message: "",
        data: {
          wechatPayEnabled: true,
          wechatPayMinTopUp: 1,
          quotaDisplayType: "USD",
          quotaPerUnit: 500_000,
        },
      });
    }
    if (target.pathname === "/api/usage/payment/wechat/native") {
      assert.deepEqual(JSON.parse(init.body), { amount: 10 });
      return jsonResponse({
        success: true,
        message: "",
        data: {
          orderNo: "WXP123",
          tradeNo: "WXP123",
          amount: 10,
          money: 10,
          code_url: "weixin://pay",
          expiresAt: 1779419400,
          status: "pending",
        },
      });
    }
    if (target.pathname === "/api/usage/payment/orders/WXP123") {
      return jsonResponse({
        success: true,
        message: "",
        data: {
          orderNo: "WXP123",
          tradeNo: "WXP123",
          amount: 10,
          money: 10,
          status: "paid",
          rawStatus: "success",
          createdAt: 1779417600,
          completedAt: 1779417660,
          paymentMethod: "wechat_native",
        },
      });
    }
    throw new Error(`unexpected request: ${url}`);
  };
  const client = new RelayHttpClient(fakeFetch, () => "https://relay.example.test");
  const usage = new RelayUsageService(client);
  const payment = new RelayPaymentService(client);

  const logs = await usage.getLogs("sk-adapter-token", {
    page: 2,
    pageSize: 25,
    type: 2,
    modelName: "auto",
    tokenName: "0xNovelAgent",
    group: "default",
    requestId: "req_1",
    upstreamRequestId: "up_1",
  });
  const info = await payment.getInfo("sk-adapter-token");
  const created = await payment.createWechatOrder("sk-adapter-token", 10);
  const paid = await payment.getOrder("sk-adapter-token", "WXP123");

  assert.deepEqual(logs.items[0], {
    id: "1",
    createdAt: 1779417600,
    category: "usage",
    credits: 1,
  });
  assert.deepEqual(info, { wechatPayEnabled: true, minimumCredits: 1 });
  assert.equal(created.codeUrl, "weixin://pay");
  assert.equal(paid.status, "paid");
  assert.deepEqual(new Set(seenAuthorizedPaths), new Set([
    "/api/usage/logs",
    "/api/usage/balance",
    "/api/usage/payment/info",
    "/api/usage/payment/wechat/native",
    "/api/usage/payment/orders/WXP123",
  ]));
});

test("payment adapter blocks an order when money and credited amount are not 1:1", async () => {
  const fakeFetch = async () => jsonResponse({
    success: true,
    data: {
      orderNo: "BAD123",
      tradeNo: "BAD123",
      amount: 10,
      money: 9,
      codeUrl: "weixin://pay",
      expiresAt: 1779419400,
      status: "pending",
    },
  });
  const payment = new RelayPaymentService(
    new RelayHttpClient(fakeFetch, () => "https://relay.example.test"),
  );

  await assert.rejects(
    () => payment.createWechatOrder("sk-adapter-token", 10),
    (error) => error instanceof RelayHttpError && error.statusCode === 502,
  );
});
