import { Check, FileText, Lock, ShieldCheck, Sparkles } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { type ScreeningQuestion, premiumSample } from "@/lib/sample-data";

const TIER_VARIANT = {
  Simple: "secondary",
  Medium: "default",
  Hard: "warning",
} as const satisfies Record<ScreeningQuestion["tier"], "secondary" | "default" | "warning">;

const TRIAGE = [
  { label: "Green", dot: "bg-success" },
  { label: "Amber", dot: "bg-warning" },
  { label: "Red", dot: "bg-destructive" },
];

export default function ScreeningPage() {
  const s = premiumSample;
  const composite = Math.round(s.subScores.reduce((a, x) => a + x.weight * x.score, 0));

  return (
    <AppShell active="screening" title="AI Screening">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Preview banner */}
        <div className="flex flex-col items-start gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-accent/40 p-5 sm:flex-row sm:items-center">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div className="flex-1">
            <p className="flex items-center gap-2 font-semibold">
              Explainable AI screening
              <Badge variant="outline">
                <Lock className="size-3" />
                Premium preview
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground">
              A sample of what premium adds. Every number traces to evidence; a human always decides.
            </p>
          </div>
          <Button>Upgrade to enable</Button>
        </div>

        {/* Sample candidate header */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
            <div>
              <p className="text-sm text-muted-foreground">Sample · {s.req}</p>
              <h2 className="text-lg font-semibold tracking-tight">{s.candidate}</h2>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Suggested fitment</p>
              <p className="text-3xl font-semibold tracking-tight">{composite}</p>
              <p className="text-xs text-muted-foreground">for recruiter review</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Sub-scores */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Fitment breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">
                Transparent weighted sum of evidence-backed sub-scores — no black box.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {s.subScores.map((x) => (
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
                    CORE
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.coreSkills.map((k) => (
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
                    {s.niceSkills.map((k) => (
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
                  The AI never pre-selects or auto-rejects. A human sets the decision with a reason
                  code — and it&apos;s recorded in the audit log.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Screening questions */}
        <Card>
          <CardHeader>
            <CardTitle>Screening questions</CardTitle>
            <p className="text-sm text-muted-foreground">
              Tiered, grounded in the JD and résumé — generated with model answer keys.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {s.questions.map((q, i) => (
              <div key={q.tier}>
                {i > 0 && <Separator className="mb-3" />}
                <div className="flex items-start gap-3">
                  <Badge variant={TIER_VARIANT[q.tier]} className="mt-0.5 shrink-0">
                    {q.tier}
                  </Badge>
                  <p className="flex-1 text-sm">{q.q}</p>
                  <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                </div>
              </div>
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              Model answer keys are unlocked on the premium tier.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
