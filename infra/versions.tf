terraform {
  required_version = ">= 1.9"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 2.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.6"
    }
  }

  # Remote state (S3 + DynamoDB lock or Terraform Cloud) is configured when the
  # AWS account exists — deliberately left unset in the Phase 0 skeleton.
}
