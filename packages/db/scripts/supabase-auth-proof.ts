// REAL Supabase Auth proof (parts 2 seed + 3a). Against the live project:
//   1. ensure two Auth users exist (Admin API) with app_metadata.org_id + org_role;
//   2. link each to its seeded app_user row (auth_user_id);
//   3. sign each in via GoTrue password grant (real JWT) and show the org_id claim;
//   4. query /rest/v1/candidate as each user through PostgREST so RLS runs on the
//      verified JWT — proving org A's user sees only org A, org B only org B, neither
//      the other, and a cross-org write is blocked by RLS WITH CHECK.
//
// Needs (from env): SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, the anon key, the
// service_role key, and DATABASE_URL_ADMIN (to link auth_user_id). Synthetic data only.

import postgres from "postgres";

const URL_ = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_DB = process.env.DATABASE_URL_ADMIN;
if (!URL_ || !ANON || !SERVICE || !ADMIN_DB) {
  throw new Error("supabase-auth-proof: need SUPABASE_URL, anon key, service_role key, DATABASE_URL_ADMIN");
}

const ORG_A = "00000000-0000-0000-0000-00000000a000";
const ORG_B = "00000000-0000-0000-0000-00000000b000";
const PW = "Manfriday-Test-" + "9f3c2a"; // fixed dev password for the two synthetic users
const USERS = [
  { email: "user-a@manfriday-demo.com", orgId: ORG_A, label: "ORG A (Acme)" },
  { email: "user-b@manfriday-demo.com", orgId: ORG_B, label: "ORG B (Beacon)" },
];

let failures = 0;
const check = (label: string, ok: boolean, detail = ""): void => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

const authHeaders = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

async function findUserByEmail(email: string): Promise<{ id: string } | null> {
  const res = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers: authHeaders(SERVICE!) });
  if (!res.ok) throw new Error(`admin list users -> ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { users?: Array<{ id: string; email: string }> };
  const users = body.users ?? [];
  return users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureUser(email: string, orgId: string): Promise<string> {
  const appMeta = { org_id: orgId, org_role: "recruiter" };
  const existing = await findUserByEmail(email);
  if (existing) {
    const res = await fetch(`${URL_}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: authHeaders(SERVICE!),
      body: JSON.stringify({ password: PW, email_confirm: true, app_metadata: appMeta }),
    });
    if (!res.ok) throw new Error(`admin update user -> ${res.status} ${await res.text()}`);
    return existing.id;
  }
  const res = await fetch(`${URL_}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeaders(SERVICE!),
    body: JSON.stringify({ email, password: PW, email_confirm: true, app_metadata: appMeta }),
  });
  if (!res.ok) throw new Error(`admin create user -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON!, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW }),
  });
  if (!res.ok) throw new Error(`sign-in ${email} -> ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

function decodeClaims(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
}

async function selectCandidates(token: string): Promise<Array<{ id: string; org_id: string; name: string | null }>> {
  const res = await fetch(`${URL_}/rest/v1/candidate?select=id,org_id,name`, {
    headers: { apikey: ANON!, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`rest select -> ${res.status} ${await res.text()}`);
  return (await res.json()) as Array<{ id: string; org_id: string; name: string | null }>;
}

async function tryCrossOrgInsert(token: string, otherOrg: string): Promise<number> {
  const res = await fetch(`${URL_}/rest/v1/candidate`, {
    method: "POST",
    headers: { apikey: ANON!, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ org_id: otherOrg, name: "injected-cross-org" }),
  });
  return res.status; // RLS WITH CHECK violation ⇒ 403/401, not 2xx
}

async function main(): Promise<void> {
  const sql = postgres(ADMIN_DB!, { max: 1, prepare: false, onnotice: () => {} });
  const ids: Record<string, string> = {};
  try {
    for (const u of USERS) {
      const id = await ensureUser(u.email, u.orgId);
      ids[u.email] = id;
      // Link to the seeded app_user (one per org) so the access-token hook would also work.
      await sql`update app_user set auth_user_id = ${id} where org_id = ${u.orgId}`;
      console.log(`auth user ${u.email} (${u.label}) → id ${id.slice(0, 8)}…, linked to app_user`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  const tokens: Record<string, string> = {};
  for (const u of USERS) {
    const token = await signIn(u.email);
    tokens[u.email] = token;
    const claims = decodeClaims(token);
    const appMeta = (claims.app_metadata ?? {}) as Record<string, unknown>;
    console.log(`\n${u.label} signed in. JWT role=${claims.role}, app_metadata.org_id=${appMeta.org_id}`);
    check(`${u.label}: JWT carries correct org_id`, appMeta.org_id === u.orgId);
  }

  console.log("\n── PostgREST queries under each real JWT (RLS enforced by Supabase) ──");
  const aRows = await selectCandidates(tokens["user-a@manfriday-demo.com"]!);
  const bRows = await selectCandidates(tokens["user-b@manfriday-demo.com"]!);
  console.log(`ORG A user sees ${aRows.length} candidates: ${aRows.map((r) => r.name).join(", ")}`);
  console.log(`ORG B user sees ${bRows.length} candidates: ${bRows.map((r) => r.name).join(", ")}`);

  check("ORG A user sees only org-A candidates", aRows.length === 3 && aRows.every((r) => r.org_id === ORG_A));
  check("ORG B user sees only org-B candidates", bRows.length === 2 && bRows.every((r) => r.org_id === ORG_B));
  check("ORG B user sees none of org A's rows", !bRows.some((r) => r.org_id === ORG_A));

  const crossStatus = await tryCrossOrgInsert(tokens["user-b@manfriday-demo.com"]!, ORG_A);
  check("ORG B user cannot write into org A (RLS WITH CHECK)", crossStatus >= 400, `POST status ${crossStatus}`);

  console.log(failures === 0 ? "\nLIVE AUTH+RLS PROOF: PASS (0 leaks, real Supabase JWTs)" : `\nLIVE AUTH+RLS PROOF: FAIL (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
