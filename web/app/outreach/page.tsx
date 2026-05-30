// Render at request time — real data under DATA_SOURCE=api; never prerender an API call.
export const dynamic = "force-dynamic";

import {
  ChevronDown,
  Clock,
  Eye,
  FileText,
  Lock,
  Mail,
  Reply,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";

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
  getEmailTemplates,
  getOutreachStats,
  listCampaigns,
  mergeFields,
} from "@/lib/data";

const STATUS_VARIANT = {
  sent: "success",
  scheduled: "warning",
  draft: "secondary",
} as const satisfies Record<CampaignStatus, "success" | "warning" | "secondary">;

const TH = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const rate = (r: number) => `${Math.round(r * 100)}%`;

const DEFAULT_BODY = `Hi {{first_name}},

I came across your background in {{top_skill}} and thought of a {{title}} role I'm working on with one of our client partners. The team is strong and the work is squarely in your wheelhouse.

Open to a quick chat this week?

Best,
{{recruiter_name}}`;

export default async function OutreachPage() {
  const [campaigns, emailTemplates, audience, outreachStats] = await Promise.all([
    listCampaigns(),
    getEmailTemplates(),
    getAudience(),
    getOutreachStats(),
  ]);

  const pct = (n: number) => Math.round((n / audience.total) * 100);

  const STAT_CARDS = [
    { label: "Emails sent (30d)", value: outreachStats.sent30d.toLocaleString(), icon: Send },
    { label: "Avg open rate", value: outreachStats.avgOpenRate, icon: Eye },
    { label: "Avg reply rate", value: outreachStats.avgReplyRate, icon: Reply },
    { label: "Unsubscribes (30d)", value: String(outreachStats.unsubscribes30d), icon: ShieldCheck },
  ];

  return (
    <AppShell active="outreach" title="Outreach">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Compliance banner */}
        <div className="flex items-start gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Compliant by default.</span> Every send
            includes one-click unsubscribe and your verified sender identity. Only candidates who
            opted in are emailable — consent and unsubscribe state is enforced server-side and
            audited.
          </p>
        </div>

        {/* Stat strip */}
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
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Composer */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>New campaign</CardTitle>
              <CardDescription>
                Compose once, personalize per candidate with merge fields.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Campaign name</label>
                <Input defaultValue="Backend talent — Q2 reactivation" />
              </div>

              {/* Recipients / segment */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Recipients</label>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md border border-input bg-card px-3 py-2 text-left text-sm shadow-sm transition-colors hover:bg-accent/40"
                >
                  <span className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    Opted-in candidates · Backend skills (Python, Go, Java)
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
                </button>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-success">{audience.optedIn.toLocaleString()}</span>{" "}
                  emailable · {audience.pendingConsent.toLocaleString()} pending-consent candidates
                  excluded automatically.
                </p>
              </div>

              {/* Templates */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Start from a template</label>
                <div className="flex flex-wrap gap-2">
                  {emailTemplates.map((t, i) => (
                    <Button key={t.id} variant={i === 0 ? "secondary" : "outline"} size="sm">
                      <FileText className="size-4" />
                      {t.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Subject</label>
                <Input defaultValue="New backend roles at our client partners" />
              </div>

              {/* Body + merge fields */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm font-medium">Message</label>
                  <div className="flex flex-wrap gap-1.5">
                    {mergeFields.map((f) => (
                      <button
                        key={f}
                        type="button"
                        className="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea className="min-h-44" defaultValue={DEFAULT_BODY} />
              </div>

              {/* CAN-SPAM footer preview */}
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Lock className="size-3.5" />
                  Auto-appended · required by CAN-SPAM
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  ManFriday Talent on behalf of Northwind Robotics · 100 Congress Ave, Austin, TX
                  78701
                  <br />
                  You received this because you opted in to role alerts.{" "}
                  <span className="text-primary underline">Unsubscribe</span> · Update preferences
                </p>
              </div>
            </CardContent>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border p-4">
              <Button variant="ghost" size="sm">
                Save draft
              </Button>
              <Button variant="outline" size="sm">
                <Clock className="size-4" />
                Schedule
              </Button>
              <Button size="sm">
                <Send className="size-4" />
                Send to {audience.optedIn.toLocaleString()} candidates
              </Button>
            </div>
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
                <div
                  className="bg-warning/60"
                  style={{ width: `${pct(audience.pendingConsent)}%` }}
                />
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
            <CardDescription>Open and reply rates by campaign</CardDescription>
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
                  <td className="px-4 py-3 tabular-nums">{c.status === "sent" ? rate(c.openRate) : "—"}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {c.status === "sent" ? rate(c.replyRate) : "—"}
                  </td>
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
