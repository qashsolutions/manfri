"""FastAPI entrypoint — Phase 0 walking skeleton.

Only a liveness/readiness probe lives here. The tenancy/RLS layer (WP 0.2),
provenance spine (WP 0.4), audit chain (WP 0.5), redaction stage (WP 0.8), and
the multi-model router (WP 0.9) are wired into this app in their respective work
packages. No employment-decision logic ships in Phase 0.

FastAPI's emitted OpenAPI schema is the source of truth for the BFF↔FastAPI
contract; the drift gate against ``packages/contracts`` is added in WP 0.12.
"""

from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(
    title="ManFriday Internal API",
    version="0.0.0",
    description="Phase 0 foundations skeleton. No decision logic yet.",
)


class HealthStatus(BaseModel):
    """Response model for the liveness probe."""

    status: str
    service: str
    phase: int


@app.get("/health", response_model=HealthStatus, operation_id="getHealth")
def get_health() -> HealthStatus:
    """Liveness/readiness probe for the walking skeleton."""
    return HealthStatus(status="ok", service="api", phase=0)
