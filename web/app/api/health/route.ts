import { NextResponse } from "next/server";

// BFF liveness/readiness probe (Phase 0 walking skeleton). The authenticated
// session + internal-JWT minting that front the real FastAPI calls arrive in
// WP 0.10; today this returns a static OK so deploys are verifiable.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", service: "web-bff", phase: 0 });
}
