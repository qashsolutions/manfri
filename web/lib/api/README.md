# `web/lib/api` — typed BFF → FastAPI client

The cross-language seam is **REST + OpenAPI 3.1**. FastAPI's emitted spec is the
single source of truth; [`openapi-typescript`](../../../packages/contracts) turns
it into TS types that this layer consumes — explainability fields
(`model_id`, `prompt_version`, `score_version`, `trace_id`) are part of the
contract, not log lines.

- `client.ts` — Phase 0 seam demo: imports generated types from `@manfriday/contracts`.
- **WP 0.12** fleshes this out: the generated fetch client + a **CI drift gate**
  that fails the build if the committed types diverge from FastAPI's spec.
