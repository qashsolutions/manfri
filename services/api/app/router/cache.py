"""Content-hash response cache for the router (WP 0.9).

Keyed by ``(prompt_version, model_id, sha256(canonical input))``: identical inputs
never re-bill and return the same result (fairness + cost control). In-process for
Phase 0; Redis-backed in Phase 1, keyed identically.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def content_hash(data: dict[str, Any]) -> str:
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class ContentHashCache:
    def __init__(self) -> None:
        self._store: dict[str, Any] = {}

    def key(self, *, prompt_version: str, model_id: str, input_hash: str) -> str:
        return f"{prompt_version}|{model_id}|{input_hash}"

    def get(self, key: str) -> Any | None:
        return self._store.get(key)

    def put(self, key: str, value: Any) -> None:
        self._store[key] = value
