import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@0xnovelagent/shared/types/api";
import { isConsumerProductMode } from "../config/productMode";

export const LOCAL_API_SESSION_HEADER = "x-0xnovel-local-session";

function matchesSessionToken(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function localApiSessionGuard(req: Request, res: Response, next: NextFunction): void {
  if (!isConsumerProductMode()) {
    next();
    return;
  }

  const expectedToken = process.env.OXNOVEL_LOCAL_API_SESSION_TOKEN?.trim();
  const actualToken = req.header(LOCAL_API_SESSION_HEADER)?.trim();
  if (expectedToken && actualToken && matchesSessionToken(actualToken, expectedToken)) {
    next();
    return;
  }

  const response: ApiResponse<null> = {
    success: false,
    error: "本机创作会话已失效，请重新启动应用。",
  };
  res.status(401).json(response);
}
