"""Export FastAPI's OpenAPI 3.1 spec to ``packages/contracts/openapi.json`` (WP 0.12).

FastAPI's emitted spec is the single source of truth for the BFF↔FastAPI contract;
``openapi-typescript`` turns it into the TS client, and CI fails on drift between
the committed spec/types and what FastAPI currently emits. Explainability fields
(model_id / prompt_version / score_version / trace_id) belong in this schema, not
in log lines — enforced once AI endpoints exist (WP 0.9+).

Run: ``uv run python -m app.openapi_export``
"""

from __future__ import annotations

import json
from pathlib import Path

from app.main import app

OUTPUT = Path(__file__).resolve().parents[3] / "packages" / "contracts" / "openapi.json"


def main() -> None:
    spec = app.openapi()
    OUTPUT.write_text(json.dumps(spec, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT}")  # noqa: T201 (CLI script)


if __name__ == "__main__":
    main()
