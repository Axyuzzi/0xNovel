import {
  consumerBalanceSchema,
  consumerUsageLogsSchema,
  relayBalanceSchema,
  relayUsageLogsSchema,
  type ConsumerBalance,
  type ConsumerUsageLogs,
  type RelayBalance,
  type RelayUsageLogQuery,
  type RelayUsageLogs,
} from "@0xnovelagent/shared/types/relay";
import {
  RelayHttpClient,
  RelayHttpError,
  readRelayEnvelopeData,
} from "../client/RelayHttpClient";
import { resolveRelayEndpointPaths } from "../config/relayConfig";

function parseCreditValue(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new RelayHttpError(`创作服务返回的${label}无效。`);
  }
  return parsed;
}

export class RelayUsageService {
  constructor(private readonly client = new RelayHttpClient()) {}

  private async getRelayBalance(token: string): Promise<RelayBalance> {
    const response = await this.client.request({
      path: resolveRelayEndpointPaths().balance,
      bearerToken: token,
    });
    return relayBalanceSchema.parse(readRelayEnvelopeData(response.body));
  }

  async getBalance(token: string): Promise<ConsumerBalance> {
    const balance = await this.getRelayBalance(token);
    return consumerBalanceSchema.parse({
      userId: String(balance.userId),
      username: balance.username,
      availableCredits: parseCreditValue(balance.balance, "可用积分"),
      usedCredits: parseCreditValue(balance.usedBalance, "累计消费"),
    });
  }

  private async getRelayLogs(token: string, input: RelayUsageLogQuery): Promise<RelayUsageLogs> {
    const query = new URLSearchParams({
      p: String(input.page),
      page_size: String(input.pageSize),
      type: String(input.type),
    });
    if (input.modelName) query.set("model_name", input.modelName);
    if (input.tokenName) query.set("token_name", input.tokenName);
    if (input.group) query.set("group", input.group);
    if (input.requestId) query.set("request_id", input.requestId);
    if (input.upstreamRequestId) query.set("upstream_request_id", input.upstreamRequestId);
    if (input.startTimestamp) query.set("start_timestamp", String(input.startTimestamp));
    if (input.endTimestamp) query.set("end_timestamp", String(input.endTimestamp));

    const response = await this.client.request({
      path: resolveRelayEndpointPaths().usageLogs,
      bearerToken: token,
      query,
    });
    return relayUsageLogsSchema.parse(readRelayEnvelopeData(response.body));
  }

  async getLogs(token: string, input: RelayUsageLogQuery): Promise<ConsumerUsageLogs> {
    const [logs, balance] = await Promise.all([
      this.getRelayLogs(token, input),
      this.getRelayBalance(token),
    ]);
    return consumerUsageLogsSchema.parse({
      page: logs.page,
      pageSize: logs.page_size,
      total: logs.total,
      items: logs.items.map((item) => ({
        id: String(item.id),
        createdAt: item.created_at,
        category: item.type === 1 ? "recharge" : item.type === 2 ? "usage" : "other",
        credits: Math.abs(item.quota) / balance.quotaPerUnit,
      })),
    });
  }
}

export const relayUsageService = new RelayUsageService();
