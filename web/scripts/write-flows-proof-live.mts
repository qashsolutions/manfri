// Round-trip proof for the 6 wired write flows, against LIVE Supabase as the logged-in
// org-A recruiter. Each server action is a thin wrapper that calls the matching /api/v1
// route (forwarding the session cookie) then revalidates; here we exercise those SAME
// routes with a real Supabase JWT and assert the read reflects the write — proving the
// create→list / upload→parse / JD→skills / consent→audience / proposal→history /
// reweight→re-rank loops the UI controls drive.

import { GET as candidateGET } from "../app/api/v1/candidates/[id]/route";
import { POST as consentPOST } from "../app/api/v1/candidates/[id]/consent/route";
import { POST as uploadPOST } from "../app/api/v1/candidates/[id]/resumes/route";
import { GET as candidatesGET, POST as candidatesPOST } from "../app/api/v1/candidates/route";
import { GET as audienceGET } from "../app/api/v1/outreach/audience/route";
import { GET as proposalsGET, POST as proposalsPOST } from "../app/api/v1/proposals/route";
import { GET as completenessGET } from "../app/api/v1/requisitions/[id]/completeness/route";
import { POST as extractPOST } from "../app/api/v1/requisitions/[id]/extract-skills/route";
import { GET as matchesGET } from "../app/api/v1/requisitions/[id]/matches/route";
import { GET as skillsGET, PUT as skillsPUT } from "../app/api/v1/requisitions/[id]/skills/route";
import { POST as reqPOST } from "../app/api/v1/requisitions/route";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const PW = process.env.SEED_USER_PASSWORD as string;

async function signIn(): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user-a@manfriday-demo.com", password: PW }),
  });
  if (!res.ok) throw new Error(`sign-in -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const RESUME = `Wire Test\nwire@example.com (415) 555-7788\nSenior Backend Engineer 2018 - 2024\n6 years experience.\nSkills: Python, PostgreSQL, AWS, Kafka, Docker`;
const JD_TEXT = "Senior Backend Engineer. Must have Python, PostgreSQL, AWS and Kafka; strong distributed systems. Docker a plus.";

let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) fail++;
};

const TOKEN = await signIn();
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
const jreq = (url: string, method: string, body?: unknown) =>
  new Request(url, { method, headers: H, body: body === undefined ? undefined : JSON.stringify(body) });
const P = (id: string) => ({ params: Promise.resolve({ id }) });
const stamp = Date.now().toString().slice(-6);

// 1. create candidate → appears in list
const cRes = await candidatesPOST(jreq("http://local/api/v1/candidates", "POST", { name: `Wire Test ${stamp}`, email: `wire-${stamp}@example.com`, consent_state: "pending" }));
const { id: candId } = (await cRes.json()) as { id: string };
const list = (await (await candidatesGET(jreq("http://local/api/v1/candidates", "GET"))).json()) as Array<{ id: string }>;
check("1. create candidate → appears in /candidates list", cRes.status === 201 && list.some((c) => c.id === candId), `id ${candId.slice(0, 8)}…, list has ${list.length}`);

// 2. upload résumé → parsed + versioned
const up = await uploadPOST(jreq(`http://local/api/v1/candidates/${candId}/resumes`, "POST", { filename: "wire.txt", content_type: "text/plain", content_b64: Buffer.from(RESUME, "utf8").toString("base64") }), P(candId));
const det = (await (await candidateGET(jreq("http://local", "GET"), P(candId))).json()) as { resumes: unknown[]; skills: string[] };
check("2. upload résumé → stored, parsed, versioned", up.status === 200 && det.resumes.length >= 1 && det.skills.includes("Python") && det.skills.includes("Kafka"), `v=${det.resumes.length}, skills=${JSON.stringify(det.skills)}`);

// 3. create requisition + JD → skills extracted + completeness
const rRes = await reqPOST(jreq("http://local/api/v1/requisitions", "POST", { title: `Backend ${stamp}`, jd_text: JD_TEXT }));
const { id: reqId } = (await rRes.json()) as { id: string };
const { suggested } = (await (await extractPOST(jreq("http://local", "POST"), P(reqId))).json()) as { suggested: unknown[] };
await skillsPUT(jreq("http://local", "PUT", { skills: suggested }), P(reqId));
const skills = (await (await skillsGET(jreq("http://local", "GET"), P(reqId))).json()) as Array<{ tier: string }>;
const comp = (await (await completenessGET(jreq("http://local", "GET"), P(reqId))).json()) as { score: number; items: Array<{ label: string; present: boolean }> };
check("3. create requisition + JD → CORE/NICE skills extracted", rRes.status === 201 && skills.length > 0 && skills.some((s) => s.tier === "core"), `${skills.length} skills`);
check("   completeness reflects extracted skills", comp.score > 0 && (comp.items.find((i) => i.label === "core_skills")?.present ?? false), `score ${comp.score}`);

// 4. record consent → audience optedIn increases
const before = (await (await audienceGET(jreq("http://local", "GET"))).json()) as { optedIn: number };
await consentPOST(jreq(`http://local/api/v1/candidates/${candId}/consent`, "POST", { event: "opted_in" }), P(candId));
const after = (await (await audienceGET(jreq("http://local", "GET"))).json()) as { optedIn: number };
check("4. record consent → outreach audience optedIn +1", after.optedIn === before.optedIn + 1, `optedIn ${before.optedIn} → ${after.optedIn}`);

// 5. create proposal → shows in history
const pRes = await proposalsPOST(jreq("http://local/api/v1/proposals", "POST", { candidate_id: candId, requisition_id: reqId, outcome: "interviewing" }));
const hist = (await (await proposalsGET(jreq(`http://local/api/v1/proposals?candidate_id=${candId}`, "GET"))).json()) as Array<{ outcome: string }>;
check("5. create proposal → shows in proposal history", pRes.status === 201 && hist.some((h) => h.outcome === "interviewing"), `${hist.length} proposal(s)`);

// 6. reweight skills → matches re-rank (fit changes for the candidate)
const m1 = (await (await matchesGET(jreq(`http://local/api/v1/requisitions/${reqId}/matches?limit=100`, "GET"), P(reqId))).json()) as Array<{ candidateId: string; fit: number }>;
const fit1 = m1.find((x) => x.candidateId === candId)?.fit;
await skillsPUT(jreq("http://local", "PUT", { skills: [{ name: "Python", tier: "core", weight: 1, sort_order: 0 }, { name: "Rust", tier: "core", weight: 1, sort_order: 1 }] }), P(reqId));
const m2 = (await (await matchesGET(jreq(`http://local/api/v1/requisitions/${reqId}/matches?limit=100`, "GET"), P(reqId))).json()) as Array<{ candidateId: string; fit: number }>;
const fit2 = m2.find((x) => x.candidateId === candId)?.fit;
check("6. reweight skills → candidate fit re-ranks", typeof fit1 === "number" && typeof fit2 === "number" && fit1 !== fit2, `fit ${fit1} → ${fit2} (added a CORE skill the candidate lacks)`);

console.log(fail === 0 ? "\nWRITE FLOWS PROOF: PASS — all 6 flows round-trip for the logged-in org user." : `\nWRITE FLOWS PROOF: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
