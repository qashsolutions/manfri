# `infra/` — Terraform (Phase 0 skeleton)

**Source only. Nothing is provisioned yet.** This directory is the IaC skeleton
from WP 0.1: provider + version pins, shared variables, and a `main.tf` that
documents the modules to come. `terraform apply` is deliberately **not** run
until real cloud accounts and secrets exist.

## What lives here

| File | Purpose |
|---|---|
| `versions.tf` | Terraform + provider version constraints (AWS, Vercel, Neon). |
| `providers.tf` | Provider config; credentials come from env / CI OIDC, never committed. |
| `variables.tf` | Shared inputs (`aws_region` — US only, `environment`). |
| `main.tf` | Module map (network, data, compute, web, storage, kms, cache, secrets, observability) — all deferred. |

## Cloud-provisioning checklist (you drive this — needs your accounts)

1. **AWS account** + an OIDC role for GitHub Actions (no static keys).
2. **Neon** project (US region) + API key — confirm DPA before any real PII (D8).
3. **Vercel** project + API token for the Next.js BFF.
4. Configure **remote state** (S3 + lock) in `versions.tf`.
5. `terraform init && terraform plan` — review — `apply`.

Until then, local/dev uses **synthetic data only** (docs/DECISIONS.md D8).
