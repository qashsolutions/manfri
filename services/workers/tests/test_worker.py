"""Arq worker config tests (WP 0.11)."""

from __future__ import annotations

import pytest

from worker.settings import WorkerSettings, ingest


def test_worker_registers_ingest_task() -> None:
    assert ingest in WorkerSettings.functions


def test_redis_reachable() -> None:
    import redis

    from worker.settings import REDIS_URL

    client = redis.Redis.from_url(REDIS_URL)
    try:
        assert client.ping() is True
    except redis.exceptions.ConnectionError:
        pytest.skip("redis not running on REDIS_URL")
    finally:
        client.close()
