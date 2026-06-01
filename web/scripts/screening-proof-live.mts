// Live proof: getMatchDetail (the /screening data) returns exactly 5 SIMPLE + 5 MEDIUM +
// 5 HARD questions, each with a model answer key, grounded in a real candidate + JD for a
// logged-in org user. Without a Gemini key this is the deterministic fallback; with a key
// the same shape is LLM-authored (Gemini). Calls the actual screening route handler.

import { GET as screeningGET } from "../app/api/v1/screening/route";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const AI_ON = Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY);

async function token(): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user-a@manfriday-demo.com", password: "Manfriday-Test-9f3c2a" }),
  });
  if (!res.ok) throw new Error(`sign-in -> ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

interface Q { tier: string; q: string; answer: string }
interface MatchDetail {
  candidate: string;
  req: string;
  coreSkills: string[];
  niceSkills: string[];
  subScores: Array<{ label: string; weight: number; score: number; evidence: string }>;
  reviewFlags: Array<{ severity: string; label: string; detail: string }>;
  questions: Q[];
}

const TOKEN = await token();
const res = await screeningGET(new Request("http://local/api/v1/screening", { headers: { Authorization: `Bearer ${TOKEN}` } }));
const m = (await res.json()) as MatchDetail;

console.log(`getMatchDetail [${res.status}]  generator=${AI_ON ? "Gemini (LLM)" : "deterministic fallback (no key)"}`);
console.log(`candidate: ${m.candidate}   req: ${m.req}`);
console.log(`coreSkills: ${JSON.stringify(m.coreSkills)}   niceSkills: ${JSON.stringify(m.niceSkills)}`);
console.log(`subScores: ${m.subScores.map((s) => `${s.label}=${s.score}(w${s.weight})`).join(", ")}`);
console.log(`reviewFlags: ${m.reviewFlags.map((f) => f.label).join(", ") || "(none)"}`);

const tiers = { Simple: 0, Medium: 0, Hard: 0 } as Record<string, number>;
for (const q of m.questions) tiers[q.tier] = (tiers[q.tier] ?? 0) + 1;
console.log(`\nquestions: ${m.questions.length} total — Simple=${tiers.Simple}, Medium=${tiers.Medium}, Hard=${tiers.Hard}`);
for (const tier of ["Simple", "Medium", "Hard"]) {
  const q = m.questions.find((x) => x.tier === tier);
  if (q) console.log(`  • [${tier}] ${q.q}\n      ↳ answer key: ${q.answer}`);
}

const skillTerms = [...m.coreSkills, ...m.niceSkills].map((s) => s.toLowerCase());
const grounded = m.questions.some((q) => skillTerms.some((s) => q.q.toLowerCase().includes(s)));

let fail = 0;
const check = (label: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fail++;
};
check("status 200", res.status === 200);
check("exactly 15 questions", m.questions.length === 15);
check("5 SIMPLE / 5 MEDIUM / 5 HARD", tiers.Simple === 5 && tiers.Medium === 5 && tiers.Hard === 5);
check("every question has a non-empty answer key", m.questions.every((q) => typeof q.answer === "string" && q.answer.length > 0));
check("questions grounded in the JD/résumé skills", grounded);
check("subScores are the transparent 0.8/0.2 split", m.subScores.length === 2 && m.subScores[0]?.weight === 0.8 && m.subScores[1]?.weight === 0.2);

console.log(fail === 0 ? "\nSCREENING PROOF: PASS — 5/5/5 questions + answer keys, grounded, via getMatchDetail." : `\nSCREENING PROOF: FAIL (${fail})`);
process.exit(fail === 0 ? 0 : 1);
