import { useLocation } from "react-router-dom";
import LLMSelector from "@/components/common/LLMSelector";
import AppVersionBadge from "@/components/layout/AppVersionBadge";
import DesktopBrandMark from "@/components/layout/DesktopBrandMark";
import LiveExecutionDialog from "@/components/liveExecution/LiveExecutionDialog";
import ProjectGithubLink from "@/components/layout/ProjectGithubLink";
import { Button } from "@/components/ui/button";
import {
  AUTO_DIRECTOR_MOBILE_CLASSES,
  shouldUseAutoDirectorMobileFullWidthContent,
} from "@/mobile/autoDirector";
import { APP_PRODUCT_MODE } from "@/lib/constants";

interface NavbarProps {
  workspaceNavMode?: "workspace" | "project";
  onWorkspaceNavModeChange?: (mode: "workspace" | "project") => void;
}

export default function Navbar(props: NavbarProps) {
  const { workspaceNavMode, onWorkspaceNavModeChange } = props;
  const location = useLocation();
  const isHome = location.pathname === "/";
  const showWorkspaceToggle = Boolean(workspaceNavMode && onWorkspaceNavModeChange);
  const useMobileAutoDirectorShell = shouldUseAutoDirectorMobileFullWidthContent(location.pathname);
  const isConsumerProduct = APP_PRODUCT_MODE === "consumer";

  return (
    <header className="warm-ink-topbar flex h-16 min-w-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl border border-primary/15 bg-primary/10">
          <DesktopBrandMark className="h-7 w-7 shrink-0 drop-shadow-none" />
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight">0xNovel</span>
            {!isConsumerProduct ? <AppVersionBadge /> : null}
            {!isConsumerProduct ? <ProjectGithubLink /> : null}
          </div>
          <span className="hidden truncate text-[11px] text-muted-foreground sm:block">AI 长篇小说创作工作台</span>
        </div>
      </div>
      {!isConsumerProduct ? (
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {!isHome && showWorkspaceToggle ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarWorkspaceToggle : undefined}
              onClick={() => onWorkspaceNavModeChange?.(workspaceNavMode === "workspace" ? "project" : "workspace")}
            >
              {workspaceNavMode === "workspace" ? "项目导航" : "创作导航"}
            </Button>
          ) : null}
          <LiveExecutionDialog />
          <div className={useMobileAutoDirectorShell ? AUTO_DIRECTOR_MOBILE_CLASSES.navbarModelSelector : undefined}>
            <LLMSelector compact showBadge={false} showHelperText={false} />
          </div>
        </div>
      ) : null}
    </header>
  );
}
