# ─────────────────────────────────────────────────────────────────────────────
# rate-limit.tf — shared, serverless rate-limit counters.
#
# One item per hashed abuse key per time window; TTL sweeps expired buckets, so
# nothing here grows without bound and nothing has to be cleaned up on a
# schedule.
#
# ── One table for both brands ───────────────────────────────────────────────
# Safe, because packages/core/src/rate-limit.ts hashes its key before writing —
# an item id identifies a bucket, not a person, and carries no brand. Two tables
# would also mean a single abusive source got two full budgets, one per brand,
# which is the opposite of what a rate limit is for.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_dynamodb_table" "rate_limit" {
  name         = "${local.name_prefix}-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-rate-limit" })
}

# UpdateItem only — the counter is incremented conditionally and never read back
# separately, never scanned, and never deleted (TTL does that).
data "aws_iam_policy_document" "task_rate_limit" {
  statement {
    sid       = "UpdateRateLimitCounters"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.rate_limit.arn]
  }
}

resource "aws_iam_role_policy" "task_rate_limit" {
  for_each = aws_iam_role.task

  name   = "update-rate-limit-counters"
  role   = each.value.id
  policy = data.aws_iam_policy_document.task_rate_limit.json
}
