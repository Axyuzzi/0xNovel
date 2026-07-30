import { Button } from "@/components/ui/button";

interface ConsumerWorkspaceErrorBannerProps {
  message: string;
  saveFailed: boolean;
  onRetrySave: () => void;
}

export default function ConsumerWorkspaceErrorBanner({
  message,
  saveFailed,
  onRetrySave,
}: ConsumerWorkspaceErrorBannerProps) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-center justify-between gap-4 bg-red-50 px-6 py-3 text-sm text-red-800">
      <span>{message}</span>
      {saveFailed ? (
        <Button variant="outline" size="sm" onClick={onRetrySave}>
          重试保存
        </Button>
      ) : null}
    </div>
  );
}
