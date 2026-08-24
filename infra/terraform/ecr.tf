# ─────────────────────────────────────────────────────────────────────────────
# ecr.tf — one private repository per service.
#
# Three repos rather than one repo with three tag prefixes, because a repository
# is the unit that lifecycle policies, scan findings and IAM all operate on.
# Sharing one would mean "keep the last 20 images" silently evicting Lumi9's
# rollback target every time Femi9 deployed twenty times.
#
# ORDER OF OPERATIONS: a repo must exist and hold an image BEFORE its ECS
# service can pull and start. See README.md — you apply the repos first, push,
# then apply the rest.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_ecr_repository" "app" {
  for_each = local.apps

  name = "${local.name_prefix}-${each.key}"

  # MUTABLE so a `latest` tag can be re-pushed during bring-up. Deployments
  # should still reference an immutable git SHA — see the CI workflow, which
  # tags with github.sha and never deploys `latest`.
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}" })
}

# Keep storage bounded: drop build leftovers quickly, keep enough tagged images
# to roll back through a bad week.
resource "aws_ecr_lifecycle_policy" "app" {
  for_each = aws_ecr_repository.app

  repository = each.value.name

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
