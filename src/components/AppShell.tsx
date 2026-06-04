import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Library,
  Target,
  FolderClosed,
  Tag,
  Bot,
  Plus,
  Sun,
  Moon,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { useViewport } from "@/hooks/useViewport";
import { useAuthStore } from "@/stores/auth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Nav order encodes the platform nudge (ADR-0001): desktop leads with Library
 * (authoring), mobile leads with Study (practice). Both expose every
 * destination — layout differs, capability does not.
 */
const DESKTOP_NAV: NavItem[] = [
  { to: "/", label: "Library", icon: Library },
  { to: "/study", label: "Study", icon: Target },
  { to: "/decks", label: "Decks", icon: FolderClosed },
  { to: "/tags", label: "Tags", icon: Tag },
  { to: "/agent", label: "Assistant", icon: Bot },
  { to: "/topic/new", label: "Add", icon: Plus },
];

const MOBILE_NAV: NavItem[] = [
  { to: "/study", label: "Study", icon: Target },
  { to: "/", label: "Library", icon: Library },
  { to: "/topic/new", label: "Add", icon: Plus },
  { to: "/agent", label: "Assistant", icon: Bot },
  { to: "/decks", label: "Decks", icon: FolderClosed },
  { to: "/tags", label: "Tags", icon: Tag },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { isMobile } = useViewport();
  const logout = useAuthStore((s) => s.logout);
  const email = useAuthStore((s) => s.email);
  const { theme, toggle } = useTheme();
  const items = isMobile ? MOBILE_NAV : DESKTOP_NAV;

  return (
    <div className={cn("flex h-full", isMobile ? "flex-col" : "flex-row")}>
      <nav
        className={cn(
          "flex bg-card border-border",
          isMobile
            ? "order-2 border-t justify-around p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
            : "flex-col w-52 border-r p-3 gap-1",
        )}
      >
        {!isMobile && (
          <div className="px-3 pb-4 pt-2 text-lg font-bold text-primary">
            Factoria
          </div>
        )}
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
                isMobile ? "flex-col gap-0.5 px-2 py-1.5 text-[11px]" : "gap-3 px-3 py-2",
              )}
              activeProps={{
                className: cn(
                  "flex items-center rounded-md text-sm bg-accent text-accent-foreground",
                  isMobile ? "flex-col gap-0.5 px-2 py-1.5 text-[11px]" : "gap-3 px-3 py-2",
                ),
              }}
              activeOptions={{ exact: item.to === "/" }}
            >
              <Icon className={isMobile ? "size-5" : "size-4"} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        {!isMobile && (
          <>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" onClick={toggle} className="justify-start gap-3">
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <div className="truncate px-3 text-xs text-muted-foreground" title={email ?? ""}>
              {email}
            </div>
            <Button variant="ghost" size="sm" onClick={logout} className="justify-start gap-3">
              <LogOut className="size-4" /> Log out
            </Button>
          </>
        )}
      </nav>
      <main
        className={cn(
          "flex-1 overflow-y-auto",
          isMobile
            ? "order-1 p-4 pt-[max(1rem,env(safe-area-inset-top))]"
            : "p-6",
        )}
      >
        {children}
      </main>
    </div>
  );
}
