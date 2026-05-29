"""Application settings (Phase 0), read from environment / .env."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings.

    The app connects to Postgres as the **non-superuser, non-BYPASSRLS** role
    ``manfriday_app`` (invariant #3). The local-dev default relies on Postgres
    trust auth; in real environments the connection string comes from a secret.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://manfriday_app@localhost:5432/manfriday_dev"

    # Object storage for resume/JD originals. Dev/CI uses a local filesystem store;
    # cloud swaps in S3 (SSE-KMS) by config. See app/storage.
    storage_dir: str = "/tmp/manfriday-object-store"  # noqa: S108 (dev default; cloud uses S3)

    # Local KEK for PII envelope encryption (WP 0.7) — DEV/CI ONLY, 32 bytes,
    # synthetic data. Cloud wraps DEKs with AWS KMS instead (no local KEK).
    pii_dev_kek: str = "manfriday_dev_kek_synthetic_0001"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor."""
    return Settings()
