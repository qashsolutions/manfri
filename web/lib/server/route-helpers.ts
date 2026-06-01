// Shared route-handler helpers: resolve the org from the request (verified Supabase
// session / Bearer / gated dev override) and turn an OrgContextError into a 401.

import { NextResponse } from "next/server";

import { OrgContextError, resolveOrgContext, type OrgContext } from "@/lib/server/org-context";

export async function getOrgCtx(req: Request): Promise<OrgContext | NextResponse> {
  try {
    return await resolveOrgContext(req);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 422 });
}

export function notFound(message = "not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}
