import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import {
  consumerSetupConfirmRequestSchema,
  consumerSetupGenerateRequestSchema,
} from "@0xnovelagent/shared/types/consumerSetup";
import { Router } from "express";
import { z } from "zod";
import { AppError } from "../../../middleware/errorHandler";
import { validate } from "../../../middleware/validate";
import { relayCredentialStore } from "../../../relay/auth/RelayCredentialStore";
import { consumerSetupService } from "../application/setupServiceInstance";

const router = Router();

const novelParamsSchema = z.object({
  novelId: z.string().trim().min(1).max(128),
});

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

router.use((_req, _res, next) => {
  if (!relayCredentialStore.getUser()) {
    next(new AppError("登录后才能准备新作品。", 401));
    return;
  }
  next();
});

router.get(
  "/novels/:novelId",
  validate({ params: novelParamsSchema }),
  async (req, res, next) => {
    try {
      const data = await consumerSetupService.getSnapshot(routeParam(req.params.novelId));
      res.status(200).json({
        success: true,
        data,
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/generate",
  validate({
    params: novelParamsSchema,
    body: consumerSetupGenerateRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerSetupService.generate(
        routeParam(req.params.novelId),
        req.body,
      );
      res.status(200).json({
        success: true,
        data,
        message: "这一步已生成，请确认结果。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/novels/:novelId/confirm",
  validate({
    params: novelParamsSchema,
    body: consumerSetupConfirmRequestSchema,
  }),
  async (req, res, next) => {
    try {
      const data = await consumerSetupService.confirm(
        routeParam(req.params.novelId),
        req.body,
      );
      res.status(200).json({
        success: true,
        data,
        message: data.status === "completed" ? "作品准备完成。" : "已确认，下一步由你决定何时开始。",
      } satisfies ApiResponse<typeof data>);
    } catch (error) {
      next(error);
    }
  },
);

export default router;
