"""Phase 1 product API routers (candidates · résumés · requisitions · matching ·
proposals · outreach · dashboard).

Every router depends on :data:`app.api.deps.TenantSession` / ``Claims``, so all reads
and writes are RLS-scoped to the verified org (invariant #3). No opaque scoring, no
triage automation, no fraud detection lives here — matching is transparent skill
overlap (invariant #6), flags are advisory (invariant #8), and a human decides.
"""

from __future__ import annotations

from app.api.candidates import router as candidates_router
from app.api.dashboard import router as dashboard_router
from app.api.outreach import router as outreach_router
from app.api.proposals import router as proposals_router
from app.api.requisitions import router as requisitions_router

ROUTERS = [
    dashboard_router,
    candidates_router,
    requisitions_router,
    proposals_router,
    outreach_router,
]

__all__ = ["ROUTERS"]
