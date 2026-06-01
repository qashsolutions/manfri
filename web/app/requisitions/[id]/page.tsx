// Render at request time — real data under DATA_SOURCE=api; never prerender an API call.
export const dynamic = "force-dynamic";

import {
  ArrowLeft,
  Briefcase,
  Building2,
  CheckCircle2,
  GripVertical,
  Mail,
  MapPin,
  Pencil,
  Search,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  getJdCompleteness,
  getJdSkills,
  getRequisition,
  getTopMatches,
  type ReqStatus,
  reqStatusLabel,
} from "@/lib/data";

const REQ_STATUS_VARIANT = {
  open: "success",
  on_hold: "warning",
  filled: "secondary",
} as const satisfies Record<ReqStatus, "success" | "warning" | "secondary">;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

function fitTone(fit: number) {
  if (fit >= 85) return "text-success";
  if (fit >= 70) return "text-foreground";
  return "text-muted-foreground";
}

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = await getRequisition(id);
  if (!req) notFound();

  const [jdSkills, jdCompleteness, matches] = await Promise.all([
    getJdSkills(id),
    getJdCompleteness(id),
    getTopMatches(id),
  ]);

  const core = jdSkills.filter((s) => s.tier === "core");
  const nice = jdSkills.filter((s) => s.tier === "nice");
  const missing = jdCompleteness.items.filter((i) => !i.present);

  return (
    <AppShell active="requisitions" title="Requisition">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/requisitions"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to requisitions
        </Link>

        {/* Header */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Briefcase className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{req.title}</h2>
                <Badge variant={REQ_STATUS_VARIANT[req.status]}>{reqStatusLabel[req.status]}</Badge>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                <Building2 className="size-3.5" />
                {req.client}
                <span className="text-border">·</span>
                <MapPin className="size-3.5" />
                {req.location}
                <span className="text-border">·</span>
                {req.employmentType}
                <span className="text-border">·</span>
                {req.openings} opening{req.openings > 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link href="/outreach">
                  <Mail className="size-4" />
                  Email matches
                </Link>
              </Button>
              <Button size="sm" variant="outline">
                <Pencil className="size-4" />
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Required skills (weighted, reorderable) */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle>Required skills</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Drag to reprioritize — weighting drives how candidates are matched.
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  Re-run matches
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                {[
                  { label: "Core", items: core },
                  { label: "Nice to have", items: nice },
                ].map((group) => (
                  <div key={group.label} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </p>
                    {group.items.map((s) => (
                      <div key={s.name} className="flex items-center gap-3">
                        <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50" />
                        <span className="w-40 shrink-0 truncate text-sm font-medium">{s.name}</span>
                        <Progress
                          value={s.weight * 100}
                          indicatorClassName={group.label === "Core" ? "bg-primary" : "bg-muted-foreground/40"}
                        />
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                          {Math.round(s.weight * 100)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Top matches */}
            <Card className="overflow-hidden p-0">
              <CardHeader className="flex-row items-center justify-between p-6">
                <div>
                  <CardTitle>Top matches</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Best-fit candidates from your database, ranked
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/outreach">
                    <Mail className="size-4" />
                    Email all
                  </Link>
                </Button>
              </CardHeader>
              <table className="w-full border-collapse text-sm">
                <thead className="border-y border-border bg-muted/40">
                  <tr>
                    <th className={TH}>Candidate</th>
                    <th className={TH}>Core</th>
                    <th className={TH}>Review</th>
                    <th className={TH}>Fit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matches.map((m, i) => {
                    const c = m.candidate;
                    return (
                      <tr key={m.candidateId} className="transition-colors hover:bg-accent/40">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="w-4 text-xs tabular-nums text-muted-foreground">
                              {i + 1}
                            </span>
                            <Avatar name={c.name} className="size-8 text-xs" />
                            <div className="min-w-0">
                              <Link href="/screening" className="font-medium hover:underline">
                                {c.name}
                              </Link>
                              <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-muted-foreground">
                          {m.coreCovered}/{m.coreTotal}
                        </td>
                        <td className="px-4 py-3">
                          {m.flags > 0 ? (
                            <Badge variant="warning">
                              <TriangleAlert className="size-3" />
                              {m.flags}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-base font-semibold tabular-nums ${fitTone(m.fit)}`}>
                            {m.fit}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="border-t border-border px-6 py-3 text-xs text-muted-foreground">
                Fit is a transparent composite of evidence-backed sub-scores. Review-area flags are
                advisory and never affect fit or reject a candidate — a person decides.
              </p>
            </Card>
          </div>

          <div className="space-y-6">
            {/* JD completeness */}
            <Card>
              <CardHeader>
                <CardTitle>JD completeness</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end justify-between">
                  <span className="text-3xl font-semibold tracking-tight">
                    {jdCompleteness.score}
                    <span className="text-base text-muted-foreground">/100</span>
                  </span>
                  {missing.length > 0 && (
                    <Badge variant="warning">{missing.length} to improve</Badge>
                  )}
                </div>
                <Progress value={jdCompleteness.score} />
                <Separator />
                <ul className="space-y-2">
                  {jdCompleteness.items.map((item) => (
                    <li key={item.label} className="flex items-start gap-2 text-sm">
                      {item.present ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                      ) : (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                      )}
                      <span className={item.present ? "" : "text-muted-foreground"}>
                        {item.label}
                        {item.hint && (
                          <span className="block text-xs text-muted-foreground">{item.hint}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* JD source */}
            <Card>
              <CardHeader>
                <CardTitle>Job description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">In pipeline</span>
                  <span className="font-medium tabular-nums">{req.inPipeline}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Posted</span>
                  <span className="font-medium">{req.postedAt}</span>
                </div>
                <Separator />
                <Button variant="outline" size="sm" className="w-full">
                  <Search className="size-4" />
                  Find more matches
                </Button>
                <p className="text-xs text-muted-foreground">
                  The JD is stored as an immutable, versioned record; a match always pins the exact
                  version it scored against.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
