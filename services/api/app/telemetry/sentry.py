"""Sentry error reporting (WP 0.13). No-op unless SENTRY_DSN is set."""

from __future__ import annotations

import os


def init_sentry() -> bool:
    """Initialise Sentry if SENTRY_DSN is set; return whether it was initialised."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(dsn=dsn, traces_sample_rate=0.0, send_default_pii=False)
    return True
