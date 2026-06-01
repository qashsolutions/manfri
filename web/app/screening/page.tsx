// Render at request time — real data under DATA_SOURCE=api; never prerender an API call.
export const dynamic = "force-dynamic";

import { ArrowLeft, Check, FileText, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { type FlagSeverity, getMatchDetail, type ScreeningQuestion } from "@/lib/data";

const TIER_VARIANT = {
  Simple: "secondary",
  Medium: "default",
  Hard: "warning",
} as const satisfies Record<ScreeningQuestion["tier"], "secondary" | "default" | "warning">;

const SEVERITY_VARIANT = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
} as const satisfies Record<FlagSeverity, "destructive" | "warning" | "secondary">;

const TRIAGE = [
  { label: "Green", dot: "bg-success" },
  { label: "Amber", dot: "bg-warning" },
  { label: "Red", dot: "bg-destructive" },
];

export default async function MatchDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ req?: string; candidate?: string }>;
}) {
  const { req, candidate } = await searchParams;
  const m = await getMatchDetail(req, candidate);
  const composite = Math.round(m.subScores.reduce((a, x) => a + x.weight * x.score, 0));

  return (
    <AppShell active="requisitions" title="Candidate fit">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link
          href={`/requisitions/${m.reqId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to requisition
        </Link>

        {/* Candidate × req header */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-4">
              <Avatar name={m.candidate} className="size-12 text-base" />
              <div>
                <Link
                  href={`/candidates/${m.candidateId}`}
                  className="text-lg font-semibold tracking-tight hover:underline"
                >
                  {m.candidate}
                </Link>
                <p className="text-sm text-muted-foreground">matched against {m.req}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Fit score</p>
              <p className="text-3xl font-semibold tracking-tight">{composite}</p>
              <p className="text-xs text-muted-foreground">for your review</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Fit breakdown */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Fit breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">
                A transparent weighted sum — every factor shown with its evidence.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {m.subScores.map((x) => (
                <div key={x.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {x.label}
                      <span className="ml-2 text-xs text-muted-foreground">
                        weight {Math.round(x.weight * 100)}%
                      </span>
                    </span>
                    <span className="tabular-nums font-medium">{x.score}</span>
                  </div>
                  <Progress value={x.score} />
                  <p className="text-xs text-muted-foreground">{x.evidence}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Skills + triage */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Skill match</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Core
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.coreSkills.map((k) => (
                      <Badge key={k}>
                        <Check className="size-3" />
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nice to have
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {m.niceSkills.map((k) => (
                      <Badge key={k} variant="outline">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Triage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {TRIAGE.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card py-2 text-sm font-medium transition-colors hover:bg-accent"
                    >
                      <span className={`size-2 rounded-full ${t.dot}`} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ManFriday never pre-selects or rejects a candidate. You set the decision with a
                  reason code, and it&apos;s written to the audit log.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Review areas — advisory, separate from fit */}
        <Card>
          <CardHeader>
            <CardTitle>Review areas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Advisory signals to check during screening — never folded into the fit score, never an
              automatic reject.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.reviewFlags.map((f) => (
              <div
                key={f.label}
                className="flex items-start gap-3 rounded-lg border border-border p-3"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {f.label}
                    <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>
                  </p>
                  <p className="text-sm text-muted-foreground">{f.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Screening questions */}
        <Card>
          <CardHeader>
            <CardTitle>Screening questions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tiered and grounded in the JD and résumé, with model answer keys.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {m.questions.map((q, i) => (
              <div key={`${q.tier}-${i}`}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-start gap-3">
                  <Badge variant={TIER_VARIANT[q.tier]} className="mt-0.5 shrink-0">
                    {q.tier}
                  </Badge>
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm">{q.q}</p>
                    <details className="group">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                        <FileText className="size-3.5" />
                        Answer key
                      </summary>
                      <p className="mt-1.5 rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                        {q.answer}
                      </p>
                    </details>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
