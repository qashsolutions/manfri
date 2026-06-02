// POST /api/v1/campaigns/{id}/process — send ONE chunk (≤ RESEND_BATCH_LIMIT) of this
// campaign's queued recipients, then mark each sent/failed. Resumable + idempotent: it only
// ever picks `queued` rows, so calling it repeatedly (a loop for small audiences, a cron for
// large ones) drains the queue without double-sending. Network happens OUTSIDE the DB
// transaction (claim → send → record) so a slow provider never holds a row lock.
// Returns { processed, sent, failed, remaining } so the caller knows whether to call again.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { getEmailProvider, RESEND_BATCH_LIMIT, type EmailMessage } from "@/lib/email/provider";
import { renderCampaignEmail } from "@/lib/email/render";
import { signUnsub } from "@/lib/email/unsub-token";
import { getOrgCtx, notFound } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface QueuedRow {
  send_id: string;
  candidate_id: string;
  name: string | null;
  email: string | null;
  consent_state: string;
  deleted_at: Date | null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  const { id: campaignId } = await params;
  const base = process.env.APP_BASE_URL || new URL(req.url).origin;

  // ── 1. Claim a chunk + load the campaign (short txn, no network) ──────────────────
  const claim = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const camp = await sql<{ id: string; subject: string; body: string }[]>`
      select id, subject, body from campaign where id = ${campaignId}`;
    if (!camp[0]) return null;

    const queued = await sql<QueuedRow[]>`
      select s.id as send_id, s.candidate_id, c.name, c.email, c.consent_state, c.deleted_at
      from campaign_send s
      join candidate c on c.id = s.candidate_id
      where s.campaign_id = ${campaignId} and s.status = 'queued'
      order by s.created_at
      limit ${RESEND_BATCH_LIMIT}`;

    // Suppress any whose consent changed after enqueue (unsubscribed / deleted / no email):
    // mark failed now, never email them.
    const suppressed = queued.filter(
      (r) => r.consent_state !== "opted_in" || r.deleted_at !== null || !r.email || !r.email.trim(),
    );
    for (const s of suppressed) {
      await sql`update campaign_send set status = 'failed', error = 'suppressed (not opted_in)'
        where id = ${s.send_id}`;
    }

    const eligible = queued.filter((r) => !suppressed.includes(r));
    return { subject: camp[0].subject, body: camp[0].body, eligible, suppressedCount: suppressed.length };
  });

  if (!claim) return notFound("campaign not found");

  // ── 2. Send (outside any txn) ─────────────────────────────────────────────────────
  let sent = 0;
  let failed = claim.suppressedCount;
  if (claim.eligible.length > 0) {
    const messages: EmailMessage[] = claim.eligible.map((r) => {
      const unsubUrl = `${base}/api/v1/unsubscribe?token=${signUnsub(ctx.orgId, r.candidate_id)}`;
      const { html, text } = renderCampaignEmail({ body: claim.body, candidateName: r.name, unsubUrl });
      return {
        to: r.email!,
        subject: claim.subject,
        html,
        text,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      };
    });

    const provider = getEmailProvider();
    const results = await provider.sendBatch(messages);

    // ── 3. Record results + finalize (short txn) ─────────────────────────────────────
    await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
      for (let i = 0; i < claim.eligible.length; i++) {
        const r = claim.eligible[i]!;
        const res = results[i];
        if (res?.ok) {
          sent++;
          await sql`update campaign_send set status = 'sent', provider_id = ${res.id ?? null}, sent_at = now(), error = null
            where id = ${r.send_id}`;
        } else {
          failed++;
          await sql`update campaign_send set status = 'failed', error = ${res?.error ?? "send failed"}
            where id = ${r.send_id}`;
        }
      }
    });
  }

  // ── 4. Finalize campaign status when the queue is drained ───────────────────────────
  const remaining = await withOrg({ orgId: ctx.orgId, role: ctx.role }, async (sql) => {
    const rem = await sql<{ n: number }[]>`
      select count(*)::int as n from campaign_send where campaign_id = ${campaignId} and status = 'queued'`;
    const n = rem[0]?.n ?? 0;
    if (n === 0) {
      const any = await sql<{ n: number }[]>`
        select count(*)::int as n from campaign_send where campaign_id = ${campaignId} and status = 'sent'`;
      await sql`update campaign set status = ${(any[0]?.n ?? 0) > 0 ? "sent" : "failed"} where id = ${campaignId}`;
    }
    return n;
  });

  return NextResponse.json({ processed: claim.eligible.length + claim.suppressedCount, sent, failed, remaining });
}
