# Private, durable product-image storage. The application writes with its ECS
# task role; viewers read only through CloudFront Origin Access Control.

resource "aws_s3_bucket" "uploads" {
  bucket        = "${local.name_prefix}-uploads-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = merge(local.tags, { Name = "${local.name_prefix}-uploads" })
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "expire-old-noncurrent-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

resource "aws_cloudfront_origin_access_control" "uploads" {
  name                              = "${local.name_prefix}-uploads-oac"
  description                       = "Private S3 product images"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "uploads_cloudfront_read" {
  statement {
    sid     = "AllowCloudFrontRead"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.uploads.arn}/uploads/*",
    ]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  policy = data.aws_iam_policy_document.uploads_cloudfront_read.json
}

data "aws_iam_policy_document" "task_uploads" {
  statement {
    sid       = "WriteProductImages"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.uploads.arn}/uploads/*"]
  }
}

resource "aws_iam_role_policy" "task_uploads" {
  name   = "write-product-images"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task_uploads.json
}

output "uploads_bucket_name" {
  description = "Private S3 bucket used for admin product-image uploads."
  value       = aws_s3_bucket.uploads.bucket
}
