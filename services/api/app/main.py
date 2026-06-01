"""FastAPI entrypoint.

The Phase 0 skeleton (health + auth smoke test) plus the Phase 1 product API:
candidates, résumés, requisitions, deterministic skill-overlap matching, proposals,
and outreach selection. Every product router is RLS-scoped to the verified org
(invariant #3) and carries no opaque scoring, triage automation, or fraud detection
— matching is a transparent weighted sum (invariant #6) and flags are advisory
(invariant #8); a human decides (invariant #1). The explainable screening loop
(LLM-scored fitment, tiered Q&A, GREEN/AMBER/RED) is the later premium phase.

FastAPI's emitted OpenAPI schema is the source of truth for the BFF↔FastAPI
contract; the WP 0.12 drift gate keeps ``packages/contracts`` in sync.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from app.api import ROUTERS
from app.auth import AuthClaims, require_claims
from app.telemetry import configure_tracing, init_sentry, instrument_fastapi

app = FastAPI(
    title="ManFriday Internal API",
    version="0.0.0",
    description="Internal AI/services API. Phase 1 product surface over the Phase 0 spine.",
)

configure_tracing()
init_sentry()
instrument_fastapi(app)

for _router in ROUTERS:
    app.include_router(_router)


class HealthStatus(BaseModel):
    """Response model for the liveness probe."""

    status: str
    service: str
    phase: int


@app.get("/health", response_model=HealthStatus, operation_id="getHealth")
def get_health() -> HealthStatus:
    """Liveness/readiness probe for the walking skeleton."""
    return HealthStatus(status="ok", service="api", phase=0)


class WhoAmI(BaseModel):
    """The verified internal-JWT claims, echoed back."""

    org_id: str
    sub: str
    roles: list[str]


@app.get("/whoami", response_model=WhoAmI, operation_id="whoami")
def whoami(claims: Annotated[AuthClaims, Depends(require_claims)]) -> WhoAmI:
    """Echo the verified internal-JWT claims (auth smoke test). Requires a Bearer token."""
    return WhoAmI(org_id=claims.org_id, sub=claims.sub, roles=claims.roles)
