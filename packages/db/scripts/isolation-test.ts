// Cross-tenant leak probe (ports the Python leak-probe intent to the Supabase
// RLS-on-JWT-claim model). Connects as the RLS-subject app role (DATABASE_URL =
// manfriday_authenticated) and proves:
//   1. org A sees only org A's candidates;
//   2. org B sees only org B's — and NONE of org A's;
//   3. with no org claim set, zero rows are visible;
//   4. org B cannot WRITE a row into org A (RLS WITH CHECK blocks it).
// Run after migrate + seed. Exit code 1 on any failure.

import { closeSql, getSql, withOrg } from "../src/client";

const ORG_A = "00000000-0000-0000-0000-00000000a000";
const ORG_B = "00000000-0000-0000-0000-00000000b000";
const CAND_A1 = "00000000-0000-0000-0000-0000000a0001";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
}

async function main(): Promise<void> {
  // 1. Org A sees only its own candidates.
  const aRows = await withOrg({ orgId: ORG_A }, (sql) =>
    sql<{ id: string; org_id: string }[]>`select id, org_id from candidate`,
  );
  check("org A sees only org-A candidates", aRows.length === 3 && aRows.every((r) => r.org_id === ORG_A),
    `count=${aRows.length}, distinct orgs=${[...new Set(aRows.map((r) => r.org_id))].length}`);

  // 2. Org B sees only its own — and none of A's (incl. A's known candidate id).
  const bRows = await withOrg({ orgId: ORG_B }, (sql) =>
    sql<{ id: string; org_id: string }[]>`select id, org_id from candidate`,
  );
  const bLeaksA = bRows.some((r) => r.org_id === ORG_A || r.id === CAND_A1);
  check("org B sees only org-B candidates", bRows.length === 2 && bRows.every((r) => r.org_id === ORG_B),
    `count=${bRows.length}`);
  check("org B cannot see org A's rows", !bLeaksA);

  const bSeesA1 = await withOrg({ orgId: ORG_B }, (sql) =>
    sql<{ n: number }[]>`select count(*)::int as n from candidate where id = ${CAND_A1}`,
  );
  check("org B targeted read of org A's candidate returns 0", (bSeesA1[0]?.n ?? -1) === 0);

  // 3. No org claim ⇒ zero rows.
  const noClaim = await getSql().begin((tx) =>
    tx<{ n: number }[]>`select count(*)::int as n from candidate`,
  );
  check("no org claim ⇒ 0 rows visible", (noClaim[0]?.n ?? -1) === 0);

  // 4. Org B cannot WRITE into org A (RLS WITH CHECK).
  let blocked = false;
  try {
    await withOrg({ orgId: ORG_B }, (sql) =>
      sql`insert into candidate (org_id, name) values (${ORG_A}, ${"injected"})`,
    );
  } catch {
    blocked = true;
  }
  check("org B cannot insert a row scoped to org A (WITH CHECK)", blocked);

  await closeSql();
  console.log(failures === 0 ? "\nISOLATION TEST: PASS (0 leaks)" : `\nISOLATION TEST: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await closeSql();
  process.exit(1);
});
