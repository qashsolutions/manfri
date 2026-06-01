// Proof that the dashboard slice (getStats + listCandidates) returns LIVE, org-scoped
// Supabase/Postgres data THROUGH the new TS route handlers. Invokes the actual
// exported GET handlers with a dev org header for org A and org B and prints both.
//
// Run (after migrate + seed), from web/, e.g.:
//   ALLOW_DEV_ORG_HEADER=1 DATABASE_URL=postgres://manfriday_authenticated:devpass@127.0.0.1:5432/manfriday_dev \
//     pnpm --filter @manfriday/web exec tsx scripts/slice-proof.mts

import { GET as candidatesGET } from "../app/api/v1/candidates/route";
import { GET as statsGET } from "../app/api/v1/stats/route";

const ORG_A = process.env.SEED_ORG_A ?? "00000000-0000-0000-0000-00000000a000";
const ORG_B = process.env.SEED_ORG_B ?? "00000000-0000-0000-0000-00000000b000";

function reqFor(orgId: string): Request {
  return new Request("http://local/api/v1", { headers: { "x-dev-org-id": orgId } });
}

async function slice(label: string, orgId: string) {
  const statsRes = await statsGET(reqFor(orgId));
  const candsRes = await candidatesGET(reqFor(orgId));
  const stats = await statsRes.json();
  const cands = (await candsRes.json()) as Array<{ name: string; skills: string[]; status: string }>;
  console.log(`\n[${label}] org=${orgId}`);
  console.log(`  GET /api/v1/stats      → ${statsRes.status}  ${JSON.stringify(stats)}`);
  console.log(`  GET /api/v1/candidates → ${candsRes.status}  (${cands.length})`);
  for (const c of cands) console.log(`      • ${c.name} [${c.status}] ${JSON.stringify(c.skills)}`);
  return { stats, cands };
}

const a = await slice("ORG A — Acme Staffing", ORG_A);
const b = await slice("ORG B — Beacon Talent", ORG_B);

let ok = true;
if (a.cands.length === 0) { console.error("\nFAIL: org A returned no candidates (is the DB seeded?)"); ok = false; }
if (JSON.stringify(a.cands) === JSON.stringify(b.cands)) {
  console.error("\nFAIL: org A and org B returned identical candidates (RLS not scoping)");
  ok = false;
}
const aNames = new Set(a.cands.map((c) => c.name));
if (b.cands.some((c) => aNames.has(c.name))) { console.error("\nFAIL: org B leaked an org-A candidate"); ok = false; }

console.log(
  ok
    ? "\nOK: getStats + listCandidates return LIVE, org-scoped Supabase data through the route handlers."
    : "\nslice proof FAILED",
);
process.exit(ok ? 0 : 1);
