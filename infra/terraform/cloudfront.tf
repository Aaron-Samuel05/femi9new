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
# It is a routing signal, not a secret, and it is not what keeps anyone out:
# the ALB security group admits the CloudFront edge and nothing else. See
# var.alb_ingress_source in variables.tf.
# ─────────────────────────────────────────────────────────────────────────────

# ── How the edge addresses the origin ───────────────────────────────────────
# Two things move together and must not be set independently, because getting
# them out of step either leaves customer data in cleartext (http-only when a
# certificate exists) or 502s the whole site (https-only against the ALB's own
# elb.amazonaws.com name, which no publicly-trusted certificate can cover).
# So they are derived from one input — alb_origin_host — and the override is
# there only for a deliberate exception. See variables.tf for the three steps.
locals {
  alb_origin_encrypted = var.alb_origin_host != "" && local.has_cert

  alb_origin_domain = var.alb_origin_host != "" ? var.alb_origin_host : aws_lb.this.dns_name

  alb_origin_protocol = coalesce(
    var.alb_origin_protocol_policy,
    local.alb_origin_encrypted ? "https-only" : "http-only",
  )
}

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
    # The ALB, addressed by a name of ours when there is one — see the local
    # above. CloudFront matches the origin's certificate against THIS value, so
    # it is the hostname and not the ALB's own DNS name that makes HTTPS to the
    # origin possible at all.
    domain_name = local.alb_origin_domain
    origin_id   = "alb"

    custom_origin_config {
      http_port  = 80
      https_port = 443
      # Derived, not configured: https-only once the origin has a name and a
      # certificate, http-only while it does not. Until then this hop carries
      # session cookies and checkout PII in cleartext, which is acceptable for
      # staging traffic and not for real customers.
      origin_protocol_policy = local.alb_origin_protocol
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

  lifecycle {
    # An ALB with a certificate redirects :80 to :443 (alb.tf). A CloudFront
    # origin does not follow redirects — it passes the 301 back to a viewer who
    # is already on HTTPS, who asks the edge again, and the site becomes an
    # infinite redirect for everyone. So the moment the ALB has a certificate,
    # the origin hop has to be HTTPS as well.
    #
    # The derivation in the local above gets this right on its own; this catches
    # the case where someone overrode it.
    precondition {
      condition     = !(local.has_cert && local.alb_origin_protocol == "http-only")
      error_message = "The ALB has a certificate, so its :80 listener redirects to :443 — and CloudFront hands that 301 straight back to the viewer, who is already on HTTPS. Every page becomes a redirect loop. Set alb_origin_host (and leave alb_origin_protocol_policy empty so it derives https-only), or remove acm_certificate_arn."
    }

    # https-only against the ALB's own elb.amazonaws.com name cannot work:
    # CloudFront validates the origin certificate against the origin domain
    # name, and no publicly-trusted certificate covers that name. It fails at
    # the handshake, on every request, as a 502 with nothing in the app logs.
    precondition {
      condition     = local.alb_origin_protocol == "http-only" || var.alb_origin_host != ""
      error_message = "CloudFront cannot speak HTTPS to the ALB's own DNS name — it validates the origin certificate against the origin domain, and no public CA issues for *.elb.amazonaws.com. Set alb_origin_host to a hostname that resolves to the ALB and is covered by acm_certificate_arn."
    }
  }
}
