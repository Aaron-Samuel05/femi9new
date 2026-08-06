# Shared, serverless rate-limit counters for all ECS tasks. Each item represents
# one hashed abuse key for one time window; TTL removes expired buckets.

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

data "aws_iam_policy_document" "task_rate_limit" {
  statement {
    sid       = "UpdateRateLimitCounters"
    actions   = ["dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.rate_limit.arn]
  }
}

resource "aws_iam_role_policy" "task_rate_limit" {
  name   = "update-rate-limit-counters"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_rate_limit.json
}

output "rate_limit_table_name" {
  description = "DynamoDB table shared by all application tasks for rate limiting."
  value       = aws_dynamodb_table.rate_limit.name
}
