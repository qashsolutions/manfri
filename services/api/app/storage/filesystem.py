"""Filesystem-backed object store for dev/CI. NOT for production (use S3 + SSE-KMS).

Synthetic data only — no real candidate PII until the cloud backend + DPA exist
(docs/DECISIONS.md D8).
"""

from __future__ import annotations

import asyncio
from pathlib import Path


class FilesystemObjectStore:
    """Stores objects as files under a local root directory."""

    def __init__(self, root: str | Path) -> None:
        self._root = Path(root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self._root / key).resolve()
        if not path.is_relative_to(self._root):
            raise ValueError(f"key escapes storage root: {key!r}")
        return path

    async def put(
        self, *, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        del content_type  # not modeled on disk; S3 backend uses it
        path = self._path(key)
        if path.exists():
            raise FileExistsError(key)  # write-once; callers dedupe by content_hash first
        path.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(path.write_bytes, data)
        return f"file://{path}"

    async def get(self, *, key: str) -> bytes:
        return await asyncio.to_thread(self._path(key).read_bytes)

    async def exists(self, *, key: str) -> bool:
        return self._path(key).exists()
