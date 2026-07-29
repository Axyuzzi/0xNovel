import { BookOpenText, Database, House, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "首页", icon: House, end: true },
  { to: "/novels", label: "作品", icon: BookOpenText, end: false },
  { to: "/materials", label: "素材", icon: Database, end: false },
  { to: "/account", label: "我的", icon: UserRound, end: false },
];

export default function ConsumerMobileNavigation() {
  return (
    <nav
      aria-label="主要导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-20px_rgba(15,23,42,0.45)] backdrop-blur"
    >
      <div className="grid h-16 grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => cn(
                "relative flex min-h-11 flex-col items-center justify-center gap-1 px-2 text-xs font-medium text-muted-foreground outline-none transition-colors",
                "focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                isActive ? "text-primary" : "hover:bg-muted/70 hover:text-foreground",
              )}
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-transparent",
                      isActive && "bg-primary",
                    )}
                  />
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
