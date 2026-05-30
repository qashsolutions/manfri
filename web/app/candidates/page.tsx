// Render at request time — real data under DATA_SOURCE=api; never prerender an API call.
export const dynamic = "force-dynamic";

import { Filter, Plus, Search, Upload } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { type CandidateStatus, getStats, listCandidates, statusLabel } from "@/lib/data";

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

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

export default async function CandidatesPage() {
  const [candidates, stats] = await Promise.all([listCandidates(), getStats()]);

  return (
    <AppShell active="candidates" title="Candidates">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search by name, skill, or title…" />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="size-4" />
            Filters
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/candidates/import">
              <Upload className="size-4" />
              Import résumés
            </Link>
          </Button>
          <Button size="sm">
            <Plus className="size-4" />
            Add candidate
          </Button>
        </div>

        <Card className="overflow-hidden p-0">
          <table className="w-full border-collapse text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr>
                <th className={TH}>Candidate</th>
                <th className={TH}>Skills</th>
                <th className={TH}>Status</th>
                <th className={TH}>Résumés</th>
                <th className={TH}>Consent</th>
                <th className={TH}>Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {candidates.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                        {initials(c.name)}
                      </div>
                      <div>
                        <Link href={`/candidates/${c.id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {c.title} · {c.location}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.skills.map((s) => (
                        <Badge key={s} variant="outline">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[c.status]}>{statusLabel[c.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.resumeVersions}</td>
                  <td className="px-4 py-3">
                    {c.consent ? (
                      <Badge variant="success">Opted in</Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.lastActivity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <p className="text-xs text-muted-foreground">
          Showing {candidates.length} of {stats.candidates.toLocaleString()} candidates · résumés
          stored encrypted (per-tenant key), access RLS-scoped and audited.
        </p>
      </div>
    </AppShell>
  );
}
