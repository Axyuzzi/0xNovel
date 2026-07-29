import { z } from "zod";

const requiredText = (label: string, maxLength: number) => z.string()
  .trim()
  .min(1, `${label}不能为空。`)
  .max(maxLength, `${label}不能超过 ${maxLength} 个字符。`);

export const relayApiKeySchema = z.string()
  .trim()
  .min(7, "创作服务登录凭证无效。")
  .max(512, "创作服务登录凭证过长。")
  .startsWith("sk-", "创作服务登录凭证格式无效。");

export function normalizeRelayApiKey(value: string): string {
  const trimmed = value.trim();
  return relayApiKeySchema.parse(trimmed.startsWith("sk-") ? trimmed : `sk-${trimmed}`);
}

export const relayRegisterRequestSchema = z.object({
  // 用户名上限预留项目前缀（0xn_，4 字符）的空间，避免加前缀后超过中转的 max 校验。
  username: requiredText("账号", 60),
  password: z.string().min(8, "密码至少需要 8 个字符。").max(128, "密码不能超过 128 个字符。"),
  email: z.email("邮箱格式不正确。").max(254).optional(),
  verificationCode: z.string().trim().min(1).max(32).optional(),
});

export type RelayRegisterRequest = z.infer<typeof relayRegisterRequestSchema>;

export const relayLoginRequestSchema = z.object({
  username: requiredText("账号", 254),
  password: z.string().min(1, "密码不能为空。").max(128, "密码不能超过 128 个字符。"),
});

export type RelayLoginRequest = z.infer<typeof relayLoginRequestSchema>;

export const relayUserSummarySchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
});

export type RelayUserSummary = z.infer<typeof relayUserSummarySchema>;

export const relayBalanceSchema = z.object({
  userId: z.number().int(),
  username: z.string(),
  quota: z.number(),
  balance: z.string(),
  usedQuota: z.number(),
  usedBalance: z.string(),
  quotaPerUnit: z.number(),
  group: z.string(),
  tokenId: z.number().int(),
  tokenName: z.string(),
  tokenUnlimited: z.boolean(),
  tokenQuota: z.number().nullable(),
  tokenBalance: z.string().nullable(),
});

export type RelayBalance = z.infer<typeof relayBalanceSchema>;

export const consumerBalanceSchema = z.object({
  userId: z.string(),
  username: z.string(),
  availableCredits: z.number().nonnegative(),
  usedCredits: z.number().nonnegative(),
});

export type ConsumerBalance = z.infer<typeof consumerBalanceSchema>;

export const relayUsageLogItemSchema = z.object({
  id: z.number().int(),
  user_id: z.number().int(),
  created_at: z.number().int(),
  type: z.number().int(),
  content: z.string(),
  username: z.string(),
  token_name: z.string(),
  model_name: z.string(),
  quota: z.number(),
  prompt_tokens: z.number().int(),
  completion_tokens: z.number().int(),
  request_id: z.string(),
  upstream_request_id: z.string(),
  other: z.string(),
});

export type RelayUsageLogItem = z.infer<typeof relayUsageLogItemSchema>;

export const relayUsageLogsSchema = z.object({
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  items: z.array(relayUsageLogItemSchema),
});

export type RelayUsageLogs = z.infer<typeof relayUsageLogsSchema>;

export const consumerUsageLogItemSchema = z.object({
  id: z.string(),
  createdAt: z.number().int(),
  category: z.enum(["recharge", "usage", "other"]),
  credits: z.number().nonnegative(),
});

export type ConsumerUsageLogItem = z.infer<typeof consumerUsageLogItemSchema>;

export const consumerUsageLogsSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  items: z.array(consumerUsageLogItemSchema),
});

export type ConsumerUsageLogs = z.infer<typeof consumerUsageLogsSchema>;

export const relayUsageLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.coerce.number().int().min(0).max(2).default(0),
  modelName: z.string().trim().max(128).optional(),
  tokenName: z.string().trim().max(128).optional(),
  group: z.string().trim().max(128).optional(),
  requestId: z.string().trim().max(256).optional(),
  upstreamRequestId: z.string().trim().max(256).optional(),
  startTimestamp: z.coerce.number().int().positive().optional(),
  endTimestamp: z.coerce.number().int().positive().optional(),
});

export type RelayUsageLogQuery = z.infer<typeof relayUsageLogQuerySchema>;

export const relayPaymentInfoSchema = z.object({
  wechatPayEnabled: z.boolean(),
  wechatPayMinTopUp: z.number().int().positive(),
  quotaDisplayType: z.string(),
  quotaPerUnit: z.number().positive(),
});

export type RelayPaymentInfo = z.infer<typeof relayPaymentInfoSchema>;

export const consumerPaymentInfoSchema = z.object({
  wechatPayEnabled: z.boolean(),
  minimumCredits: z.number().int().positive(),
});

export type ConsumerPaymentInfo = z.infer<typeof consumerPaymentInfoSchema>;

export const relayCreatePaymentRequestSchema = z.object({
  amount: z.coerce.number().int().positive().max(100_000),
});

export type RelayCreatePaymentRequest = z.infer<typeof relayCreatePaymentRequestSchema>;

export const relayPaymentOrderStatusSchema = z.enum(["pending", "paid", "expired", "failed"]);

export const relayPaymentOrderSchema = z.object({
  orderNo: z.string().min(1),
  tradeNo: z.string().min(1),
  amount: z.number().int().positive(),
  money: z.number().positive(),
  status: relayPaymentOrderStatusSchema,
  rawStatus: z.string().optional(),
  createdAt: z.number().int().optional(),
  completedAt: z.number().int().optional(),
  paymentMethod: z.string().optional(),
});

export type RelayPaymentOrder = z.infer<typeof relayPaymentOrderSchema>;

export const relayWechatPaymentOrderSchema = relayPaymentOrderSchema.extend({
  codeUrl: z.string().min(1),
  expiresAt: z.number().int(),
});

export type RelayWechatPaymentOrder = z.infer<typeof relayWechatPaymentOrderSchema>;

export const relaySessionSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("anonymous"),
  }),
  z.object({
    status: z.literal("authenticated"),
    user: relayUserSummarySchema,
    balance: consumerBalanceSchema,
  }),
]);

export type RelaySession = z.infer<typeof relaySessionSchema>;
