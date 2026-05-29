import { Briefcase, LayoutDashboard, Mail, Plus, Search, Settings, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { plan } from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const NAV = [
  { key: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { key: "candidates", label: "Candidates", href: "/candidates", icon: Users },
  { key: "outreach", label: "Outreach", href: "/outreach", icon: Mail },
  { key: "requisitions", label: "Requisitions", href: "/requisitions", icon: Briefcase },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings },
];

export function AppShell({
  active,
  title,
  children,
}: {
  active: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
        <Link href="/" className="flex h-16 items-center gap-2.5 border-b border-border px-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
            M
          </div>
          <span className="font-semibold tracking-tight">ManFriday</span>
        </Link>

        <nav className="flex-1 space-y-1 p-3">
          <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          {NAV.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}

          <p className="px-3 pb-1 pt-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Premium
          </p>
          <Link
            href="/screening"
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active === "screening"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground/70 hover:bg-accent hover:text-foreground",
            )}
          >
            <Sparkles className="size-4" />
            AI Screening
            <Badge variant="outline" className="ml-auto">
              Upgrade
            </Badge>
          </Link>
        </nav>

        <div className="border-t border-border p-3">
          <Link href="/settings" className="block rounded-lg bg-accent/50 p-3 transition-colors hover:bg-accent">
            <p className="text-xs font-medium">{plan.name} plan</p>
            <p className="text-xs text-muted-foreground">
              Resume DB + outreach · {plan.price}
              {plan.unit}
            </p>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-4 border-b border-border bg-card/40 px-6">
          <h1 className="text-base font-semibold">{title}</h1>
          <div className="relative ml-auto hidden md:block">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              placeholder="Search candidates…"
              className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button size="sm" asChild>
            <Link href="/candidates/import">
              <Plus className="size-4" />
              Add candidate
            </Link>
          </Button>
          <Avatar name="Riya Sharma" className="bg-gradient-to-br from-indigo-500 to-violet-500 text-white" />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
