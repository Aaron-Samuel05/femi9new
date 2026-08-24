# ─────────────────────────────────────────────────────────────────────────────
# cloudfront.tf — one distribution per app, in front of the shared ALB.
#
# ── One distribution per SITE, not per app ──────────────────────────────────
# A site is one public hostname. The console has two of them —
# admin.femi9.in and admin.lumi9.in, so each brand's staff reach their back
# office on their own domain — and it gets a distribution for each, both
# pointing at the same ECS service.
#
# It has to work this way for two independent reasons:
#
#  1. A distribution carries ONE certificate, and those two hostnames sit on
#     different registrable domains. No single alias set covers them.
#  2. `/uploads/*` has to be a same-origin path. The console's upload route
#     returns a SITE-RELATIVE url ("/uploads/1712...-front.jpg"), so whatever
#     origin serves the page must also serve the image. That is a
#     per-distribution cache behaviour.
#
# ── How a distribution finds its app ────────────────────────────────────────
# Each one injects `X-Platform-App: <app>` on the ALB origin, and the ALB has a
# listener rule matching that header (alb.tf, priority band 150). Host-based
# rules alone would not do: before DNS exists a viewer arrives at
# `dxxxx.cloudfront.net`, that Host matches no rule, and every brand's CDN would
# fall through to the default app. The header makes routing independent of what
# the viewer typed — which also means each site is testable on its CloudFront
# URL the moment it is created, with no DNS at all.
#
# Note the header names the APP, not the site: both console distributions send
# `admin`, because they are two front doors to one service.
#
# It is a routing signal, not a secret. Anyone may send that header to the ALB
# directly; all they achieve is reaching an app that is already public. Locking
# the ALB to CloudFront alone is a separate hardening step — see README.md.
# ─────────────────────────────────────────────────────────────────────────────

# ── Origin request policy (dynamic app traffic) ──────────────────────────────
# NOT the managed AllViewerExceptHostHeader policy. That one forwards every
# VIEWER header and none of the ones CloudFront GENERATES — and regional pricing
# reads the shopper's location from exactly those. Under the managed policy
# every visitor resolved as "location unknown" and silently got the undiscounted
# default zone.
#
# `allViewerAndWhitelistCloudFront` is the only header behaviour that can add
# CloudFront-generated headers.
resource "aws_cloudfront_origin_request_policy" "app" {
  name    = "${local.name_prefix}-app-origin-request"
  comment = "All viewer headers + CloudFront viewer-geo headers (regional pricing)"

  cookies_config {
    cookie_behavior = "all" # session + guest-cart cookies
  }

  query_strings_config {
    query_string_behavior = "all" # Razorpay callbacks, ?next=, console filters
  }

  headers_config {
    header_behavior = "allViewerAndWhitelistCloudFront"
    headers {
      items = [
        "CloudFront-Viewer-Country",
        "CloudFront-Viewer-Country-Name",
        "CloudFront-Viewer-Country-Region",
        "CloudFront-Viewer-Country-Region-Name",
        "CloudFront-Viewer-City",
        "CloudFront-Viewer-Postal-Code",

        # ── The mobile-carrier gate (packages/core/src/geo/) ─────────────────
        # The region headers above are read off the viewer's IP, and Indian
        # mobile carriers CGNAT their IPv4: a Coimbatore phone on Jio egresses
        # through a Mumbai gateway, so CloudFront correctly resolves an address
        # nowhere near the shopper. That is why regional pricing works on WiFi
        # and misfires on mobile data.
        #
        # -ASN identifies the network, so a carrier can be recognised and its
        # region answer discarded rather than priced on. -Address carries the
        # viewer's real IP, which reveals whether the request arrived over IPv6
        # — carriers do NOT NAT IPv6 and its prefixes are allocated per telecom
        # circle, so that address still carries usable location.
        "CloudFront-Viewer-ASN",
        "CloudFront-Viewer-Address",
      ]
    }
  }
}

resource "aws_cloudfront_distribution" "site" {
  for_each = local.effective_sites

  enabled         = true
  is_ipv6_enabled = true
  comment         = "${local.name_prefix} — ${each.key} (${each.value.app})"

  # An alias may only be attached alongside a certificate that covers it, and
  # CloudFront reads certificates from us-east-1 specifically — whatever region
  # the rest of this stack runs in. With no certificate the distribution serves
  # on its free *.cloudfront.net name, which is still HTTPS, still enough for
  # Google OAuth (which refuses plain HTTP), and still a shareable preview link.
  aliases = each.value.certificate_arn != "" && each.value.host != "" ? [each.value.host] : []

  origin {
    domain_name = aws_lb.this.dns_name
    origin_id   = "alb"

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # http-only while the ALB has no certificate of its own; CloudFront
      # terminates TLS at the edge either way. Set alb_origin_protocol_policy
      # to "https-only" once acm_certificate_arn is set, so the edge-to-origin
      # hop is encrypted too.
      origin_protocol_policy = var.alb_origin_protocol_policy
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    # The routing signal. See the header comment. It names the APP, so both
    # console distributions send the same value.
    custom_header {
      name  = "X-Platform-App"
      value = each.value.app
    }
  }

  origin {
    domain_name              = local.uploads_bucket_domain
    origin_id                = "uploads"
    origin_access_control_id = aws_cloudfront_origin_access_control.uploads.id
  }

  # Dynamic app traffic — never cached. Every page here is per-shopper: a cart
  # badge, a session, a regional price. Forwarding all cookies and query strings
  # keeps sessions and Razorpay callbacks intact.
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
    origin_request_policy_id = aws_cloudfront_origin_request_policy.app.id
  }

  # Next's build output is content-hashed, so it can be cached hard forever.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  }

  # Product images, straight from S3 — they never touch a task.
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

  # Per site: its own us-east-1 certificate if it has one, else the free default.
  dynamic "viewer_certificate" {
    for_each = each.value.certificate_arn != "" ? [each.value.certificate_arn] : []
    content {
      acm_certificate_arn      = viewer_certificate.value
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = each.value.certificate_arn != "" ? [] : [1]
    content {
      cloudfront_default_certificate = true
    }
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}-cdn" })
}
