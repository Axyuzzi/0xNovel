import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import type { ApiResponse } from "@0xnovelagent/shared/types/api";

export const CREDENTIAL_BROKER_HEADER = "x-0xnovel-credential-broker";

function matches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function credentialBrokerGuard(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.OXNOVEL_CREDENTIAL_BROKER_TOKEN?.trim();
  const actual = req.header(CREDENTIAL_BROKER_HEADER)?.trim();
  if (expected && actual && matches(actual, expected)) {
    next();
    return;
  }

  const response: ApiResponse<null> = {
    success: false,
    error: "凭证操作未获授权。",
  };
  res.status(403).json(response);
}
