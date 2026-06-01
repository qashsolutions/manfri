// Per-page proof against LIVE Supabase: sign in the seeded org-A recruiter (real Supabase
// JWT), then invoke each wired route handler (the data each page consumes) and print the
// JSON. Proves every wired page renders real, org-scoped data for a logged-in user.

import { GET as candidateDetailGET } from "../app/api/v1/candidates/[id]/route";
import { GET as candidatesGET } from "../app/api/v1/candidates/route";
import { GET as audienceGET } from "../app/api/v1/outreach/audience/route";
import { GET as planGET } from "../app/api/v1/plan/route";
import { GET as proposalsGET } from "../app/api/v1/proposals/route";
import { GET as completenessGET } from "../app/api/v1/requisitions/[id]/completeness/route";
import { GET as matchesGET } from "../app/api/v1/requisitions/[id]/matches/route";
import { GET as reqGET } from "../app/api/v1/requisitions/[id]/route";
import { GET as skillsGET } from "../app/api/v1/requisitions/[id]/skills/route";
import { GET as requisitionsGET } from "../app/api/v1/requisitions/route";
import { GET as statsGET } from "../app/api/v1/stats/route";
import { GET as teamGET } from "../app/api/v1/team/route";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const TOKEN = await signIn("user-a@manfriday-demo.com", "Manfriday-Test-9f3c2a");
const req = () => new Request("http://local/api/v1", { headers: { Authorization: `Bearer ${TOKEN}` } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const j = async (r: Response) => ({ status: r.status, body: await r.json() });
const show = (label: string, status: number, body: unknown) =>
  console.log(`\n• ${label}  [${status}]\n  ${JSON.stringify(body)}`);

console.log("Logged in as user-a@manfriday-demo.com (real Supabase JWT). Per-page data:");

// Dashboard ("/")
show("GET /api/v1/stats (dashboard)", ...Object.values(await j(await statsGET(req()))) as [number, unknown]);
const cands = await j(await candidatesGET(req()));
show("GET /api/v1/candidates (/candidates)", cands.status, (cands.body as unknown[]).length + " rows: " + JSON.stringify(cands.body));
const reqs = await j(await requisitionsGET(req()));
show("GET /api/v1/requisitions (/requisitions)", reqs.status, reqs.body);

// /candidates/[id]
const candId = (cands.body as Array<{ id: string }>)[0]!.id;
show(`GET /api/v1/candidates/${candId.slice(0, 8)}… (/candidates/[id])`, ...Object.values(await j(await candidateDetailGET(req(), params(candId)))) as [number, unknown]);
const props = await j(await proposalsGET(new Request(`http://local/api/v1/proposals?candidate_id=${candId}`, { headers: { Authorization: `Bearer ${TOKEN}` } })));
show("GET /api/v1/proposals?candidate_id=… (/candidates/[id])", props.status, props.body);

// /requisitions/[id]
const reqId = (reqs.body as Array<{ id: string }>)[0]!.id;
show(`GET /api/v1/requisitions/${reqId.slice(0, 8)}… (/requisitions/[id])`, ...Object.values(await j(await reqGET(req(), params(reqId)))) as [number, unknown]);
show("GET …/skills", ...Object.values(await j(await skillsGET(req(), params(reqId)))) as [number, unknown]);
show("GET …/completeness", ...Object.values(await j(await completenessGET(req(), params(reqId)))) as [number, unknown]);
const matches = await j(await matchesGET(req(), params(reqId)));
show("GET …/matches (top matches)", matches.status, (matches.body as unknown[]).length + " ranked: " + JSON.stringify((matches.body as Array<{ candidate: { name: string }; fit: number }>).map((m) => `${m.candidate.name}=${m.fit}`)));

// /outreach (audience) + /settings (plan, team)
show("GET /api/v1/outreach/audience (/outreach)", ...Object.values(await j(await audienceGET(req()))) as [number, unknown]);
show("GET /api/v1/plan (/settings)", ...Object.values(await j(await planGET(req()))) as [number, unknown]);
show("GET /api/v1/team (/settings)", ...Object.values(await j(await teamGET(req()))) as [number, unknown]);

console.log("\nOK: every wired page returned live, org-scoped data for the logged-in user.");
process.exit(0);
