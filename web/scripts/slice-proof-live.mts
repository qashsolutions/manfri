// Live logged-in slice proof (part 3b). Signs in the two synthetic users against the
// real Supabase project (GoTrue password grant), then calls the actual route handlers
// with each user's REAL access token as a Bearer. The handler verifies the token via
// Supabase Auth, derives org_id from it, and returns live, RLS-scoped data — proving
// getStats + /candidates work for a logged-in user through the real session.
//
// Run from web/ with the Supabase env + DATABASE_URL (manfriday_authenticated) loaded.

import { GET as candidatesGET } from "../app/api/v1/candidates/route";
import { GET as statsGET } from "../app/api/v1/stats/route";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const PW = "***REMOVED***";

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  if (!res.ok) throw new Error(`sign-in ${email} -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

function authedReq(token: string): Request {
  return new Request("http://local/api/v1", { headers: { Authorization: `Bearer ${token}` } });
}

async function slice(label: string, token: string) {
  const sRes = await statsGET(authedReq(token));
  const cRes = await candidatesGET(authedReq(token));
  const stats = await sRes.json();
  const cands = (await cRes.json()) as Array<{ name: string }>;
  console.log(`\n[${label}] logged in via REAL Supabase JWT (Authorization: Bearer)`);
  console.log(`  GET /api/v1/stats      → ${sRes.status}  ${JSON.stringify(stats)}`);
  console.log(`  GET /api/v1/candidates → ${cRes.status}  (${cands.length})  ${cands.map((c) => c.name).join(", ")}`);
  return { status: sRes.status, stats, cands };
}

const tokenA = await signIn("user-a@manfriday-demo.com");
const tokenB = await signIn("user-b@manfriday-demo.com");
const a = await slice("ORG A — Acme", tokenA);
const b = await slice("ORG B — Beacon", tokenB);

const ok =
  a.status === 200 &&
  b.status === 200 &&
  a.cands.length === 3 &&
  b.cands.length === 2 &&
  JSON.stringify(a.cands) !== JSON.stringify(b.cands);

console.log(
  ok
    ? "\nOK: getStats + listCandidates return LIVE, org-scoped data for a logged-in user via the real Supabase session."
    : "\nslice proof FAILED",
);
process.exit(ok ? 0 : 1);
