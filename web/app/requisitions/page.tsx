// Render at request time — real data under DATA_SOURCE=api; never prerender an API call.
export const dynamic = "force-dynamic";

import {
  Briefcase,
  Building2,
  ChevronDown,
  ListChecks,
  MapPin,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { listRequisitions, type ReqStatus, reqStatusLabel } from "@/lib/data";

const STATUS_VARIANT = {
  open: "success",
  on_hold: "warning",
  filled: "secondary",
} as const satisfies Record<ReqStatus, "success" | "warning" | "secondary">;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function FauxSelect({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors hover:bg-accent/40"
    >
      <span>{value}</span>
      <ChevronDown className="size-4 text-muted-foreground" />
    </button>
  );
}

export default async function RequisitionsPage() {
  const requisitions = await listRequisitions();
  const openCount = requisitions.filter((r) => r.status === "open").length;

  return (
    <AppShell active="requisitions" title="Requisitions">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{openCount} open</span> of{" "}
            {requisitions.length} requisitions
          </p>
          <Button size="sm">
            <Plus className="size-4" />
            New requisition
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Requisitions list */}
          <Card className="overflow-hidden p-0 lg:col-span-2">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <th className={TH}>Role</th>
                  <th className={TH}>Client</th>
                  <th className={TH}>Openings</th>
                  <th className={TH}>Pipeline</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Posted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {requisitions.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-accent/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                          <Briefcase className="size-4" />
                        </div>
                        <div>
                          <Link
                            href={`/requisitions/${r.id}`}
                            className="font-medium hover:underline"
                          >
                            {r.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">{r.employmentType}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{r.client}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {r.location}
                      </p>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.openings}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{r.inPipeline}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[r.status]}>{reqStatusLabel[r.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.postedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Intake + what-happens-next */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>New requisition</CardTitle>
                <CardDescription>Capture the role. Sourcing and outreach follow.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Job title">
                  <Input placeholder="e.g. Senior Backend Engineer" />
                </Field>
                <Field label="Client">
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Company served" />
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Location">
                    <Input placeholder="City / Remote" />
                  </Field>
                  <Field label="Openings">
                    <Input type="number" defaultValue={1} min={1} />
                  </Field>
                </div>
                <Field label="Employment type">
                  <FauxSelect value="Full-time" />
                </Field>
                <Field label="Job description">
                  <Textarea
                    className="min-h-32"
                    placeholder="Paste the JD here. Originals are stored immutably and versioned."
                  />
                </Field>
              </CardContent>
              <div className="flex items-center justify-end gap-2 border-t border-border p-4">
                <Button variant="ghost" size="sm">
                  Save draft
                </Button>
                <Button size="sm">Create requisition</Button>
              </div>
            </Card>

            {/* What happens next */}
            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/40">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2">
                  <ListChecks className="size-4 text-primary" />
                  <span className="font-semibold">What happens next</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  When you create a requisition, ManFriday breaks the JD into{" "}
                  <span className="font-medium text-foreground">core</span> and{" "}
                  <span className="font-medium text-foreground">nice-to-have</span> skills, scores
                  how complete it is, and ranks the best-fit candidates from your database — each
                  match traceable to evidence and confirmed by you.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          JD originals are stored immutably and versioned; a scored req pins the exact JD version it
          was screened against.
        </p>
      </div>
    </AppShell>
  );
}
