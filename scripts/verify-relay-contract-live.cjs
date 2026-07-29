const assert = require("node:assert/strict");

const token = process.env.OXNOVEL_RELAY_CONTRACT_TOKEN?.trim();
const accountBaseUrl = (
  process.env.OXNOVEL_RELAY_ACCOUNT_BASE_URL
  || process.env.OXNOVEL_RELAY_BASE_URL
  || ""
).trim();
const modelBaseUrl = (process.env.OXNOVEL_RELAY_BASE_URL || "").trim();
const model = (process.env.OXNOVEL_RELAY_MODEL || "auto").trim();
const runModel = process.env.OXNOVEL_RELAY_CONTRACT_RUN_MODEL === "true";
const paidOrderNo = process.env.OXNOVEL_RELAY_CONTRACT_PAID_ORDER_NO?.trim();

function requireConfiguration() {
  if (!token?.startsWith("sk-")) {
    throw new Error("Set OXNOVEL_RELAY_CONTRACT_TOKEN to a real sk- API key.");
  }
  if (!accountBaseUrl) {
    throw new Error("Set OXNOVEL_RELAY_ACCOUNT_BASE_URL (or OXNOVEL_RELAY_BASE_URL).");
  }
  if (runModel && !modelBaseUrl) {
    throw new Error("Set OXNOVEL_RELAY_BASE_URL before enabling the live model check.");
  }
}

function accountUrl(path, query) {
  const url = new URL(path, accountBaseUrl);
  if (query) url.search = query.toString();
  return url;
}

async function relayRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    throw new Error(
      `Relay request failed (${response.status} ${url.pathname}): ${
        body?.message || body?.error || "unknown response"
      }`,
    );
  }
  return body?.data ?? body;
}

async function readBalance() {
  const balance = await relayRequest(accountUrl("/api/usage/balance"));
  assert.equal(typeof balance.userId, "number");
  assert.equal(typeof balance.balance, "string");
  assert.equal(typeof balance.usedBalance, "string");
  assert.equal(typeof balance.tokenId, "number");
  return balance;
}

async function verifySharedKeyContracts() {
  const [balance, logs, paymentInfo] = await Promise.all([
    readBalance(),
    relayRequest(accountUrl("/api/usage/logs", new URLSearchParams({
      p: "1",
      page_size: "1",
      type: "0",
    }))),
    relayRequest(accountUrl("/api/usage/payment/info")),
  ]);
  assert.ok(Array.isArray(logs.items));
  assert.equal(typeof paymentInfo.wechatPayEnabled, "boolean");
  assert.equal(typeof paymentInfo.wechatPayMinTopUp, "number");
  console.log("[relay-contract:live] same key accepted by balance, logs and payment info.");
  return balance;
}

async function verifyPaidOrder() {
  if (!paidOrderNo) {
    console.log(
      "[relay-contract:live] paid-order check skipped; set OXNOVEL_RELAY_CONTRACT_PAID_ORDER_NO after paying a real small order.",
    );
    return;
  }
  const order = await relayRequest(
    accountUrl(`/api/usage/payment/orders/${encodeURIComponent(paidOrderNo)}`),
  );
  assert.equal(order.status, "paid");
  assert.equal(order.amount, order.money);
  console.log(
    `[relay-contract:live] paid order ${order.orderNo} passed: ${order.money} yuan -> ${order.amount} credits.`,
  );
}

async function invokeModel() {
  const url = new URL(`${modelBaseUrl.replace(/\/+$/, "")}/chat/completions`);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "只回复：契约验证通过" }],
      max_tokens: 16,
      temperature: 0,
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `Live model request failed (${response.status}): ${
        body?.message || body?.error?.message || "unknown response"
      }`,
    );
  }
  assert.ok(body?.choices?.[0]?.message);
  return body.id;
}

async function verifyModelDebit(before) {
  if (!runModel) {
    console.log(
      "[relay-contract:live] billed model check skipped; set OXNOVEL_RELAY_CONTRACT_RUN_MODEL=true to spend a minimal real call.",
    );
    return;
  }
  const completionId = await invokeModel();
  let after = before;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    after = await readBalance();
    if (Number(after.usedBalance) > Number(before.usedBalance)) break;
  }
  assert.ok(
    Number(after.usedBalance) > Number(before.usedBalance),
    "The live model call did not increase usedBalance.",
  );
  assert.ok(
    Number(after.balance) < Number(before.balance),
    "The live model call did not reduce balance.",
  );
  const recentLogs = await relayRequest(accountUrl("/api/usage/logs", new URLSearchParams({
    p: "1",
    page_size: "20",
    type: "2",
  })));
  assert.ok(recentLogs.items.length > 0, "No usage log appeared after the live model call.");
  console.log(
    `[relay-contract:live] model ${completionId || "(no id)"} debited ${
      Number(before.balance) - Number(after.balance)
    } credits and produced a usage log.`,
  );
}

async function main() {
  requireConfiguration();
  const before = await verifySharedKeyContracts();
  await verifyPaidOrder();
  await verifyModelDebit(before);
  console.log("[relay-contract:live] requested live relay checks passed.");
}

main().catch((error) => {
  console.error("[relay-contract:live] failed.", error);
  process.exitCode = 1;
});
