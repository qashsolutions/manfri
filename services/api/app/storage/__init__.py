"""Object storage (WP 0.6) — write-once originals for resumes / JDs.

Dev/CI uses :class:`FilesystemObjectStore`; cloud swaps in an S3 (SSE-KMS) backend
by config. :func:`get_object_store` is the app accessor; tests inject their own
store (e.g. a tmp dir).
"""

from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.storage.base import ObjectStore
from app.storage.filesystem import FilesystemObjectStore


@lru_cache
def get_object_store() -> ObjectStore:
    """Return the configured object store (filesystem in dev/CI)."""
    # WP cloud: branch on a storage_backend setting to return an S3-backed store.
    return FilesystemObjectStore(get_settings().storage_dir)


__all__ = ["FilesystemObjectStore", "ObjectStore", "get_object_store"]
