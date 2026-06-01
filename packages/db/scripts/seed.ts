// Seed two synthetic orgs (A and B) with users, candidates, résumés, a requisition,
// and a proposal — the fixtures the isolation test and the dashboard slice prove
// against. Runs as the OWNER/superuser connection (DATABASE_URL_ADMIN) so it can
// insert rows for BOTH orgs (RLS WITH CHECK would block a single-org app role from
// writing another org's rows — which is exactly the isolation we test elsewhere).
//
// Synthetic data only. Idempotent: deletes the two fixed orgs first (FK cascade).

import postgres from "postgres";

export const ORG_A = "00000000-0000-0000-0000-00000000a000";
export const ORG_B = "00000000-0000-0000-0000-00000000b000";

const CAND_A1 = "00000000-0000-0000-0000-0000000a0001";

interface SeedCandidate {
  id: string;
  name: string;
  email: string;
  status: string;
  consent: string;
  skills: string[];
  years: number;
}

const ORG_A_CANDIDATES: SeedCandidate[] = [
  { id: CAND_A1, name: "Amara Okafor", email: "amara@a.test", status: "screening", consent: "opted_in", skills: ["Python", "PostgreSQL", "AWS"], years: 9 },
  { id: "00000000-0000-0000-0000-0000000a0002", name: "Devin Park", email: "devin@a.test", status: "contacted", consent: "opted_in", skills: ["TypeScript", "React", "Next.js"], years: 7 },
  { id: "00000000-0000-0000-0000-0000000a0003", name: "Lena Vasquez", email: "lena@a.test", status: "new", consent: "pending", skills: ["Python", "Kafka"], years: 5 },
];

const ORG_B_CANDIDATES: SeedCandidate[] = [
  { id: "00000000-0000-0000-0000-0000000b0001", name: "Wei Chen", email: "wei@b.test", status: "submitted", consent: "opted_in", skills: ["Python", "AppSec"], years: 8 },
  { id: "00000000-0000-0000-0000-0000000b0002", name: "Sofia Marchetti", email: "sofia@b.test", status: "new", consent: "unsubscribed", skills: ["Figma"], years: 4 },
];

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("seed: set DATABASE_URL_ADMIN (owner/superuser connection).");
  const sql = postgres(adminUrl, { max: 1, prepare: false, onnotice: () => {} });

  try {
    await sql.begin(async (tx) => {
      // Clean slate for the two fixture orgs (cascades to all children).
      await tx`delete from public.organization where id in (${ORG_A}, ${ORG_B})`;

      const recruiter = (await tx<{ id: string }[]>`select id from public.role where key = 'recruiter'`)[0];
      if (!recruiter) throw new Error("seed: role 'recruiter' missing — run migrate first");

      for (const [orgId, orgName, candidates] of [
        [ORG_A, "Acme Staffing", ORG_A_CANDIDATES] as const,
        [ORG_B, "Beacon Talent", ORG_B_CANDIDATES] as const,
      ]) {
        await tx`insert into public.organization (id, name) values (${orgId}, ${orgName})`;

        const user = (await tx<{ id: string }[]>`
          insert into public.app_user (org_id, email)
          values (${orgId}, ${"recruiter@" + orgName.split(" ")[0]!.toLowerCase() + ".test"})
          returning id`)[0]!;
        await tx`insert into public.membership (org_id, user_id, role_id)
                 values (${orgId}, ${user.id}, ${recruiter.id})`;

        for (const c of candidates) {
          await tx`insert into public.candidate (id, org_id, name, email, status, consent_state, consent_source)
                   values (${c.id}, ${orgId}, ${c.name}, ${c.email}, ${c.status}, ${c.consent},
                           ${c.consent === "opted_in" ? "seed-form" : null})`;
          await tx`insert into public.resume
                     (org_id, candidate_id, version, content_hash, storage_uri, content_type, parsed_jsonb, is_current)
                   values (${orgId}, ${c.id}, 1, ${"hash-" + c.id}, ${"seed://" + c.id + "/1"},
                           ${"application/pdf"},
                           ${tx.json({ skills: c.skills, total_experience_years: c.years, contact: { has_email: true, has_phone: false } })},
                           true)`;
        }
      }

      // Org A gets a requisition + rubric + a proposal (Org B stays req-less so the
      // dashboard counts differ between the two orgs).
      const req = (await tx<{ id: string }[]>`
        insert into public.requisition (org_id, title, location, employment_type, status, jd_text)
        values (${ORG_A}, ${"Senior Backend Engineer"}, ${"Austin, TX"}, ${"full_time"}, ${"open"},
                ${"We need a senior backend engineer strong in Python and PostgreSQL on AWS."})
        returning id`)[0]!;
      await tx`insert into public.jd_skill (org_id, requisition_id, name, tier, weight, sort_order) values
        (${ORG_A}, ${req.id}, 'Python',     'core', 0.9, 0),
        (${ORG_A}, ${req.id}, 'PostgreSQL', 'core', 0.8, 1),
        (${ORG_A}, ${req.id}, 'AWS',        'nice', 0.5, 2)`;
      await tx`insert into public.proposal (org_id, candidate_id, requisition_id, outcome)
               values (${ORG_A}, ${CAND_A1}, ${req.id}, 'interviewing')`;

      await tx`insert into public.audit_event (org_id, action, entity_type) values
        (${ORG_A}, 'seed.created', 'organization'),
        (${ORG_B}, 'seed.created', 'organization')`;
    });

    console.log("seeded:");
    console.log(`  ORG_A (Acme Staffing)  = ${ORG_A}  → 3 candidates, 1 open req, 1 proposal`);
    console.log(`  ORG_B (Beacon Talent)  = ${ORG_B}  → 2 candidates, 0 reqs`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
