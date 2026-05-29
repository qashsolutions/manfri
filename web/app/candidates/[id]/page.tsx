import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Download,
  FileText,
  Mail,
  MapPin,
  MessageSquare,
  Pencil,
  ShieldCheck,
  Target,
  TriangleAlert,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  type ActivityType,
  type CandidateStatus,
  type FlagSeverity,
  getCandidate,
  getCandidateDetail,
  getCandidateOrgs,
  getProposalHistory,
  getReviewFlags,
  type ProposalOutcome,
  proposalOutcomeLabel,
  statusLabel,
} from "@/lib/data";

const STATUS_VARIANT = {
  new: "secondary",
  contacted: "default",
  screening: "warning",
  submitted: "success",
} as const satisfies Record<CandidateStatus, "secondary" | "default" | "warning" | "success">;

const ACTIVITY_ICON = {
  upload: Upload,
  email: Mail,
  status: CheckCircle2,
  note: MessageSquare,
  consent: ShieldCheck,
} as const satisfies Record<ActivityType, typeof Mail>;

const SEVERITY_VARIANT = {
  high: "destructive",
  medium: "warning",
  low: "secondary",
} as const satisfies Record<FlagSeverity, "destructive" | "warning" | "secondary">;

const OUTCOME_VARIANT = {
  proposed: "default",
  interviewing: "warning",
  rejected: "secondary",
  hired: "success",
} as const satisfies Record<ProposalOutcome, "default" | "warning" | "secondary" | "success">;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const candidate = await getCandidate(id);
  if (!candidate) notFound();

  const [d, reviewFlags, proposalHistory, candidateOrgs] = await Promise.all([
    getCandidateDetail(id),
    getReviewFlags(id),
    getProposalHistory(id),
    getCandidateOrgs(id),
  ]);

  return (
    <AppShell active="candidates" title="Candidate">
      <div className="mx-auto max-w-6xl space-y-6">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to candidates
        </Link>

        {/* Header */}
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
            <Avatar name={candidate.name} className="size-14 text-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">{candidate.name}</h2>
                <Badge variant={STATUS_VARIANT[candidate.status]}>
                  {statusLabel[candidate.status]}
                </Badge>
                {candidate.consent ? (
                  <Badge variant="success">Opted in</Badge>
                ) : (
                  <Badge variant="outline">Consent pending</Badge>
                )}
                {candidateOrgs.length > 1 && (
                  <Badge variant="outline">
                    <Building2 className="size-3" />
                    In {candidateOrgs.length} organizations
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                {candidate.title}
                <span className="text-border">·</span>
                <MapPin className="size-3.5" />
                {candidate.location}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link href="/outreach">
                  <Mail className="size-4" />
                  Email
                </Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/screening">
                  <Target className="size-4" />
                  Match to req
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
            {/* Summary + facts */}
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed text-muted-foreground">{d.summary}</p>
                <Separator />
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Work authorization" value={d.workAuth} />
                  <Fact label="Availability" value={d.availability} />
                  <Fact label="Desired comp" value={d.desiredComp} />
                  <Fact label="Contact" value={d.phone} />
                </dl>
                <Separator />
                <div>
                  <p className="mb-2 text-xs text-muted-foreground">Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.skills.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Review areas (advisory) */}
            <Card>
              <CardHeader>
                <CardTitle>Review areas</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Advisory signals to verify — they never reject a candidate; a person decides.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviewFlags.map((f) => (
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

            {/* Proposal history (cross-org) */}
            <Card>
              <CardHeader>
                <CardTitle>Proposal history</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Where this candidate was proposed, when, and why — across organizations.
                </p>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {proposalHistory.map((p) => (
                    <li key={p.id} className="flex gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                        <Building2 className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {p.req}
                          <Badge variant={OUTCOME_VARIANT[p.outcome]}>
                            {proposalOutcomeLabel[p.outcome]}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.org} · {p.date}
                        </p>
                        {p.reason && (
                          <p className="mt-0.5 text-sm text-muted-foreground">Reason: {p.reason}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            {/* Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {d.activity.map((e) => {
                    const Icon = ACTIVITY_ICON[e.type];
                    return (
                      <li key={e.id} className="flex gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
                          <Icon className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm">{e.text}</p>
                          <p className="text-xs text-muted-foreground">
                            {e.actor} · {e.when}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Organizations (multi-org membership) */}
            <Card>
              <CardHeader>
                <CardTitle>Organizations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-2">
                  {candidateOrgs.map((org) => (
                    <li key={org} className="flex items-center gap-2 text-sm">
                      <Users className="size-4 text-muted-foreground" />
                      {org}
                    </li>
                  ))}
                </ul>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  This candidate is in more than one pool. Each org only sees its own notes,
                  proposals, and activity — sharing is consent-gated and access is RLS-scoped.
                </p>
              </CardContent>
            </Card>

            {/* Résumé versions */}
            <Card>
              <CardHeader>
                <CardTitle>Résumé versions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {d.resumeVersions.map((r) => (
                  <div
                    key={r.version}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <FileText className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        v{r.version}
                        {r.isCurrent && <Badge variant="success">Current</Badge>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.uploadedAt} · {r.sizeKb} KB · {r.contentHash}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label="Download résumé">
                      <Download className="size-4" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  Uploads are immutable, content-hashed versions — a decision always pins the exact
                  version it was made against.
                </p>
              </CardContent>
            </Card>

            {/* Consent & compliance */}
            <Card>
              <CardHeader>
                <CardTitle>Consent &amp; data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Outreach consent</span>
                  {candidate.consent ? (
                    <Badge variant="success">Opted in</Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium">{d.consentSource}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span className="font-medium">{d.consentUpdated}</span>
                </div>
                <Separator />
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                  Stored encrypted with a per-tenant key. Access is RLS-scoped and every read/write
                  is written to the audit log.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
