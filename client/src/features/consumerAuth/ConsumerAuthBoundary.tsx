import type { ReactNode } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_PRODUCT_MODE } from "@/lib/constants";
import ConsumerAuthPage from "./ConsumerAuthPage";
import { useConsumerSession } from "./ConsumerSessionContext";

export default function ConsumerAuthBoundary({ children }: { children: ReactNode }) {
  const { session, refresh } = useConsumerSession();
  if (APP_PRODUCT_MODE !== "consumer") {
    return <>{children}</>;
  }
  if (session.status === "authenticated") {
    return <>{children}</>;
  }
  if (session.status === "anonymous") {
    return <ConsumerAuthPage />;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 text-slate-950">
      <section className="w-full max-w-md text-center" aria-live="polite">
        {session.status === "checking" ? (
          <>
            <LoaderCircle className="mx-auto size-6 animate-spin text-slate-700 motion-reduce:animate-none" />
            <h1 className="mt-5 text-xl font-semibold">正在打开你的创作空间</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">正在确认登录状态和本机作品。</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">暂时无法确认登录状态</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{session.message}</p>
            <Button className="mt-6" onClick={() => void refresh()}>
              <RefreshCw className="size-4" />
              重新连接
            </Button>
          </>
        )}
      </section>
    </main>
  );
}
