// GET /api/v1/team — the org's users (display TeamMember[]), from app_user + membership.
// RLS-scoped.

import { NextResponse } from "next/server";
import { withOrg } from "@manfriday/db";

import { getOrgCtx } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MemberRow {
  id: string;
  email: string;
  status: string;
  role_key: string | null;
}

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;

  const rows = await withOrg({ orgId: ctx.orgId, role: ctx.role }, (sql) =>
    sql<MemberRow[]>`
      select u.id, u.email, u.status, r.key as role_key
      from app_user u
      left join membership m on m.user_id = u.id
      left join role r on r.id = m.role_id
      where u.deleted_at is null
      order by u.created_at`,
  );
  const out = rows.map((m) => ({
    id: m.id,
    name: "", // display name not modeled on app_user yet
    email: m.email,
    role: m.role_key === "agency_admin" ? "Admin" : "Recruiter",
    status: m.status === "invited" ? "invited" : "active",
    twoFactor: false,
  }));
  return NextResponse.json(out);
}
