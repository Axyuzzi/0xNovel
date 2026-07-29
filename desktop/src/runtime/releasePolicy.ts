import fs from "node:fs";
import path from "node:path";
import { resolveDesktopResourcesDir } from "./paths";

export interface PackagedConsumerReleasePolicy {
  schemaVersion: 1;
  productMode: "consumer";
  releaseChannel: string;
  relayBaseUrl: string | null;
  relayAccountBaseUrl: string | null;
  allowedRelayOrigins: string[];
  registerAuthCode: string | null;
  updateUrl: string | null;
}

function parseOptionalHttpsUrl(value: unknown, field: string): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Packaged consumer policy field ${field} is invalid.`);
  }
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.hash
  ) {
    throw new Error(`Packaged consumer policy field ${field} must be a safe HTTPS URL.`);
  }
  return parsed.toString().replace(/\/$/u, "");
}

export function resolvePackagedConsumerReleasePolicy(): PackagedConsumerReleasePolicy {
  const policyPath = path.join(resolveDesktopResourcesDir(), "consumer-release.json");
  if (!fs.existsSync(policyPath)) {
    throw new Error("正式桌面包缺少创作服务安全策略，已停止启动。");
  }

  const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8")) as Record<string, unknown>;
  if (parsed.schemaVersion !== 1 || parsed.productMode !== "consumer") {
    throw new Error("正式桌面包的产品安全策略无效，已停止启动。");
  }
  const relayBaseUrl = parseOptionalHttpsUrl(parsed.relayBaseUrl, "relayBaseUrl");
  const relayAccountBaseUrl = parseOptionalHttpsUrl(
    parsed.relayAccountBaseUrl,
    "relayAccountBaseUrl",
  );
  const updateUrl = parseOptionalHttpsUrl(parsed.updateUrl, "updateUrl");
  if (!Array.isArray(parsed.allowedRelayOrigins)) {
    throw new Error("正式桌面包的中转域名白名单无效。");
  }
  const allowedRelayOrigins = parsed.allowedRelayOrigins.map((value) => {
    if (typeof value !== "string") {
      throw new Error("正式桌面包的中转域名白名单无效。");
    }
    const url = new URL(value);
    if (url.protocol !== "https:" || url.origin !== value) {
      throw new Error("正式桌面包的中转域名白名单必须只包含 HTTPS Origin。");
    }
    return value;
  });
  const expectedOrigins = new Set(
    [relayBaseUrl, relayAccountBaseUrl]
      .filter((value): value is string => Boolean(value))
      .map((value) => new URL(value).origin),
  );
  if (
    expectedOrigins.size !== allowedRelayOrigins.length
    || allowedRelayOrigins.some((origin) => !expectedOrigins.has(origin))
  ) {
    throw new Error("正式桌面包的中转地址与域名白名单不一致。");
  }

  return {
    schemaVersion: 1,
    productMode: "consumer",
    releaseChannel: typeof parsed.releaseChannel === "string" ? parsed.releaseChannel : "beta",
    relayBaseUrl,
    relayAccountBaseUrl,
    allowedRelayOrigins,
    registerAuthCode: typeof parsed.registerAuthCode === "string" && parsed.registerAuthCode.trim()
      ? parsed.registerAuthCode.trim()
      : null,
    updateUrl,
  };
}
