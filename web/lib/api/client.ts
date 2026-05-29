import type { paths } from "@manfriday/contracts";

// Phase 0 seam demo. This proves the contract → TS type linkage end to end:
// `@manfriday/contracts` exposes types generated from the OpenAPI 3.1 spec, and
// the BFF consumes them with zero hand-maintained duplication.
//
// The full generated fetch/tRPC client and the CI drift gate that asserts these
// types match FastAPI's emitted spec land in WP 0.12. No live calls happen yet.
export type HealthResponse =
  paths["/health"]["get"]["responses"]["200"]["content"]["application/json"];

export const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL ?? "http://localhost:8000";
