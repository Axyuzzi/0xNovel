import { Router } from "express";
import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  relayCreatePaymentRequestSchema,
  relayApiKeySchema,
  relayLoginRequestSchema,
  relayRegisterRequestSchema,
  relayUsageLogQuerySchema,
  type ConsumerBalance,
  type ConsumerPaymentInfo,
  type ConsumerUsageLogs,
  type RelayPaymentOrder,
  type RelaySession,
  type RelayWechatPaymentOrder,
} from "@0xnovelagent/shared/types/relay";
import { AppError } from "../../middleware/errorHandler";
import { RelayHttpError } from "../client/RelayHttpClient";
import { relayAuthService } from "../auth/RelayAuthService";
import { relayCredentialStore } from "../auth/RelayCredentialStore";
import { relayPaymentService } from "../payment/RelayPaymentService";
import { relayUsageService } from "../usage/RelayUsageService";
import { credentialBrokerGuard } from "./credentialBrokerGuard";
import { z } from "zod";

const router = Router();
const brokerRestoreSchema = z.object({
  token: relayApiKeySchema,
  userId: z.string().trim().min(1).max(128).optional(),
  username: z.string().trim().min(1).max(128).optional(),
  displayName: z.string().trim().min(1).max(128).optional(),
});

function requireRelayToken(): string {
  const token = relayCredentialStore.getTokenForServerRequest();
  if (!token) {
    throw new AppError("登录后才能使用创作服务。", 401);
  }
  return token;
}

function forwardRelayError(error: unknown): never {
  if (error instanceof RelayHttpError) {
    throw new AppError(error.message, error.statusCode);
  }
  throw error;
}

router.post("/auth/register", async (req, res) => {
  try {
    const input = relayRegisterRequestSchema.parse(req.body);
    const data = await relayAuthService.register(input);
    const response: ApiResponse<RelaySession> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const input = relayLoginRequestSchema.parse(req.body);
    const data = await relayAuthService.login(input);
    const response: ApiResponse<RelaySession> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.get("/auth/session", async (_req, res) => {
  try {
    const data = await relayAuthService.getSession();
    const response: ApiResponse<RelaySession> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.post("/auth/logout", (_req, res) => {
  const data = relayAuthService.logout();
  const response: ApiResponse<RelaySession> = { success: true, data };
  res.status(200).json(response);
});

router.post("/auth/broker/export", credentialBrokerGuard, (_req, res) => {
  const snapshot = relayCredentialStore.getSnapshotForCredentialBroker();
  if (!snapshot) {
    throw new AppError("当前没有可保存的登录状态。", 401);
  }
  const response: ApiResponse<{
    token: string;
    userId: string;
    username: string;
    displayName: string;
  }> = {
    success: true,
    data: {
      token: snapshot.token,
      userId: snapshot.user.id,
      username: snapshot.user.username,
      displayName: snapshot.user.displayName,
    },
  };
  res.status(200).json(response);
});

router.post("/auth/broker/restore", credentialBrokerGuard, async (req, res) => {
  try {
    const input = brokerRestoreSchema.parse(req.body);
    const storedUser = input.userId && input.username
      ? {
          id: input.userId,
          username: input.username,
          displayName: input.displayName || input.username,
        }
      : undefined;
    const data = await relayAuthService.restore({ token: input.token, user: storedUser });
    const response: ApiResponse<RelaySession> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.get("/usage/balance", async (_req, res) => {
  try {
    const data = await relayUsageService.getBalance(requireRelayToken());
    const response: ApiResponse<ConsumerBalance> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.get("/usage/logs", async (req, res) => {
  try {
    const input = relayUsageLogQuerySchema.parse(req.query);
    const data = await relayUsageService.getLogs(requireRelayToken(), input);
    const response: ApiResponse<ConsumerUsageLogs> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.get("/payment/info", async (_req, res) => {
  try {
    const data = await relayPaymentService.getInfo(requireRelayToken());
    const response: ApiResponse<ConsumerPaymentInfo> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.post("/payment/wechat/native", async (req, res) => {
  try {
    const input = relayCreatePaymentRequestSchema.parse(req.body);
    const data = await relayPaymentService.createWechatOrder(
      requireRelayToken(),
      input.amount,
    );
    const response: ApiResponse<RelayWechatPaymentOrder> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

router.get("/payment/orders/:orderNo", async (req, res) => {
  try {
    const orderNo = String(req.params.orderNo ?? "").trim();
    if (!orderNo || orderNo.length > 128) {
      throw new AppError("充值订单编号无效。", 400);
    }
    const data = await relayPaymentService.getOrder(requireRelayToken(), orderNo);
    const response: ApiResponse<RelayPaymentOrder> = { success: true, data };
    res.status(200).json(response);
  } catch (error) {
    forwardRelayError(error);
  }
});

export default router;
