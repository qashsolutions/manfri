import { CreditCard, Send, ShieldCheck, UserPlus, Users } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  type MemberStatus,
  plan,
  type TeamRole,
  teamMembers,
} from "@/lib/sample-data";
import { cn } from "@/lib/utils";

const ROLE_VARIANT = {
  Admin: "default",
  Recruiter: "secondary",
  Viewer: "outline",
} as const satisfies Record<TeamRole, "default" | "secondary" | "outline">;

const MEMBER_STATUS_VARIANT = {
  active: "success",
  invited: "warning",
} as const satisfies Record<MemberStatus, "success" | "warning">;

const SECTIONS = [
  { href: "#plan", label: "Plan & billing", icon: CreditCard },
  { href: "#team", label: "Team", icon: Users },
  { href: "#compliance", label: "Compliance & data", icon: ShieldCheck },
];

const COMPLIANCE = [
  { label: "Require candidate consent before outreach", detail: "Only opted-in candidates are emailable", on: true },
  { label: "Append CAN-SPAM footer to every send", detail: "Unsubscribe link + verified sender identity", on: true },
  { label: "Immutable audit log", detail: "Append-only, hash-chained decision record", on: true },
  { label: "Demographic data collection", detail: "Voluntary self-ID, segregated from scoring", on: false },
];

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

function Switch({ on }: { on: boolean }) {
  return (
    <div
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        on ? "bg-primary" : "bg-muted",
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-all",
          on ? "left-[1.125rem]" : "left-0.5",
        )}
      />
    </div>
  );
}

export default function SettingsPage() {
  const seatPct = Math.round((plan.seatsUsed / plan.seatsTotal) * 100);

  return (
    <AppShell active="settings" title="Settings">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[180px_1fr]">
        {/* Sub-nav */}
        <nav className="hidden lg:block">
          <div className="sticky top-0 space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.href}
                  href={s.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Icon className="size-4" />
                  {s.label}
                </a>
              );
            })}
          </div>
        </nav>

        <div className="space-y-6">
          {/* Plan & billing */}
          <Card id="plan" className="scroll-mt-6">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Plan &amp; billing</CardTitle>
                <CardDescription>Current subscription and seats</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                <CreditCard className="size-4" />
                Manage billing
              </Button>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="font-semibold">{plan.name} plan</p>
                  <p className="text-sm text-muted-foreground">
                    Résumé database, matching &amp; compliant outreach
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-semibold tracking-tight">{plan.price}</p>
                  <p className="text-xs text-muted-foreground">{plan.unit}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Seats</span>
                  <span className="tabular-nums font-medium">
                    {plan.seatsUsed} / {plan.seatsTotal} used
                  </span>
                </div>
                <Progress value={seatPct} />
                <p className="text-xs text-muted-foreground">Renews {plan.renews}</p>
              </div>
            </CardContent>
          </Card>

          {/* Team */}
          <Card id="team" className="scroll-mt-6 overflow-hidden p-0">
            <CardHeader className="flex-row items-center justify-between p-6">
              <div>
                <CardTitle>Team</CardTitle>
                <CardDescription>People with access to this workspace</CardDescription>
              </div>
              <Button size="sm">
                <UserPlus className="size-4" />
                Invite
              </Button>
            </CardHeader>
            <table className="w-full border-collapse text-sm">
              <thead className="border-y border-border bg-muted/40">
                <tr>
                  <th className={TH}>Member</th>
                  <th className={TH}>Role</th>
                  <th className={TH}>2FA</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {teamMembers.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ROLE_VARIANT[m.role]}>{m.role}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {m.twoFactor ? (
                        <Badge variant="success">On</Badge>
                      ) : (
                        <Badge variant="outline">Off</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={MEMBER_STATUS_VARIANT[m.status]}>
                        {m.status === "active" ? "Active" : "Invited"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Compliance */}
          <Card id="compliance" className="scroll-mt-6">
            <CardHeader>
              <CardTitle>Compliance &amp; data</CardTitle>
              <CardDescription>Controls that ship on by default</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {COMPLIANCE.map((c) => (
                <div
                  key={c.label}
                  className="flex items-center justify-between gap-4 rounded-lg px-2 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                  <Switch on={c.on} />
                </div>
              ))}
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm">
                  <Send className="size-4" />
                  Export audit log
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
