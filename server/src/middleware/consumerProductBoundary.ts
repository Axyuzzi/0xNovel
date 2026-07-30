import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import { isConsumerProductMode } from "../config/productMode";

const ALLOWED_CONSUMER_PREFIXES = [
  "/api/health",
  "/api/consumer",
] as const;

export function consumerProductBoundary(req: Request, res: Response, next: NextFunction): void {
  if (!isConsumerProductMode()) {
    next();
    return;
  }

  const allowed = ALLOWED_CONSUMER_PREFIXES.some(
    (prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`),
  );
  if (allowed) {
    next();
    return;
  }

  const response: ApiResponse<null> = {
    success: false,
    error: "该功能不在当前产品中提供。",
  };
  res.status(404).json(response);
}
