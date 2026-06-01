// Live upload + parse + storage proof (task item 2). Signs in org A, creates a candidate,
// uploads a text résumé through the real route handler → bytes land in Supabase Storage
// (org-prefixed), the deterministic parser extracts skills/experience, and the immutable
// resume row is created. Then reads it back and confirms the Storage object exists.

import { createClient } from "@supabase/supabase-js";

import { POST as candidatesPOST } from "../app/api/v1/candidates/route";
import { GET as candidateDetailGET } from "../app/api/v1/candidates/[id]/route";
import { POST as resumesPOST } from "../app/api/v1/candidates/[id]/resumes/route";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const ORG_A = "00000000-0000-0000-0000-00000000a000";

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

const RESUME = `Jane Doe
jane.doe@example.com  (415) 555-2671
Senior Backend Engineer — 2016 to present
10 years of experience building distributed systems.
Skills: Python, PostgreSQL, AWS, Docker, Kubernetes, Kafka
Portfolio: https://janedoe.dev`;

const TOKEN = await signIn("user-a@manfriday-demo.com", "***REMOVED***");
const authed = (body?: unknown) =>
  new Request("http://local/api/v1", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

// 1. Create a candidate.
const createRes = await candidatesPOST(authed({ name: "Jane Doe", email: "jane.doe@example.com", consent_state: "opted_in" }));
const { id: candId } = (await createRes.json()) as { id: string };
console.log(`created candidate ${candId} [${createRes.status}]`);

// 2. Upload a résumé (base64 JSON) through the real handler → Storage + parse.
const b64 = Buffer.from(RESUME, "utf8").toString("base64");
const upReq = new Request(`http://local/api/v1/candidates/${candId}/resumes`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ filename: "jane.txt", content_type: "text/plain", content_b64: b64 }),
});
const upRes = await resumesPOST(upReq, { params: Promise.resolve({ id: candId }) });
const up = await upRes.json();
console.log(`upload+parse [${upRes.status}]: ${JSON.stringify(up)}`);

// 3. Read back the candidate detail → parsed skills/experience + résumé version.
const detRes = await candidateDetailGET(new Request("http://local", { headers: { Authorization: `Bearer ${TOKEN}` } }), {
  params: Promise.resolve({ id: candId }),
});
const det = (await detRes.json()) as { skills: string[]; experience_years: number | null; resumes: unknown[] };
console.log(`candidate detail [${detRes.status}]: skills=${JSON.stringify(det.skills)} experience_years=${det.experience_years} resume_versions=${det.resumes.length}`);

// 4. Confirm the object is in Supabase Storage under the org-prefixed path.
const svc = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const { data: objs, error } = await svc.storage.from("resumes").list(`${ORG_A}/${candId}`);
if (error) throw new Error(`storage list -> ${error.message}`);
console.log(`Supabase Storage resumes/${ORG_A.slice(0, 8)}…/${candId.slice(0, 8)}…: ${objs?.length ?? 0} object(s) [${objs?.map((o) => o.name.slice(0, 12) + "…").join(", ")}]`);

const ok =
  upRes.status === 200 &&
  Array.isArray(up.skills_found ? det.skills : det.skills) &&
  det.skills.includes("Python") &&
  det.skills.includes("Kubernetes") &&
  det.experience_years === 10 &&
  (objs?.length ?? 0) >= 1;
console.log(ok ? "\nOK: résumé stored in Supabase Storage (org-prefixed) + parsed deterministically + versioned." : "\nUPLOAD PROOF FAILED");
process.exit(ok ? 0 : 1);
