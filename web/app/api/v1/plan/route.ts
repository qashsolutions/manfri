// GET /api/v1/plan — plan placeholder (display Plan shape). Billing is not wired
// (deferred); the $29/seat is a placeholder. Auth-scoped (no per-org plan rows yet).

import { NextResponse } from "next/server";

import { getOrgCtx } from "@/lib/server/route-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const ctx = await getOrgCtx(req);
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({
    name: "Team",
    price: "$29",
    unit: "/user/mo",
    seatsUsed: 0, // billing not wired (deferred)
    seatsTotal: 0,
    renews: "—",
  });
}
