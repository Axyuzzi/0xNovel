import { isCanonicalRelayApiKey } from "./relayApiKey";

const LOCAL_API_SESSION_HEADER = "x-0xnovel-local-session";
const CREDENTIAL_BROKER_HEADER = "x-0xnovel-credential-broker";

interface CredentialBrokerOptions {
  port: number;
  localApiSessionToken: string;
  credentialBrokerToken: string;
}

async function brokerRequest(
  options: CredentialBrokerOptions,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`http://127.0.0.1:${options.port}/api/consumer${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [LOCAL_API_SESSION_HEADER]: options.localApiSessionToken,
      [CREDENTIAL_BROKER_HEADER]: options.credentialBrokerToken,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json() as {
    success?: unknown;
    error?: unknown;
    data?: unknown;
  };
  if (!response.ok || payload.success !== true) {
    throw new Error(
      typeof payload.error === "string" && payload.error.trim()
        ? payload.error
        : "登录状态操作失败。",
    );
  }
  return payload.data;
}

export async function exportCredentialFromServer(
  options: CredentialBrokerOptions,
): Promise<{
  token: string;
  userId: string;
  username: string;
  displayName: string;
}> {
  const data = await brokerRequest(options, "/auth/broker/export") as {
    token?: unknown;
    userId?: unknown;
    username?: unknown;
    displayName?: unknown;
  };
  if (
    typeof data?.token !== "string"
    || !isCanonicalRelayApiKey(data.token)
    || typeof data.userId !== "string"
    || !data.userId.trim()
    || typeof data.username !== "string"
    || !data.username.trim()
    || typeof data.displayName !== "string"
    || !data.displayName.trim()
  ) {
    throw new Error("本机服务没有返回可保存的登录状态。");
  }
  return {
    token: data.token,
    userId: data.userId.trim(),
    username: data.username.trim(),
    displayName: data.displayName.trim(),
  };
}

export async function restoreCredentialToServer(
  options: CredentialBrokerOptions,
  credential: {
    token: string;
    userId: string;
    username: string;
    displayName: string;
  },
): Promise<void> {
  await brokerRequest(options, "/auth/broker/restore", {
    token: credential.token,
    ...(credential.userId.trim() && credential.username.trim()
      ? {
          userId: credential.userId.trim(),
          username: credential.username.trim(),
          displayName: credential.displayName.trim() || credential.username.trim(),
        }
      : {}),
  });
}
