import {
  ArrowLeft,
  Briefcase,
  Building2,
  Lock,
  MapPin,
  Pencil,
  Search,
  Sparkles,
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
  type CandidateStatus,
  candidates,
  type ReqStatus,
  reqStatusLabel,
  requisitions,
  statusLabel,
} from "@/lib/sample-data";

const REQ_STATUS_VARIANT = {
  open: "success",
  on_hold: "warning",
  filled: "secondary",
} as const satisfies Record<ReqStatus, "success" | "warning" | "secondary">;

const STATUS_VARIANT = {
  new: "secondary",
  contacted: "default",
  screening: "warning",
  submitted: "success",
} as const satisfies Record<CandidateStatus, "secondary" | "default" | "warning" | "success">;

const JD_CORE = ["Python", "PostgreSQL", "Distributed systems", "7+ yrs backend"];
const JD_NICE = ["Kafka", "Go", "Terraform", "Payments domain"];

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const req = requisitions.find((r) => r.id === id);
  if (!req) notFound();

  const pipeline = candidates.slice(0, 5);

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
              <Button size="sm">
                <Search className="size-4" />
                Source candidates
              </Button>
              <Button size="sm" variant="outline">
                <Pencil className="size-4" />
                Edit
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pipeline */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Pipeline</CardTitle>
                <p className="text-sm text-muted-foreground">{req.inPipeline} candidates</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/candidates">View all</Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-1">
              {pipeline.map((c) => (
                <Link
                  key={c.id}
                  href={`/candidates/${c.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/50"
                >
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[c.status]}>{statusLabel[c.status]}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* JD + skills */}
            <Card>
              <CardHeader>
                <CardTitle>Job description</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    CORE skills
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {JD_CORE.map((s) => (
                      <Badge key={s}>{s}</Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Nice to have
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {JD_NICE.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Separator />
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  These were tagged manually. <span className="font-medium">AI extraction</span>{" "}
                  (weighted CORE/NICE with evidence spans) is a premium feature.
                </p>
              </CardContent>
            </Card>

            {/* Premium teaser */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/40">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-primary" />
                  <span className="font-semibold">Match the pipeline</span>
                  <Lock className="ml-auto size-3.5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Rank every candidate against this req with transparent, evidence-backed fitment
                  scores — human-decided, never auto-rejected.
                </p>
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href="/screening">See AI screening</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
