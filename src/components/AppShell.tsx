import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, ListChecks, Settings } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const navItems = [
  {
    to: "/app",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    to: "/app/tests",
    label: "Tests",
    icon: ListChecks,
  },
  {
    to: "/app/profile",
    label: "Preferences",
    icon: Settings,
  },
];

export const AppShell = ({ children }: { children: ReactNode }) => {
  const { currentUser, logout, state, syncExternalAccount } = useAppStore();
  const account = state.externalAccounts.find(
    (item) => item.userId === currentUser?.id
  );
  const isSyncing = account?.syncStatus === "syncing";
  const syncTotal = account?.syncTotal ?? 0;
  const syncCompleted = account?.syncCompleted ?? 0;
  const needsConnect = !account;
  const syncLabel = needsConnect
    ? "Connect account"
    : isSyncing
    ? `Syncing ${syncCompleted}/${syncTotal || "?"}`
    : "Sync latest";
  const syncTitle = needsConnect
    ? "Connect an external account"
    : isSyncing
    ? "Sync in progress"
    : "Sync latest tests";

  return (
    <div className="app-canvas">
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl shadow-sm supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <nav className="flex flex-wrap items-center gap-2 text-sm">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/app"}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition",
                      isActive
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="lg:hidden">
                  Navigate
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {navItems.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link to={item.to}>{item.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {account ? (
              <Badge variant="secondary">
                {account.provider} - {account.status}
              </Badge>
            ) : (
              <Badge variant="outline">Connect your test account</Badge>
            )}
            {needsConnect ? (
              <Button size="sm" asChild variant="secondary" title={syncTitle}>
                <Link to="/app/profile?connect=1">{syncLabel}</Link>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={syncExternalAccount}
                disabled={isSyncing}
                title={syncTitle}
              >
                {syncLabel}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  {currentUser?.name ?? "Account"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/app/profile">Preferences</Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="min-w-0 px-2 py-2">{children}</main>
    </div>
  );
};
