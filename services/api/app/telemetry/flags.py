"""Feature flags (WP 0.13).

Dev flags come from the environment (``MANFRIDAY_FLAG_<NAME>=1``). Prod swaps in
Unleash / LaunchDarkly to gate model changes behind shadow-tests + bias audits.
"""

from __future__ import annotations

import os

_TRUTHY = {"1", "true", "yes", "on"}


class FeatureFlags:
    def is_enabled(self, name: str, default: bool = False) -> bool:
        raw = os.environ.get(f"MANFRIDAY_FLAG_{name.upper()}")
        return default if raw is None else raw.lower() in _TRUTHY


flags = FeatureFlags()
