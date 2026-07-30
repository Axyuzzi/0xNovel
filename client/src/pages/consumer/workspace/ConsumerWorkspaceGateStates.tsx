import { LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function ConsumerWorkspaceLoadingState() {
  return (
    <div className="grid h-full place-items-center text-sm text-slate-600" role="status">
      <span className="flex items-center gap-3">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        正在打开作品
      </span>
    </div>
  );
}

export function ConsumerWorkspaceErrorState({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center">
      <div>
        <p role="alert" className="text-sm text-red-800">{message}</p>
        <Button asChild variant="outline" className="mt-5">
          <Link to="/novels">返回我的作品</Link>
        </Button>
      </div>
    </div>
  );
}
