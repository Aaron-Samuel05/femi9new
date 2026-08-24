# ─────────────────────────────────────────────────────────────────────────────
# versions.tf
# Pins Terraform core and provider versions so `plan`/`apply` are reproducible
# across machines and CI. Loosening these later is a deliberate, reviewed change.
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  # 1.5 is the floor: it introduced `check` blocks and stable `moved`/import
  # blocks that this config relies on being available. Newer 1.x is fine.
  required_version = ">= 1.10.0"

  required_providers {
    # AWS provider v5.x. All resources here use the v5 argument shapes
    # (e.g. serverlessv2_scaling_configuration, aws_db_proxy engine_family).
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }

    # Used to generate the Aurora master password and the AUTH_SECRET so no
    # human-chosen secret is ever committed. State therefore holds sensitive
    # values — see the remote-backend note below and the README.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # ───────────────────────────────────────────────────────────────────────────
  # REMOTE STATE is supplied with backend.hcl at init time. Partial
  # configuration keeps account-specific bucket names out of source control.
  # State contains generated DB credentials and connection strings, so it MUST
  # live in an encrypted, access-controlled, locked backend — never local disk
  # committed to git.
  #
  # There is no state-bootstrap/ in THIS directory: the bucket is an account-level
  # thing and one is enough for both stacks. Create it with
  # apps/femi9-web/infra/terraform/state-bootstrap/ if it does not exist yet,
  # then give this stack its own KEY in that bucket — sharing a key would have
  # the two stacks overwrite each other's state. Copy backend.hcl.example to the
  # ignored backend.hcl and run:
  #   terraform init -migrate-state -backend-config=backend.hcl
  # S3 lockfiles replace the deprecated DynamoDB locking mechanism.
  # ───────────────────────────────────────────────────────────────────────────
  backend "s3" {}
}
