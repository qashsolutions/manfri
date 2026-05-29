variable "aws_region" {
  description = "AWS region for the single Phase 0 VPC. Must be a US region (docs/DECISIONS.md D8)."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (dev | staging | prod)."
  type        = string
  default     = "dev"
}
