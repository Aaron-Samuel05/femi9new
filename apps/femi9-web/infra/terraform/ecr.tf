# ─────────────────────────────────────────────────────────────────────────────
# ecr.tf
# Private ECR repository that holds the app container image.
#
# ORDER OF OPERATIONS: this repo must exist and hold at least one image BEFORE
# the ECS service can pull and start. See the README — you typically apply just
# this repo first (`terraform apply -target=aws_ecr_repository.app`), push the
# image, then apply the rest.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "app" {
  name                 = "${local.name_prefix}-app"
  image_tag_mutability = "MUTABLE" # allow re-pushing "latest"; use IMMUTABLE + SHA tags for stricter prod

  # Scan every pushed image for known CVEs.
  image_scanning_configuration {
    scan_on_push = true
  }

  # Encrypt image layers at rest with the AWS-managed ECR key.
  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-app" })
}

# Lifecycle policy: keep storage bounded.
#   • expire untagged images after 1 day (build leftovers)
#   • keep only the newest 20 tagged images
resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Keep only the last 20 tagged images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      },
    ]
  })
}
