// Mass-email v1 proof, against LIVE Supabase as the logged-in org-A recruiter (real JWT),
// exercising the SAME route handlers the UI's compose action calls. Proves:
//   compose campaign for a requisition → enqueue only consent-eligible candidates (pending
//   excluded) → process → campaign_send rows go 'sent' → campaign appears in listCampaigns →
//   hit the public unsubscribe link with a valid token → that candidate is unsubscribed and
//   drops from the audience + future campaigns → invalid token rejected → org B (real JWT)
//   cannot see org A's campaigns, and RLS WITH CHECK blocks a cross-org write.
//
// Sends go through the dry-run provider unless RESEND_API_KEY is set (then it's the real
// Resend test path). The flow — queue → send → mark sent — is identical either way.

import { withOrg } from "@manfriday/db";

import { GET as candidateGET } from "../app/api/v1/candidates/[id]/route";
import { POST as candidatesPOST } from "../app/api/v1/candidates/route";
import { POST as processPOST } from "../app/api/v1/campaigns/[id]/process/route";
import { GET as campaignsGET, POST as campaignsPOST } from "../app/api/v1/campaigns/route";
import { GET as audienceGET } from "../app/api/v1/outreach/audience/route";
import { POST as reqPOST } from "../app/api/v1/requisitions/route";
import { GET as unsubGET } from "../app/api/v1/unsubscribe/route";
import { getEmailProvider } from "../lib/email/provider";
import { signUnsub } from "../lib/email/unsub-token";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const PW = process.env.SEED_USER_PASSWORD as string;

const ORG_A = "00000000-0000-0000-0000-00000000a000";
const ORG_B = "00000000-0000-0000-0000-00000000b000";
const USERS = [
  { email: "user-a@manfriday-demo.com", orgId: ORG_A },
  { email: "user-b@manfriday-demo.com", orgId: ORG_B },
];

let fail = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) fail++;
};

const adminHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

async function ensureUser(email: string, orgId: string): Promise<void> {
  const appMeta = { org_id: orgId, org_role: "recruiter" };
  const listed = (await (
    await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: adminHeaders })
  ).json()) as { users?: Array<{ id: string; email: string }> };
  const existing = (listed.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (existing) {
    await fetch(`${URL_}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ password: PW, email_confirm: true, app_metadata: appMeta }),
    });
    return;
  }
  await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email, password: PW, email_confirm: true, app_metadata: appMeta }),
  });
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  if (!res.ok) throw new Error(`sign-in ${email} -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const stamp = Date.now().toString().slice(-7);
const P = (id: string) => ({ params: Promise.resolve({ id }) });

async function main(): Promise<void> {
  for (const u of USERS) await ensureUser(u.email, u.orgId);
  const tokenA = await signIn("user-a@manfriday-demo.com");
  const tokenB = await signIn("user-b@manfriday-demo.com");
  const A = { Authorization: `Bearer ${tokenA}`, "Content-Type": "application/json" };
  const B = { Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" };
  const reqA = (url: string, method: string, body?: unknown) =>
    new Request(url, { method, headers: A, body: body === undefined ? undefined : JSON.stringify(body) });
  const reqB = (url: string, method: string, body?: unknown) =>
    new Request(url, { method, headers: B, body: body === undefined ? undefined : JSON.stringify(body) });

  console.log(`provider mode: ${getEmailProvider().mode}${getEmailProvider().mode === "dry-run" ? " (set RESEND_API_KEY for the real Resend test path)" : ""}\n`);

  // ── Setup: a requisition + 3 candidates (2 opted-in, 1 pending) in org A ─────────────
  const reqRes = await reqPOST(reqA("http://local/api/v1/requisitions", "POST", { title: `Campaign Req ${stamp}`, jd_text: "Backend engineer. Python, PostgreSQL." }));
  const reqId = ((await reqRes.json()) as { id: string }).id;

  const mk = async (label: string, consent: string): Promise<string> => {
    const r = await candidatesPOST(reqA("http://local/api/v1/candidates", "POST", {
      name: `Camp ${label} ${stamp}`,
      email: `camp-${label}-${stamp}@example.com`,
      consent_state: consent,
    }));
    return ((await r.json()) as { id: string }).id;
  };
  const opt1 = await mk("opt1", "opted_in");
  const opt2 = await mk("opt2", "opted_in");
  const pend = await mk("pend", "pending");
  check("setup: requisition + 3 candidates created", Boolean(reqId && opt1 && opt2 && pend));

  const audienceOptedIn = async (): Promise<number> =>
    ((await (await audienceGET(reqA("http://local/api/v1/outreach/audience", "GET"))).json()) as { optedIn: number }).optedIn;
  const optedInBefore = await audienceOptedIn();

  // ── 1. Compose → enqueue only consent-eligible candidates (pending excluded) ─────────
  const cRes = await campaignsPOST(reqA("http://local/api/v1/campaigns", "POST", {
    requisition_id: reqId,
    subject: `Hello from ${stamp}`,
    body: "Hi {{first_name}},\n\nWe have a new role for you.\n\nBest,\nThe team",
  }));
  const camp = (await cRes.json()) as { id: string; queued: number };
  check("1. compose campaign for a requisition → 201 + queued recipients", cRes.status === 201 && camp.queued >= 2, `queued ${camp.queued}`);

  const sendRows = await withOrg({ orgId: ORG_A }, (sql) =>
    sql<{ candidate_id: string; status: string }[]>`select candidate_id, status from campaign_send where campaign_id = ${camp.id}`,
  );
  const sendIds = new Set(sendRows.map((r) => r.candidate_id));
  check("2. audience = opted-in only (opt1 & opt2 enqueued)", sendIds.has(opt1) && sendIds.has(opt2));
  check("2. pending candidate NOT enqueued (suppression)", !sendIds.has(pend));

  // ── 3. Process → every queued send becomes 'sent' ────────────────────────────────────
  let lastRemaining = -1;
  let totalSent = 0;
  for (let i = 0; i < 30; i++) {
    const pr = (await (await processPOST(reqA(`http://local/api/v1/campaigns/${camp.id}/process`, "POST"), P(camp.id))).json()) as { sent: number; remaining: number };
    totalSent += pr.sent;
    lastRemaining = pr.remaining;
    if (pr.remaining === 0) break;
  }
  const afterProcess = await withOrg({ orgId: ORG_A }, (sql) =>
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from campaign_send where campaign_id = ${camp.id} group by status`,
  );
  const sentCount = afterProcess.find((r) => r.status === "sent")?.n ?? 0;
  check("3. process drains the queue → all recipients 'sent'", lastRemaining === 0 && sentCount === camp.queued, `sent ${sentCount}/${camp.queued}, totalSent ${totalSent}`);
  const myStatuses = await withOrg({ orgId: ORG_A }, (sql) =>
    sql<{ status: string }[]>`select status from campaign_send where campaign_id = ${camp.id} and candidate_id in (${opt1}, ${opt2})`,
  );
  check("3. opt1 & opt2 sends are 'sent'", myStatuses.length === 2 && myStatuses.every((r) => r.status === "sent"));

  // ── 4. listCampaigns shows the campaign (sent, with recipient count) ─────────────────
  const list = (await (await campaignsGET(reqA("http://local/api/v1/campaigns", "GET"))).json()) as Array<{ id: string; recipients: number; status: string }>;
  const listed = list.find((c) => c.id === camp.id);
  check("4. campaign appears in listCampaigns (sent, recipients)", Boolean(listed) && listed!.status === "sent" && listed!.recipients === camp.queued, `recipients ${listed?.recipients}, status ${listed?.status}`);

  // ── 5. Unsubscribe (public, signed token) → consent flips + drops from audience ──────
  const token = signUnsub(ORG_A, opt1);
  const unsubRes = await unsubGET(new Request(`http://local/api/v1/unsubscribe?token=${encodeURIComponent(token)}`, { method: "GET" }));
  const detail = (await (await candidateGET(reqA(`http://local/api/v1/candidates/${opt1}`, "GET"), P(opt1))).json()) as { consent_state: string };
  check("5. valid unsubscribe token → 200", unsubRes.status === 200);
  check("5. unsubscribed candidate consent_state = 'unsubscribed'", detail.consent_state === "unsubscribed");
  check("5. opted-in audience count drops by 1", (await audienceOptedIn()) === optedInBefore - 1, `optedIn ${optedInBefore} → ${await audienceOptedIn()}`);

  const badRes = await unsubGET(new Request("http://local/api/v1/unsubscribe?token=not-a-valid-token", { method: "GET" }));
  check("5. tampered/invalid token → 400", badRes.status === 400);

  // A NEW campaign must no longer target the unsubscribed candidate.
  const c2 = (await (await campaignsPOST(reqA("http://local/api/v1/campaigns", "POST", { requisition_id: reqId, subject: `Round 2 ${stamp}`, body: "Hi {{first_name}}" }))).json()) as { id: string };
  const c2Ids = new Set((await withOrg({ orgId: ORG_A }, (sql) =>
    sql<{ candidate_id: string }[]>`select candidate_id from campaign_send where campaign_id = ${c2.id}`,
  )).map((r) => r.candidate_id));
  check("5. unsubscribed candidate excluded from the next campaign", !c2Ids.has(opt1) && c2Ids.has(opt2));

  // ── 6. RLS: org B cannot see org A's campaigns, and cannot write into org A ──────────
  const listB = (await (await campaignsGET(reqB("http://local/api/v1/campaigns", "GET"))).json()) as Array<{ id: string }>;
  check("6. org B (real JWT) cannot see org A's campaign", !listB.some((c) => c.id === camp.id), `org B sees ${listB.length} campaign(s)`);
  const bSeesA = await withOrg({ orgId: ORG_B }, (sql) =>
    sql<{ n: number }[]>`select count(*)::int as n from campaign where id = ${camp.id}`,
  );
  const bSeesSends = await withOrg({ orgId: ORG_B }, (sql) =>
    sql<{ n: number }[]>`select count(*)::int as n from campaign_send where campaign_id = ${camp.id}`,
  );
  check("6. org B targeted read of org A's campaign/sends returns 0", (bSeesA[0]?.n ?? -1) === 0 && (bSeesSends[0]?.n ?? -1) === 0);
  let blocked = false;
  try {
    await withOrg({ orgId: ORG_B }, (sql) =>
      sql`insert into campaign (org_id, requisition_id, subject, body) values (${ORG_A}, ${reqId}, 'x', 'y')`,
    );
  } catch {
    blocked = true;
  }
  check("6. org B cannot insert a campaign scoped to org A (WITH CHECK)", blocked);

  const { closeSql } = await import("@manfriday/db");
  await closeSql();
  console.log(fail === 0 ? "\nMASS-EMAIL PROOF: PASS — compose → enqueue (consent-only) → send → list → unsubscribe → org-isolated." : `\nMASS-EMAIL PROOF: FAIL (${fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  try {
    const { closeSql } = await import("@manfriday/db");
    await closeSql();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
