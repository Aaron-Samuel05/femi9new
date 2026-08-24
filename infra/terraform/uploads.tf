# ─────────────────────────────────────────────────────────────────────────────
# uploads.tf — private product-image storage, shared by both brands.
#
# ── Why ONE bucket for two brands ───────────────────────────────────────────
# Unlike the database, this is not customer data and carries no isolation
# requirement worth a second bucket: every object here is a product photograph
# that the brand publishes to the world on its own storefront. They are written
# by the console (one app, both brands) and read anonymously through CloudFront.
# Keys are timestamp-prefixed, so two brands cannot collide.
#
# The bucket itself stays private end to end — no public ACLs, no public policy.
# The only principal that can read an object is CloudFront, through Origin
# Access Control, and only under `uploads/`.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  create_uploads = var.existing_uploads_bucket == null

  uploads_bucket_name = local.create_uploads ? aws_s3_bucket.uploads[0].bucket : var.existing_uploads_bucket.bucket
  uploads_bucket_arn  = local.create_uploads ? aws_s3_bucket.uploads[0].arn : "arn:${data.aws_partition.current.partition}:s3:::${var.existing_uploads_bucket.bucket}"

  uploads_bucket_domain = local.create_uploads ? aws_s3_bucket.uploads[0].bucket_regional_domain_name : data.aws_s3_bucket.existing_uploads[0].bucket_regional_domain_name

  # Every distribution that must be able to READ this bucket: this stack's, plus
  # any the operator named. An S3 bucket has exactly ONE policy, so reusing a
  # bucket means REWRITING the policy that already governs it — and a
  # distribution left out of this list stops serving images the moment we apply.
  uploads_reader_arns = concat(
    [for d in aws_cloudfront_distribution.site : d.arn],
    local.create_uploads ? [] : var.existing_uploads_bucket.keep_distribution_arns,
  )
}

data "aws_s3_bucket" "existing_uploads" {
  count  = local.create_uploads ? 0 : 1
  bucket = var.existing_uploads_bucket.bucket
}

resource "aws_s3_bucket" "uploads" {
  count = local.create_uploads ? 1 : 0

  bucket        = "${local.name_prefix}-uploads-${data.aws_caller_identity.current.account_id}"
  force_destroy = false
  tags          = merge(local.tags, { Name = "${local.name_prefix}-uploads" })
}

resource "aws_s3_bucket_public_access_block" "uploads" {
  count = local.create_uploads ? 1 : 0

  bucket                  = aws_s3_bucket.uploads[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "uploads" {
  count = local.create_uploads ? 1 : 0

  bucket = aws_s3_bucket.uploads[0].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  count = local.create_uploads ? 1 : 0

  bucket = aws_s3_bucket.uploads[0].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning is the undo button for "the intern replaced the hero image".
resource "aws_s3_bucket_versioning" "uploads" {
  count = local.create_uploads ? 1 : 0

  bucket = aws_s3_bucket.uploads[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  count = local.create_uploads ? 1 : 0

  bucket = aws_s3_bucket.uploads[0].id
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

# Read access for EVERY distribution in this stack — one per SITE, because each
# hostname serves images under its own `/uploads/*` path. The SourceArn
# condition is what keeps this from being "any CloudFront distribution in any
# AWS account", which is what a bare service principal would mean.
data "aws_iam_policy_document" "uploads_cloudfront_read" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.uploads_bucket_arn}/uploads/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = local.uploads_reader_arns
    }
  }
}

resource "aws_s3_bucket_policy" "uploads" {
  bucket = local.uploads_bucket_name
  policy = data.aws_iam_policy_document.uploads_cloudfront_read.json
}

# ── Write access ─────────────────────────────────────────────────────────────
# PutObject only, and only under `uploads/`. No GetObject: nothing in any app
# reads an object back through the AWS API — reads go to CloudFront like any
# visitor's. No DeleteObject either; images are superseded, not erased, and
# versioning above is what makes that recoverable.
data "aws_iam_policy_document" "task_uploads" {
  statement {
    sid       = "WriteProductImages"
    actions   = ["s3:PutObject"]
    resources = ["${local.uploads_bucket_arn}/uploads/*"]
  }
}

resource "aws_iam_role_policy" "task_uploads" {
  for_each = aws_iam_role.task

  name   = "write-product-images"
  role   = each.value.id
  policy = data.aws_iam_policy_document.task_uploads.json
}
