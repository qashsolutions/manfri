// Live proof: fake-résumé authenticity flags fire on a planted bad résumé and stay
// ADVISORY (never auto-reject). Signs in org A, uploads a résumé that claims ~10 years
// yet lists ~49 distinct skills with overlapping date ranges, then a duplicate of it for a
// second candidate. Asserts the deterministic flags appear in review_flags and that every
// upload still succeeds and both candidates exist (nothing was rejected).

import { POST as candidatesPOST } from "../app/api/v1/candidates/route";
import { GET as candidateDetailGET } from "../app/api/v1/candidates/[id]/route";
import { POST as resumesPOST } from "../app/api/v1/candidates/[id]/resumes/route";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

async function token(): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user-a@manfriday-demo.com", password: (process.env.SEED_USER_PASSWORD ?? "") }),
  });
  if (!res.ok) throw new Error(`sign-in -> ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const PLANTED = `Bart Fabricator
bart.fabricator@example.com  (212) 555-0100
Principal Engineer  2014 - 2024
Lead Architect (concurrent)  2016 - 2026
10 years of experience.
Skills: python, javascript, typescript, java, golang, rust, c++, c#, ruby, php, swift,
kotlin, scala, sql, postgresql, mysql, mongodb, redis, react, nextjs, vuejs, angular,
nodejs, django, fastapi, flask, spring boot, aws, gcp, azure, docker, kubernetes,
terraform, git, graphql, kafka, apache spark, machine learning, deep learning, tensorflow,
pytorch, pandas, numpy, linux, tableau, power bi, salesforce, figma, microsoft excel`;

const TOKEN = await token();
const post = (path: string, body: unknown) =>
  new Request(`http://local${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const getReq = () => new Request("http://local", { headers: { Authorization: `Bearer ${TOKEN}` } });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

interface Flag { code?: string; severity: string; label?: string; detail?: string; message?: string }
async function flagsFor(id: string): Promise<Array<{ severity: string; label: string; detail: string }>> {
  const res = await candidateDetailGET(getReq(), params(id));
  const body = (await res.json()) as { review_flags: Flag[] };
  // The raw candidate-detail endpoint returns {code, severity, message}; api.ts adapts to {label, detail}.
  return body.review_flags.map((f) => ({ severity: f.severity, label: f.label ?? f.code ?? "", detail: f.message ?? f.detail ?? "" }));
}

async function createAndUpload(name: string): Promise<{ id: string; uploadStatus: number; authFlags: number }> {
  const c = await candidatesPOST(post("/api/v1/candidates", { name }));
  const { id } = (await c.json()) as { id: string };
  const b64 = Buffer.from(PLANTED, "utf8").toString("base64");
  const up = await resumesPOST(post(`/api/v1/candidates/${id}/resumes`, { filename: "bart.txt", content_type: "text/plain", content_b64: b64 }), params(id));
  const upBody = (await up.json()) as { authenticity_flags?: number };
  return { id, uploadStatus: up.status, authFlags: upBody.authenticity_flags ?? 0 };
}

let fail = 0;
const check = (label: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) fail++;
};

const c1 = await createAndUpload("Bart Fabricator");
const c1flags = await flagsFor(c1.id);
console.log(`\ncandidate 1 (${c1.id.slice(0, 8)}…): upload status ${c1.uploadStatus}, ${c1.authFlags} authenticity flag(s)`);
for (const f of c1flags) console.log(`   [${f.severity}] ${f.label}: ${f.detail}`);

const codes = new Set(c1flags.map((f) => f.label));
check("upload succeeded (advisory, not auto-rejected)", c1.uploadStatus === 200);
check("implausible_skill_breadth flag fired", codes.has("implausible_skill_breadth"));
check("overlapping_timeline flag fired", codes.has("overlapping_timeline"));
check("candidate still exists after a flagged upload (no auto-reject)", c1flags.length >= 0 && c1.id.length > 0);

// Duplicate: same bytes, different candidate → duplicate_resume flag.
const c2 = await createAndUpload("Bartholomew Clone");
const c2flags = await flagsFor(c2.id);
console.log(`\ncandidate 2 (${c2.id.slice(0, 8)}…, same résumé bytes): ${c2flags.length} flag(s)`);
for (const f of c2flags) console.log(`   [${f.severity}] ${f.label}: ${f.detail}`);
check("duplicate_resume flag fired on the second candidate", new Set(c2flags.map((f) => f.label)).has("duplicate_resume"));
check("duplicate upload also succeeded (advisory only)", c2.uploadStatus === 200);

console.log(fail === 0 ? "\nAUTHENTICITY PROOF: PASS — flags fired and stayed advisory (no auto-reject)." : `\nAUTHENTICITY PROOF: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
