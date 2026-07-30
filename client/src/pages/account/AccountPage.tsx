import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  LogOut,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";
import {
  createConsumerWechatOrder,
  getConsumerPaymentInfo,
  getConsumerPaymentOrder,
  getConsumerUsageLogs,
} from "@/api/consumer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConsumerSession } from "@/features/consumerAuth/ConsumerSessionContext";
import type {
  ConsumerPaymentInfo,
  ConsumerUsageLogs,
  RelaySession,
  RelayWechatPaymentOrder,
} from "@0xnovelagent/shared/types/relay";
import { relayWechatPaymentOrderSchema } from "@0xnovelagent/shared/types/relay";
import { LocalDataSection } from "./LocalDataSection";
import { useOnlineStatus } from "@/features/network/onlineStatus";
import DesktopUpdateCard from "@/components/layout/DesktopUpdateCard";

function formatCredits(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

const PAYMENT_POLL_INTERVAL_MS = 10_000;
const PAYMENT_RETRY_INTERVAL_MS = 30_000;

function isPaymentOrderExpired(order: RelayWechatPaymentOrder): boolean {
  return order.expiresAt <= Math.floor(Date.now() / 1_000);
}

function readStoredOrder(storageKey: string): RelayWechatPaymentOrder | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? relayWechatPaymentOrderSchema.parse(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

type AuthenticatedSession = Extract<RelaySession, { status: "authenticated" }>;

function AuthenticatedAccountPage(props: {
  session: AuthenticatedSession;
  logout: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}) {
  const { session, logout, refreshBalance } = props;
  const online = useOnlineStatus();
  const { user, balance } = session;
  const orderStorageKey = `0xnovel.consumer.payment.${user.id}`;
  const [paymentInfo, setPaymentInfo] = useState<ConsumerPaymentInfo | null>(null);
  const [logs, setLogs] = useState<ConsumerUsageLogs | null>(null);
  const [amount, setAmount] = useState("10");
  const [activeOrder, setActiveOrder] = useState<RelayWechatPaymentOrder | null>(() => (
    readStoredOrder(orderStorageKey)
  ));
  const [paymentState, setPaymentState] = useState<"idle" | "pending" | "paid" | "expired" | "failed">(
    activeOrder?.status ?? "idle",
  );
  const [loading, setLoading] = useState(true);
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [error, setError] = useState("");

  const minimumCredits = paymentInfo?.minimumCredits ?? 1;
  const parsedAmount = Number(amount);
  const amountValid = Number.isInteger(parsedAmount) && parsedAmount >= minimumCredits;

  const loadAccountData = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextInfo, nextLogs] = await Promise.all([
        getConsumerPaymentInfo(),
        getConsumerUsageLogs({ page: 1, pageSize: 12, type: 0 }),
      ]);
      setPaymentInfo(nextInfo);
      setLogs(nextLogs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "账户信息暂时无法加载。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (online) {
      void loadAccountData();
    } else {
      setLoading(false);
    }
  }, [online]);

  useEffect(() => {
    if (!online || !activeOrder || paymentState !== "pending") {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    const expireOrder = () => {
      setPaymentState("expired");
      window.localStorage.removeItem(orderStorageKey);
    };
    const schedulePoll = (delayMs: number) => {
      if (!cancelled) {
        timeoutId = window.setTimeout(() => void poll(), delayMs);
      }
    };
    const poll = async () => {
      if (isPaymentOrderExpired(activeOrder)) {
        expireOrder();
        return;
      }
      try {
        const result = await getConsumerPaymentOrder(activeOrder.orderNo);
        if (cancelled) return;
        setPaymentState(result.status);
        if (result.status === "paid") {
          window.localStorage.removeItem(orderStorageKey);
          await Promise.all([refreshBalance(), loadAccountData()]);
        } else if (result.status === "expired" || result.status === "failed") {
          window.localStorage.removeItem(orderStorageKey);
        } else {
          schedulePoll(PAYMENT_POLL_INTERVAL_MS);
        }
      } catch {
        // Keep the payable order visible and retry slowly after a short outage or rate limit.
        schedulePoll(PAYMENT_RETRY_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeOrder, online, orderStorageKey, paymentState, refreshBalance]);

  const createOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!amountValid) {
      setError(`请输入不低于 ${minimumCredits} 的整数金额。`);
      return;
    }
    setCreatingOrder(true);
    setError("");
    try {
      const order = await createConsumerWechatOrder(parsedAmount);
      setActiveOrder(order);
      setPaymentState("pending");
      window.localStorage.setItem(orderStorageKey, JSON.stringify(order));
    } catch (orderError) {
      setError(orderError instanceof Error ? orderError.message : "暂时无法创建充值订单。");
    } finally {
      setCreatingOrder(false);
    }
  };

  const recentItems = useMemo(() => logs?.items ?? [], [logs]);

  return (
    <div className="mx-auto w-full max-w-5xl pb-12">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-8">
        <div>
          <p className="text-sm font-medium text-slate-600">我的账户</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950">
            {user.displayName}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            作品保存在本机，积分用于需要 AI 的创作操作。
          </p>
        </div>
        <Button variant="outline" onClick={() => void logout()}>
          <LogOut className="size-4" />
          换账号
        </Button>
      </header>

      <section className="flex flex-wrap items-end justify-between gap-6 border-b border-slate-200 py-8">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <WalletCards className="size-4" aria-hidden="true" />
            可用积分
          </div>
          <p className="mt-3 text-4xl font-semibold tracking-[-0.03em] text-slate-950">
            {formatCredits(balance.availableCredits)}
            <span className="ml-2 text-base font-medium tracking-normal text-slate-600">0x积分</span>
          </p>
        </div>
        <div className="text-sm text-slate-600">
          累计用于创作：{formatCredits(balance.usedCredits)} 0x积分
        </div>
      </section>

      {error ? (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(300px,0.85fr)_minmax(380px,1.15fr)]">
        <section aria-labelledby="recharge-heading">
          <h2 id="recharge-heading" className="text-lg font-semibold text-slate-950">充值积分</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            支付 1 元到账 1 0x积分。充值完成后会自动更新余额。
          </p>

          {!paymentInfo?.wechatPayEnabled && !loading ? (
            <p className="mt-6 rounded-lg bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              微信充值暂不可用，你仍然可以查看和编辑本地作品。
            </p>
          ) : null}

          {paymentState === "pending" && activeOrder ? (
            <div className="mt-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900">
                <Clock3 className="size-3.5" />
                等待支付
              </div>
              <div className="mt-4 inline-block rounded-xl bg-white p-4 shadow-[0_2px_8px_rgb(15_23_42/0.12)]">
                <QRCodeSVG
                  value={activeOrder.codeUrl}
                  size={196}
                  marginSize={1}
                  title={`微信充值 ${activeOrder.amount} 元`}
                />
              </div>
              <p className="mt-4 text-sm font-medium text-slate-900">
                微信扫码支付 {activeOrder.amount} 元
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                支付页面可以关闭；下次打开“我的”仍会继续查询此订单。
              </p>
            </div>
          ) : paymentState === "paid" ? (
            <div className="mt-6 rounded-lg bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-4" />
                充值已到账
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-emerald-300 bg-white"
                onClick={() => {
                  setActiveOrder(null);
                  setPaymentState("idle");
                }}
              >
                继续充值
              </Button>
            </div>
          ) : (
            <form className="mt-6 space-y-4" onSubmit={(event) => void createOrder(event)}>
              <div className="space-y-2">
                <label htmlFor="recharge-amount" className="text-sm font-medium text-slate-800">
                  充值金额
                </label>
                <div className="relative">
                  <Input
                    id="recharge-amount"
                    inputMode="numeric"
                    value={amount}
                    className="h-11 border-slate-300 bg-white pr-12"
                    onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
                  />
                  <span className="absolute right-3 top-2.5 text-sm text-slate-600">元</span>
                </div>
                <p className="text-xs text-slate-600">最低充值 {minimumCredits} 元，只支持整数金额。</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[10, 30, 50, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-slate-500 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                    onClick={() => setAmount(String(preset))}
                  >
                    {preset} 元
                  </button>
                ))}
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={!online || !paymentInfo?.wechatPayEnabled || creatingOrder || !amountValid}
              >
                {creatingOrder ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : null}
                {creatingOrder ? "正在创建订单" : `微信支付 ${amount || "0"} 元`}
              </Button>
            </form>
          )}
        </section>

        <section aria-labelledby="activity-heading">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="activity-heading" className="text-lg font-semibold text-slate-950">最近记录</h2>
              <p className="mt-2 text-sm text-slate-600">充值和创作消费会显示在这里。</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label="刷新账户记录"
              disabled={!online}
              onClick={() => void Promise.all([refreshBalance(), loadAccountData()])}
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </div>

          <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
            {loading ? (
              <div className="flex items-center gap-3 py-5 text-sm text-slate-600">
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                正在读取记录
              </div>
            ) : recentItems.length === 0 ? (
              <div className="py-8 text-sm text-slate-600">
                还没有充值或创作消费记录。
              </div>
            ) : recentItems.map((item) => {
              const isRecharge = item.category === "recharge";
              return (
                <div key={item.id} className="flex items-center gap-4 py-4">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-full ${
                    isRecharge ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
                  }`}>
                    {isRecharge
                      ? <ArrowDownLeft className="size-4" />
                      : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {isRecharge ? "充值到账" : item.category === "usage" ? "创作消费" : "积分变动"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{formatTimestamp(item.createdAt)}</p>
                  </div>
                  <p className={`text-sm font-semibold ${isRecharge ? "text-emerald-800" : "text-slate-900"}`}>
                    {isRecharge ? "+" : "-"}{formatCredits(item.credits)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <div className="mt-10">
        <DesktopUpdateCard />
      </div>
      <LocalDataSection />
      <p className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-600">
        查看
        <Link className="mx-1 font-medium text-slate-950 underline underline-offset-4" to="/privacy">
          隐私与本地数据说明
        </Link>
        ，了解作品、账号、充值和诊断日志分别保存在哪里。
      </p>
    </div>
  );
}

export default function AccountPage() {
  const { session, logout, refreshBalance } = useConsumerSession();
  if (session.status !== "authenticated") {
    return null;
  }
  return (
    <AuthenticatedAccountPage
      session={session}
      logout={logout}
      refreshBalance={refreshBalance}
    />
  );
}
