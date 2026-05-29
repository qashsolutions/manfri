# ManFriday infrastructure — Phase 0 skeleton.
#
# This file is intentionally empty of resources. The Phase 0 stack is wired as
# modules once cloud accounts exist; each is tagged with the work package /
# phase that needs it:
#
#   - network        VPC, subnets, security groups (one VPC, no Kubernetes)        [WP 0.1]
#   - data           Neon Postgres 16 + pgvector (branch-per-PR)                   [WP 0.1/0.2]
#   - compute        ECS Fargate services: FastAPI api + Arq workers              [WP 0.1/0.11]
#   - web            Vercel project for the Next.js BFF (preview deploy per PR)    [WP 0.1]
#   - storage        S3 buckets (SSE-KMS, immutable resume originals)              [WP 0.6]
#   - kms            Per-tenant DEK ⊂ KEK envelope encryption keys                 [WP 0.7]
#   - cache          Redis (Arq queue + LLM response cache + sessions)            [WP 0.11]
#   - secrets        AWS Secrets Manager; LLM keys scoped to the router service    [WP 0.9]
#   - observability  Sentry + self-hosted Langfuse (in-VPC) + feature flags        [WP 0.13]
#
# Nothing here is applied until the cloud-provisioning checklist in README.md is
# satisfied. `terraform validate`/`plan` may run in CI; `apply` does not.
