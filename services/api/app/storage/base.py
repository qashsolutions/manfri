"""Object storage interface for immutable resume / JD originals.

Filesystem-backed in dev/CI (:mod:`app.storage.filesystem`); S3 with SSE-KMS and
presigned URLs in cloud (a config swap). Keys are content-addressed by the caller
(``org_id/candidate_id/content_hash``), so storage is effectively write-once.
"""

from __future__ import annotations

from typing import Protocol


class ObjectStore(Protocol):
    """Write-once object storage."""

    async def put(
        self, *, key: str, data: bytes, content_type: str = "application/octet-stream"
    ) -> str:
        """Store ``data`` at ``key``; return a ``storage_uri``. Re-putting a key is an error."""
        ...

    async def get(self, *, key: str) -> bytes:
        """Return the bytes stored at ``key``."""
        ...

    async def exists(self, *, key: str) -> bool:
        """Whether ``key`` exists."""
        ...
