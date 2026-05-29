import { ArrowUpRight, Briefcase, Mail, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type CandidateStatus,
  getStats,
  listCandidates,
  listRequisitions,
  statusLabel,
} from "@/lib/data";

const STATUS_VARIANT = {
  new: "secondary",
  contacted: "default",
  screening: "warning",
  submitted: "success",
} as const satisfies Record<CandidateStatus, "secondary" | "default" | "warning" | "success">;

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("");
}

export default async function DashboardPage() {
  const [stats, candidates, requisitions] = await Promise.all([
    getStats(),
    listCandidates(),
    listRequisitions(),
  ]);

  const STAT_CARDS = [
    { label: "Candidates", value: stats.candidates.toLocaleString(), delta: "+128 this month", icon: Users },
    { label: "Active requisitions", value: String(stats.activeReqs), delta: "3 closing soon", icon: Briefcase },
    { label: "Emails sent (30d)", value: stats.emailsSent30d.toLocaleString(), delta: "+18% vs prev", icon: Mail },
    { label: "Response rate", value: stats.responseRate, delta: "+4 pts", icon: TrendingUp },
  ];

  return (
    <AppShell active="dashboard" title="Dashboard">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STAT_CARDS.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{s.label}</span>
                    <Icon className="size-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.delta}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Recent candidates</CardTitle>
                <CardDescription>Latest activity across your database</CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/candidates">
                  View all
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {candidates.slice(0, 5).map((c) => (
                <Link
                  key={c.id}
                  href={`/candidates/${c.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-9 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-foreground">
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.title} · {c.location}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[c.status]}>{statusLabel[c.status]}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Open requisitions</CardTitle>
              <CardDescription>Pipeline by role</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {requisitions.slice(0, 4).map((r) => (
                <div key={r.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.title}</span>
                    <span className="tabular-nums text-muted-foreground">{r.inPipeline} in pipeline</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {r.client} · {r.openings} opening{r.openings > 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/40">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <p className="font-semibold">3 requisitions have new matches ready</p>
              <p className="text-sm text-muted-foreground">
                Upload a job description and ManFriday ranks the best-fit candidates from your
                database — every match evidence-backed and human-decided.
              </p>
            </div>
            <Button asChild>
              <Link href="/requisitions">
                Review matches
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
