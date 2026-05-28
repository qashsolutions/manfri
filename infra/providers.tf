# Provider configuration is intentionally minimal in Phase 0. Credentials are
# supplied via environment / CI OIDC (no static tokens), never committed.
# `terraform apply` is gated on real cloud accounts + secrets — see README.md
# and docs/DECISIONS.md D8 (no real candidate PII until DPA + US-region +
# envelope encryption are confirmed).

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "manfriday"
      Phase     = "0"
      ManagedBy = "terraform"
    }
  }
}

provider "vercel" {
  # Token via VERCEL_API_TOKEN.
}

provider "neon" {
  # API key via NEON_API_KEY.
}
