import {
  consumerPaymentInfoSchema,
  relayPaymentInfoSchema,
  relayPaymentOrderSchema,
  relayWechatPaymentOrderSchema,
  type ConsumerPaymentInfo,
  type RelayPaymentOrder,
  type RelayWechatPaymentOrder,
} from "@0xnovelagent/shared/types/relay";
import {
  RelayHttpClient,
  RelayHttpError,
  readRelayEnvelopeData,
} from "../client/RelayHttpClient";
import { resolveRelayEndpointPaths } from "../config/relayConfig";

function normalizeWechatOrder(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return data;
  }
  const record = data as Record<string, unknown>;
  return {
    ...record,
    codeUrl: record.codeUrl ?? record.code_url,
  };
}

function assertOneToOneOrder(
  order: RelayPaymentOrder | RelayWechatPaymentOrder,
  expectedAmount?: number,
): void {
  if (Math.abs(order.money - order.amount) > 0.000001) {
    throw new RelayHttpError("充值订单的支付金额与到账积分不一致，请勿付款并联系服务支持。", 502);
  }
  if (expectedAmount !== undefined && order.amount !== expectedAmount) {
    throw new RelayHttpError("充值订单金额与提交金额不一致，请勿付款并联系服务支持。", 502);
  }
}

export class RelayPaymentService {
  constructor(private readonly client = new RelayHttpClient()) {}

  async getInfo(token: string): Promise<ConsumerPaymentInfo> {
    const response = await this.client.request({
      path: resolveRelayEndpointPaths().paymentInfo,
      bearerToken: token,
    });
    const info = relayPaymentInfoSchema.parse(readRelayEnvelopeData(response.body));
    return consumerPaymentInfoSchema.parse({
      wechatPayEnabled: info.wechatPayEnabled,
      minimumCredits: info.wechatPayMinTopUp,
    });
  }

  async createWechatOrder(token: string, amount: number): Promise<RelayWechatPaymentOrder> {
    const response = await this.client.request({
      path: resolveRelayEndpointPaths().wechatNativePayment,
      method: "POST",
      bearerToken: token,
      body: { amount },
    });
    const order = relayWechatPaymentOrderSchema.parse(
      normalizeWechatOrder(readRelayEnvelopeData(response.body)),
    );
    assertOneToOneOrder(order, amount);
    return order;
  }

  async getOrder(token: string, orderNo: string): Promise<RelayPaymentOrder> {
    const response = await this.client.request({
      path: resolveRelayEndpointPaths().paymentOrder(orderNo),
      bearerToken: token,
    });
    const order = relayPaymentOrderSchema.parse(readRelayEnvelopeData(response.body));
    assertOneToOneOrder(order);
    return order;
  }
}

export const relayPaymentService = new RelayPaymentService();
