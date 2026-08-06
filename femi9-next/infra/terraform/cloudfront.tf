# ─────────────────────────────────────────────────────────────────────────────
# cloudfront.tf — CDN in front of the ALB.
#
# ENABLED in "no custom domain yet" mode: serves the app over HTTPS on the free
# *.cloudfront.net certificate, so we get a shareable https:// URL (and working
# Google OAuth, which requires https) before the real domain is wired.
#
# When the real domain (femi9.in) is ready:
#   • request/validate an ACM cert IN us-east-1 (CloudFront's cert region),
#   • set `aliases = [var.domain_name]`,
#   • swap viewer_certificate to that ACM cert (see the commented block below),
#   • point the domain's DNS at this distribution.
#
# Origin is HTTP because the ALB only has an HTTP:80 listener in HTTP-first mode;
# CloudFront terminates TLS at the edge and talks HTTP to the origin. Harden later
# by locking the ALB to CloudFront only (custom-header secret or managed prefix list).
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name_prefix} CDN in front of the ALB"
  # No custom domain yet → served on the default *.cloudfront.net name.
  aliases = var.domain_name != "" ? [var.domain_name] : []

  origin {
    domain_name = aws_lb.this.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only" # ALB has only an HTTP:80 listener (HTTP-first)
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  origin {
    domain_name              = aws_s3_bucket.uploads.bucket_regional_domain_name
    origin_id                = "uploads"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  # Dynamic app traffic — never cache, forward all cookies/query/headers (except
  # Host, so the origin keeps its own hostname). AllViewerExceptHostHeader keeps
  # auth cookies + Razorpay callbacks intact.
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  }

  # Next.js static assets — cache hard at the edge.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  ordered_cache_behavior {
    path_pattern           = "/uploads/*"
    target_origin_id       = "uploads"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Free default cert now. Swap for a us-east-1 ACM cert when the domain is added:
  #   acm_certificate_arn      = var.acm_certificate_arn
  #   ssl_support_method       = "sni-only"
  #   minimum_protocol_version = "TLSv1.2_2021"
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-cdn" })
}

output "cloudfront_url" {
  description = "Public HTTPS URL for the app (via CloudFront)."
  value       = "https://${aws_cloudfront_distribution.this.domain_name}"
}
