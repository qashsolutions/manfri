// Tear down the synthetic demo Supabase Auth users (Admin API). They are a recreatable
// test fixture — `packages/db/scripts/supabase-auth-proof.ts` recreates them on demand
// (with a SEED_USER_PASSWORD from env). Deleting them makes any leaked fixture password
// unusable. Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const EMAILS = ["user-a@manfriday-demo.com", "user-b@manfriday-demo.com"];

const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

const list = await fetch(`${URL_}/auth/v1/admin/users?per_page=200`, { headers });
if (!list.ok) throw new Error(`admin list -> ${list.status} ${await list.text()}`);
const users = ((await list.json()) as { users?: Array<{ id: string; email: string }> }).users ?? [];

for (const email of EMAILS) {
  const u = users.find((x) => x.email?.toLowerCase() === email.toLowerCase());
  if (!u) {
    console.log(`• ${email}: not present (already gone)`);
    continue;
  }
  const del = await fetch(`${URL_}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers });
  console.log(`• ${email} (${u.id.slice(0, 8)}…): DELETE -> ${del.status}`);
}
console.log("done — synthetic demo auth users removed; the fixture password is now unusable.");
process.exit(0);
