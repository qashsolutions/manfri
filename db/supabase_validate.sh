#!/usr/bin/env bash
# Validate the baseline migration + RLS isolation against a real Supabase Postgres.
#
# Thin wrapper: the real work is in db/supabase_validate.py (run via uv so psycopg +
# alembic are available). Reads services/api/.env.cloud (GITIGNORED). SYNTHETIC DATA
# ONLY — do not point at real candidate PII until the ⚖️ counsel sign-offs + DPA clear.
#
# Usage:  bash db/supabase_validate.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"
cd "$ROOT/services/api"
exec uv run python "$ROOT/db/supabase_validate.py"
