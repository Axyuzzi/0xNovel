import { GitFork } from "lucide-react";
import { cn } from "@/lib/utils";

const PROJECT_REPOSITORY_URL = "https://gitee.com/b497021499/0xnovel";
const PROJECT_REPOSITORY_LABEL = "0xNovelAgent";

interface ProjectGithubLinkProps {
  className?: string;
}

export default function ProjectGithubLink({ className }: ProjectGithubLinkProps) {
  return (
    <a
      href={PROJECT_REPOSITORY_URL}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-md px-1 text-[11px] leading-none text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      title="打开 Gitee 仓库"
      aria-label="打开 Gitee 仓库"
    >
      <GitFork className="h-3.5 w-3.5" />
      <span className="hidden whitespace-nowrap sm:inline">{PROJECT_REPOSITORY_LABEL}</span>
    </a>
  );
}
