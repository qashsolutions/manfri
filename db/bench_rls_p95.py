"""Benchmark p95 latency of an RLS-filtered query — Phase 0 exit criterion #3 (<50ms).

Seeds a temp org with candidates, runs N RLS-scoped SELECTs as the non-BYPASSRLS
``manfriday_app`` role, and reports p50/p95/p99. Synthetic data; cleans up after.

Run: uv run python db/bench_rls_p95.py
"""

from __future__ import annotations

import getpass
import time
import uuid

import psycopg

N = 300
ROWS = 50
ADMIN = f"host=localhost dbname=manfriday_dev user={getpass.getuser()}"
APP = "host=localhost dbname=manfriday_dev user=manfriday_app"


def main() -> None:
    org = uuid.uuid4()
    with psycopg.connect(ADMIN, autocommit=True) as admin, admin.cursor() as cur:
        cur.execute(
            "insert into organization (id, type, name) values (%s, 'agency', 'perf')", (org,)
        )
        for i in range(ROWS):
            cur.execute(
                "insert into candidate (org_id, external_ref) values (%s, %s)", (org, f"c{i}")
            )
    try:
        latencies: list[float] = []
        with psycopg.connect(APP) as app, app.transaction(), app.cursor() as cur:
            cur.execute("select set_config('app.current_org', %s, true)", (str(org),))
            for _ in range(N):
                start = time.perf_counter()
                cur.execute("select id from candidate")
                cur.fetchall()
                latencies.append((time.perf_counter() - start) * 1000)
        latencies.sort()
        p50, p95, p99 = (latencies[int(q * N)] for q in (0.50, 0.95, 0.99))
        print(
            f"RLS SELECT over {ROWS} rows x {N} runs: "
            f"p50={p50:.3f}ms p95={p95:.3f}ms p99={p99:.3f}ms"
        )
        print(f"exit criterion #3 (p95 < 50ms): {'PASS' if p95 < 50 else 'FAIL'}")
    finally:
        with psycopg.connect(ADMIN, autocommit=True) as admin, admin.cursor() as cur:
            cur.execute("delete from candidate where org_id = %s", (org,))
            cur.execute("delete from organization where id = %s", (org,))


if __name__ == "__main__":
    main()
