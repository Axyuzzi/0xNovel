import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  RelayLoginRequest,
  RelayRegisterRequest,
  RelaySession,
} from "@0xnovelagent/shared/types/relay";
import {
  getConsumerBalance,
  getConsumerSession,
  loginConsumerAccount,
  logoutConsumerAccount,
  registerConsumerAccount,
} from "@/api/consumer";
import { APP_PRODUCT_MODE, APP_RUNTIME } from "@/lib/constants";
import {
  clearDesktopAuthenticatedSession,
  persistDesktopAuthenticatedSession,
  switchDesktopAccount,
} from "@/lib/desktop";
import { runPrepareLogoutHandlers } from "@/lib/prepareLogout";

type ConsumerSessionState =
  | { status: "checking" }
  | { status: "error"; message: string }
  | RelaySession;

interface ConsumerSessionContextValue {
  session: ConsumerSessionState;
  login: (input: RelayLoginRequest, keepSignedIn: boolean) => Promise<boolean>;
  register: (input: RelayRegisterRequest, keepSignedIn: boolean) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const ConsumerSessionContext = createContext<ConsumerSessionContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "暂时无法确认登录状态，请稍后重试。";
}

export function ConsumerSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ConsumerSessionState>(
    APP_PRODUCT_MODE === "consumer" ? { status: "checking" } : { status: "anonymous" },
  );

  const refresh = useCallback(async () => {
    if (APP_PRODUCT_MODE !== "consumer") {
      setSession({ status: "anonymous" });
      return;
    }
    setSession({ status: "checking" });
    try {
      setSession(await getConsumerSession());
    } catch (error) {
      setSession({ status: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const finalizeAuthentication = useCallback(async (
    nextSession: RelaySession,
    keepSignedIn: boolean,
  ): Promise<boolean> => {
    try {
      const persisted = await persistDesktopAuthenticatedSession(keepSignedIn);
      if (!persisted) {
        throw new Error("当前系统无法安全保存登录状态。");
      }
      setSession(nextSession);
      return keepSignedIn;
    } catch (error) {
      await logoutConsumerAccount().catch(() => undefined);
      throw error;
    }
  }, []);

  const login = useCallback(async (input: RelayLoginRequest, keepSignedIn: boolean) => {
    const nextSession = await loginConsumerAccount(input);
    return finalizeAuthentication(nextSession, keepSignedIn);
  }, [finalizeAuthentication]);

  const register = useCallback(async (input: RelayRegisterRequest, keepSignedIn: boolean) => {
    const nextSession = await registerConsumerAccount(input);
    return finalizeAuthentication(nextSession, keepSignedIn);
  }, [finalizeAuthentication]);

  const logout = useCallback(async () => {
    // 桌面版换账号：先保存正在编辑的正文，再走「排空在途操作→停服务→清凭证→重启」。
    // app 会被重启到登录页，所以这里不需要再 setSession（新进程会重新初始化会话）。
    // 非 desktop 环境没有 switchAccount，退回到「清 token + 翻状态」的旧行为。
    if (APP_RUNTIME === "desktop") {
      await runPrepareLogoutHandlers();
      try {
        await switchDesktopAccount();
        return;
      } catch {
        // switchDesktopAccount 失败时降级到普通登出，避免用户卡死。
      }
    }
    await logoutConsumerAccount();
    await clearDesktopAuthenticatedSession();
    setSession({ status: "anonymous" });
  }, []);

  const refreshBalance = useCallback(async () => {
    const balance = await getConsumerBalance();
    setSession((current) => current.status === "authenticated"
      ? { ...current, balance }
      : current);
  }, []);

  const value = useMemo<ConsumerSessionContextValue>(() => ({
    session,
    login,
    register,
    logout,
    refresh,
    refreshBalance,
  }), [session, login, register, logout, refresh, refreshBalance]);

  return (
    <ConsumerSessionContext.Provider value={value}>
      {children}
    </ConsumerSessionContext.Provider>
  );
}

export function useConsumerSession(): ConsumerSessionContextValue {
  const context = useContext(ConsumerSessionContext);
  if (!context) {
    throw new Error("ConsumerSessionProvider is missing.");
  }
  return context;
}
