// GET  /api/v1/campaigns — the org's campaigns + per-campaign recipient counts (display shape).
// POST /api/v1/campaigns — create a campaign for a requisition and ENQUEUE one campaign_send
//   row (status 'queued') per consent-eligible candidate (opted_in + has an email). Sending
//   itself is a separate, resumable step (POST …/{id}/process) so a large audience never blocks
//   one request. RLS-scoped; audited. Unsubscribed/pending candidates are never enqueued.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { badRequest, getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Map the DB lifecycle (draft→sending→sent/failed) onto the UI's CampaignStatus.
function displayStatus(s: string): "sent" | "scheduled" | "draft" {
  if (s === "sent") return "sent";
  if (s === "sending") return "scheduled";
  return "draft";
}

interface CampaignListRow {
  id: string;
  subject: string;
  status: string;
  created_at: Date;
  req_title: string | null;
  recipients: number;
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;

  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) =>
    sql<CampaignListRow[]>`
      select c.id, c.subject, c.status, c.created_at, r.title as req_title,
             (select count(*)::int from campaign_send s where s.campaign_id = c.id) as recipients
      from campaign c
      left join requisition r on r.id = c.requisition_id
      order by c.created_at desc`,
  );

  // Display Campaign shape. Open/reply rates are deferred (need Resend webhooks) — 0 here;
  // the page renders "—" for them rather than a misleading 0%.
  const out = rows.map((c) => ({
    id: c.id,
    name: c.req_title ? `${c.req_title}` : c.subject,
    subject: c.subject,
    recipients: c.recipients,
    openRate: 0,
    replyRate: 0,
    status: displayStatus(c.status),
    when: c.created_at.toISOString().slice(0, 10),
  }));
  return NextResponse.json(out);
}

export async function POST(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const body = (await req.json().catch(() => ({}))) as {
    requisition_id?: string;
    subject?: string;
    body?: string;
  };
  const requisitionId = (body.requisition_id ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const emailBody = (body.body ?? "").trim();
  if (!requisitionId) return badRequest("requisition_id is required");
  if (!subject) return badRequest("subject is required");
  if (!emailBody) return badRequest("body is required");

  const result = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const reqRow = await sql<{ id: string }[]>`
      select id from requisition where id = ${requisitionId} and deleted_at is null`;
    if (!reqRow[0]) return null;

    const ins = await sql<{ id: string }[]>`
      insert into campaign (org_id, requisition_id, subject, body, created_by, status)
      values (${ctx.orgId}, ${requisitionId}, ${subject}, ${emailBody}, ${ctx.userId}, 'sending')
      returning id`;
    const campaignId = ins[0]!.id;

    // Consent-eligible audience: opted-in candidates with a usable email. Never the
    // pending or unsubscribed — the audience filter IS the suppression list.
    const audience = await sql<{ id: string }[]>`
      select id from candidate
      where consent_state = 'opted_in' and deleted_at is null
        and email is not null and btrim(email) <> ''`;

    if (audience.length > 0) {
      const sendRows = audience.map((c) => ({
        org_id: ctx.orgId,
        campaign_id: campaignId,
        candidate_id: c.id,
      }));
      await sql`insert into campaign_send ${sql(sendRows, "org_id", "campaign_id", "candidate_id")}
        on conflict (campaign_id, candidate_id) do nothing`;
    } else {
      // Nothing to send — mark complete so the campaign isn't stuck "sending".
      await sql`update campaign set status = 'sent' where id = ${campaignId}`;
    }

    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${ctx.orgId}, ${ctx.userId}, 'campaign.created', 'campaign', ${campaignId},
              ${sql.json({ requisition_id: requisitionId, subject, queued: audience.length } as never)})`;

    return { id: campaignId, queued: audience.length };
  });

  if (!result) return notFound("requisition not found");
  return NextResponse.json(result, { status: 201 });
}
