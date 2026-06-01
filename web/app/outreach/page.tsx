// Render at request time — real data under DATA_SOURCE=api; never prerender an API call.
export const dynamic = "force-dynamic";

import { Mail, Send, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type CampaignStatus,
  campaignStatusLabel,
  getAudience,
  listCampaigns,
  listRequisitions,
} from "@/lib/data";

import { createCampaignAction } from "./actions";

const STATUS_VARIANT = {
  sent: "success",
  scheduled: "warning",
  draft: "secondary",
} as const satisfies Record<CampaignStatus, "success" | "warning" | "secondary">;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";

const DEFAULT_BODY = `Hi {{first_name}},

I came across your background and thought of a role I'm working on with one of our client partners. The team is strong and the work is squarely in your wheelhouse.

Open to a quick chat this week?

Best,
The recruiting team`;

export default async function OutreachPage() {
  const [campaigns, audience, requisitions] = await Promise.all([
    listCampaigns(),
    getAudience(),
    listRequisitions(),
  ]);

  const pct = (n: number) => (audience.total > 0 ? Math.round((n / audience.total) * 100) : 0);

  return (
    <AppShell active="outreach" title="Outreach">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Compliance banner */}
        <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Compliant by default.</span> Every send
            includes one-click unsubscribe and a physical address (CAN-SPAM). Only opted-in
            candidates are emailable — pending and unsubscribed are suppressed server-side and the
            campaign + each recipient send is written to the audit log.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Composer */}
          <Card className="lg:col-span-2">
            <form action={createCampaignAction}>
              <CardHeader>
                <CardTitle>New campaign</CardTitle>
                <CardDescription>
                  Compose once; we personalize per candidate and send to every opted-in candidate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Requisition */}
                <div className="space-y-1.5">
                  <label htmlFor="requisition_id" className="text-sm font-medium">
                    Job posting
                  </label>
                  <select
                    id="requisition_id"
                    name="requisition_id"
                    required
                    defaultValue=""
                    className="flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="" disabled>
                      Select a requisition…
                    </option>
                    {requisitions.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-success">
                      {audience.optedIn.toLocaleString()}
                    </span>{" "}
                    opted-in candidates will receive this · {audience.pendingConsent.toLocaleString()}{" "}
                    pending and {audience.unsubscribed.toLocaleString()} unsubscribed excluded
                    automatically.
                  </p>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <label htmlFor="subject" className="text-sm font-medium">
                    Subject
                  </label>
                  <Input
                    id="subject"
                    name="subject"
                    required
                    defaultValue="New roles at our client partners"
                  />
                </div>

                {/* Body */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="body" className="text-sm font-medium">
                      Message
                    </label>
                    <span className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground">
                      {"{{first_name}}"} merges per candidate
                    </span>
                  </div>
                  <Textarea id="body" name="body" required className="min-h-44" defaultValue={DEFAULT_BODY} />
                </div>

                {/* CAN-SPAM footer note */}
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    A physical address and a working one-click{" "}
                    <span className="font-medium">Unsubscribe</span> link are appended automatically
                    (required by CAN-SPAM). Unsubscribing is honored instantly and removes the
                    candidate from all future sends.
                  </p>
                </div>
              </CardContent>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-4">
                <Button type="submit" size="sm">
                  <Send className="size-4" />
                  Create &amp; send campaign
                </Button>
              </div>
            </form>
          </Card>

          {/* Audience */}
          <Card>
            <CardHeader>
              <CardTitle>Audience</CardTitle>
              <CardDescription>Who can be emailed right now</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div className="bg-success" style={{ width: `${pct(audience.optedIn)}%` }} />
                <div className="bg-warning/60" style={{ width: `${pct(audience.pendingConsent)}%` }} />
                <div
                  className="bg-muted-foreground/40"
                  style={{ width: `${pct(audience.unsubscribed)}%` }}
                />
              </div>

              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Total in database</dt>
                  <dd className="font-medium tabular-nums">{audience.total.toLocaleString()}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-success" />
                    Emailable (opted in)
                  </dt>
                  <dd>
                    <Badge variant="success">{audience.optedIn.toLocaleString()}</Badge>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span className="size-2 rounded-full bg-warning/60" />
                    Pending consent
                  </dt>
                  <dd className="tabular-nums text-muted-foreground">
                    {audience.pendingConsent.toLocaleString()}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <span className="size-2 rounded-full bg-muted-foreground/40" />
                    Unsubscribed
                  </dt>
                  <dd className="tabular-nums text-muted-foreground">{audience.unsubscribed}</dd>
                </div>
              </dl>

              <p className="rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                Pending and unsubscribed candidates are excluded from every send automatically. The
                suppression list is enforced server-side and written to the audit log.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent campaigns */}
        <Card className="overflow-hidden p-0">
          <CardHeader className="p-6">
            <CardTitle>Recent campaigns</CardTitle>
            <CardDescription>
              Sends for this org. Open and reply rates arrive with delivery webhooks (next step).
            </CardDescription>
          </CardHeader>
          <table className="w-full border-collapse text-sm">
            <thead className="border-y border-border bg-muted/40">
              <tr>
                <th className={TH}>Campaign</th>
                <th className={TH}>Recipients</th>
                <th className={TH}>Open rate</th>
                <th className={TH}>Reply rate</th>
                <th className={TH}>Status</th>
                <th className={TH}>When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No campaigns yet. Compose one above to email your opted-in candidates.
                  </td>
                </tr>
              )}
              {campaigns.map((c) => (
                <tr key={c.id} className="transition-colors hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                        <Mail className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{c.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{c.subject}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.recipients}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">—</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">—</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[c.status]}>{campaignStatusLabel[c.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </AppShell>
  );
}
