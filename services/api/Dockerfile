# Phase 0 skeleton image for the FastAPI service. Built in CI (no push) and
# deployed to ECS Fargate once infra is provisioned (see infra/, gated on cloud
# credentials). Build context is the repo root so the uv workspace resolves.
#
#   docker build -f services/api/Dockerfile -t manfriday-api:dev .
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# uv for fast, reproducible, frozen installs.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /repo

# Workspace manifests + lock first (build-cache friendly), then sources.
COPY pyproject.toml uv.lock ./
COPY services ./services
RUN uv sync --frozen --no-dev --package manfriday-api

ENV PATH="/repo/.venv/bin:${PATH}"
WORKDIR /repo/services/api
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
