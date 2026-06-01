// GET/POST /api/v1/unsubscribe?token=… — PUBLIC (no login). The signed token IS the
// authorization: it encodes (org, candidate) and is HMAC-verified, so we scope the write to
// the token's org (withOrg) and flip that candidate's consent to 'unsubscribed' — which drops
// them from every future audience (the suppression list). GET serves a confirmation page for a
// link click; POST handles RFC-8058 List-Unsubscribe one-click. CAN-SPAM: honored immediately.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { verifyUnsub } from "@/lib/email/unsub-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(message: string, ok: boolean, status: number): NextResponse {
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>Unsubscribe</title></head>` +
    `<body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f9fafb;margin:0;padding:48px">` +
    `<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center">` +
    `<div style="font-size:32px">${ok ? "✅" : "⚠️"}</div>` +
    `<p style="font-size:15px;color:#111;line-height:1.6">${message}</p>` +
    `</div></body></html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function unsubscribe(token: string | null): Promise<NextResponse> {
  const claim = verifyUnsub(token);
  if (!claim) return page("This unsubscribe link is invalid or has expired.", false, 400);

  const ok = await withOrg({ orgId: claim.orgId }, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      update candidate
      set consent_state = 'unsubscribed', consent_source = 'email_unsubscribe', consent_updated_at = now()
      where id = ${claim.candidateId} and deleted_at is null
      returning id`;
    if (!rows[0]) return false;
    await sql`insert into audit_event (org_id, actor_id, action, entity_type, entity_id, after_jsonb)
      values (${claim.orgId}, null, 'candidate.unsubscribe', 'candidate', ${claim.candidateId},
              ${sql.json({ source: "email_unsubscribe" } as never)})`;
    return true;
  });

  if (!ok) return page("We couldn't find your record. You may already be unsubscribed.", true, 200);
  return page("You've been unsubscribed. You won't receive further emails from this recruiter.", true, 200);
}

export async function GET(req: Request): Promise<NextResponse> {
  return unsubscribe(new URL(req.url).searchParams.get("token"));
}

export async function POST(req: Request): Promise<NextResponse> {
  // One-click (RFC 8058): the token rides in the query string; mail clients POST to it.
  return unsubscribe(new URL(req.url).searchParams.get("token"));
}
