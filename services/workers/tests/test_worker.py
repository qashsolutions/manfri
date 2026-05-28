import asyncio

from worker.settings import ping


def test_ping() -> None:
    assert asyncio.run(ping({})) == "pong"
