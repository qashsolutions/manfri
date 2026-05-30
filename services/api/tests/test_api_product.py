"""Integration tests for the Phase 1 product API (need a migrated DB; skip without one).

Drives the real FastAPI app via TestClient with a minted internal JWT, exercising the
résumé-DB core (create candidate → upload+parse → list/detail), the matching flow
(requisition → confirmed skills → ranked matches → completeness), proposals, and the
consent→outreach-audience path. Asserts the load-bearing guarantees: org isolation
(invariant #3), redaction-by-construction (PII only in owning-org detail), and consent
gating on the outreach audience.
"""

from __future__ import annotations

import base64
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.auth import mint_internal_jwt
from app.main import app

RESUME = (
    b"Jane Roe\njane.roe@example.com\n(415) 555-0100\n"
    b"Senior Engineer, 7 years of experience.\n"
    b"Skills: Python, FastAPI, PostgreSQL, Docker, Kubernetes, AWS.\n"
)
B64 = base64.b64encode(RESUME).decode()


@pytest.fixture
def two_orgs(admin_engine: Engine) -> Iterator[dict[str, uuid.UUID]]:
    """Two independent orgs, each with one app_user. Strictly isolated (invariant #3)."""
    org_a, org_b = uuid.uuid4(), uuid.uuid4()
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    with admin_engine.begin() as conn:
        for org, name in ((org_a, "Org A"), (org_b, "Org B")):
            conn.execute(
                text("insert into organization (id, type, name) values (:id, 'agency', :n)"),
                {"id": org, "n": name},
            )
        for user, org, email in ((user_a, org_a, "a@a.test"), (user_b, org_b, "b@b.test")):
            conn.execute(
                text("insert into app_user (id, org_id, email) values (:id, :o, :e)"),
                {"id": user, "o": org, "e": email},
            )
    yield {"org_a": org_a, "org_b": org_b, "user_a": user_a, "user_b": user_b}
    with admin_engine.begin() as conn:
        for org in (org_a, org_b):
            for tbl in (
                "consent_ledger",
                "proposal",
                "jd_skill",
                "requisition",
                "resume",
                "parse_run",
                "tenant_key",
                "audit_event",
                "candidate",
                "app_user",
            ):
                conn.execute(text(f"delete from {tbl} where org_id = :o"), {"o": org})  # noqa: S608
            conn.execute(text("delete from organization where id = :o"), {"o": org})


def _client(org: uuid.UUID, user: uuid.UUID) -> TestClient:
    token = mint_internal_jwt(sub=str(user), org_id=str(org), roles=["recruiter"])
    client = TestClient(app)
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.fixture
def client_a(two_orgs: dict[str, uuid.UUID]) -> TestClient:
    return _client(two_orgs["org_a"], two_orgs["user_a"])


def test_requires_auth() -> None:
    assert TestClient(app).get("/candidates").status_code == 401


def test_create_upload_and_detail_roundtrip(client_a: TestClient) -> None:
    created = client_a.post(
        "/candidates",
        json={
            "external_ref": "jane.roe@example.test",
            "pii": {"name": "Jane Roe", "email": "jane.roe@example.com"},
        },
    )
    assert created.status_code == 201
    cid = created.json()["id"]

    up = client_a.post(
        f"/candidates/{cid}/resumes",
        json={"filename": "cv.txt", "content_type": "text/plain", "content_b64": B64},
    )
    assert up.status_code == 200, up.text
    assert up.json()["parsed"] is True

    detail = client_a.get(f"/candidates/{cid}").json()
    assert detail["contact"]["name"] == "Jane Roe"  # decrypted for the owning org
    assert "Python" in detail["skills"]
    assert detail["experience_years"] == 7.0
    assert len(detail["resumes"]) == 1


def test_list_is_redacted(client_a: TestClient) -> None:
    client_a.post("/candidates", json={"external_ref": "x", "pii": {"name": "Secret Person"}})
    rows = client_a.get("/candidates").json()
    assert rows
    blob = str(rows)
    assert "Secret Person" not in blob  # no raw PII in the list view
    assert "contact" not in rows[0]


def test_org_isolation(two_orgs: dict[str, uuid.UUID]) -> None:
    a = _client(two_orgs["org_a"], two_orgs["user_a"])
    b = _client(two_orgs["org_b"], two_orgs["user_b"])
    cid = a.post("/candidates", json={"external_ref": "shared@example.test"}).json()["id"]
    # Org B independently has the same person, but cannot see Org A's row.
    b.post("/candidates", json={"external_ref": "shared@example.test"})
    assert b.get(f"/candidates/{cid}").status_code == 404
    assert all(row["id"] != cid for row in b.get("/candidates").json())


def test_matching_flow(client_a: TestClient) -> None:
    cid = client_a.post("/candidates", json={"external_ref": "cand"}).json()["id"]
    client_a.post(
        f"/candidates/{cid}/resumes",
        json={"filename": "cv.txt", "content_type": "text/plain", "content_b64": B64},
    )
    req = client_a.post(
        "/requisitions",
        json={
            "title": "Senior Python Engineer",
            "location": "Remote",
            "employment_type": "full-time",
            "jd_text": "x" * 250,
        },
    ).json()
    rid = req["id"]
    client_a.put(
        f"/requisitions/{rid}/skills",
        json={
            "skills": [
                {"name": "Python", "tier": "core", "weight": 1.0, "sort_order": 0},
                {"name": "PostgreSQL", "tier": "core", "weight": 1.0, "sort_order": 1},
                {"name": "Docker", "tier": "core", "weight": 1.0, "sort_order": 2},
                {"name": "Rust", "tier": "nice", "weight": 0.5, "sort_order": 3},
            ]
        },
    )
    matches = client_a.get(f"/requisitions/{rid}/matches").json()
    assert matches["matcher_version"] == "skill-overlap@1"
    top = matches["matches"][0]
    assert top["candidate_id"] == cid
    # Résumé has all 3 core skills (Python/PostgreSQL/Docker) but not the nice Rust.
    assert top["core_coverage"] == 1.0
    assert "Rust" not in top["matched"]
    assert top["missing_core"] == []

    completeness = client_a.get(f"/requisitions/{rid}/completeness").json()
    assert completeness["score"] == 100  # title+location+type+jd_text+3 core+1 nice


def test_consent_then_audience(client_a: TestClient) -> None:
    cid = client_a.post(
        "/candidates", json={"external_ref": "cand", "pii": {"email": "c@x.test"}}
    ).json()["id"]
    # Pending by default → not eligible.
    assert client_a.get("/outreach/audience").json()["eligible"] == 0
    client_a.post(f"/candidates/{cid}/consent", json={"event": "opted_in", "source": "import"})
    audience = client_a.get("/outreach/audience").json()
    assert audience["eligible"] == 1
    assert audience["members"][0]["candidate_id"] == cid
    stats = client_a.get("/outreach/stats").json()
    assert stats["opted_in"] == 1


def test_proposal_history(client_a: TestClient) -> None:
    cid = client_a.post("/candidates", json={"external_ref": "cand"}).json()["id"]
    rid = client_a.post("/requisitions", json={"title": "Role"}).json()["id"]
    made = client_a.post(
        "/proposals",
        json={
            "candidate_id": cid,
            "requisition_id": rid,
            "outcome": "rejected",
            "reason": "timing",
        },
    )
    assert made.status_code == 201
    history = client_a.get(f"/proposals?candidate_id={cid}").json()
    assert len(history) == 1
    assert history[0]["outcome"] == "rejected"
    assert history[0]["requisition_title"] == "Role"


def test_dashboard_stats(client_a: TestClient) -> None:
    client_a.post("/candidates", json={"external_ref": "c1"})
    client_a.post("/requisitions", json={"title": "R1"})
    stats = client_a.get("/dashboard/stats").json()
    assert stats["candidates"] >= 1
    assert stats["requisitions"] >= 1
