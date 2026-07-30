import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "./onlineStatus";

export default function ConsumerOfflineBanner() {
  const online = useOnlineStatus();
  if (online) {
    return null;
  }

  return (
    <div
      role="status"
      className="flex min-h-11 shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950"
    >
      <CloudOff className="size-4 shrink-0" aria-hidden="true" />
      当前未联网。作品仍可打开和编辑，AI 创作与充值已暂停；联网后从原位置继续。
    </div>
  );
}
