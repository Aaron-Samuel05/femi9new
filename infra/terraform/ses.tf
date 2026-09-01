# ─────────────────────────────────────────────────────────────────────────────
# ses.tf — Amazon SES, for Lumi9's transactional mail.
#
# ── Why SES and not the shared Resend account ──────────────────────────────
# Lumi9 had no verified sender of its own, so `lumi9_email_from` was empty and
# every Lumi9 sign-in link, order confirmation and dispatch mail went out under
# FEMI9's identity — from `no-reply@femi9.gowshik.online`, a domain that is
# neither brand's, to a parent who has never heard of Femi9. That reads as
# phishing, and it is also the fastest way to damage the deliverability of the
# account Femi9's live mail depends on.
#
# ── What is per brand and what is not ──────────────────────────────────────
# ONE identity per brand, one configuration set per brand, one IAM grant per
# brand — and the grant is pinned to the From address. A misconfigured
# `EMAIL_FROM` therefore fails with AccessDenied at the API rather than sending
# as something the domain has not authorised.
#
# Femi9 is deliberately NOT here. It is live on Resend, its mail works, and
# moving it is a separate decision with a separate warm-up. `mail-identity.ts`
# picks the provider per brand, so Femi9 moves by setting two variables once
# somebody chooses to.
#
# ── Two things Terraform cannot do for you ─────────────────────────────────
#  1. DNS. This creates the identity and the DKIM keys; the CNAME records that
#     PROVE the domain is yours have to exist in the zone before SES will send
#     as it. `terraform output ses_dns_records` prints exactly what to add. Until
#     they resolve, the identity sits `PENDING` and every send is rejected.
#  2. THE SANDBOX. A fresh SES account may only send to addresses IT has
#     verified, one at a time — every real customer is rejected with
#     MessageRejected. Production access is a support request in the SES
#     console, usually answered within a day. Ask for it before launch day, not
#     on it.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # Which brands send through SES here. Driven by whether a sending domain was
  # given, so adding Femi9 later is one variable and no edit to this file.
  ses_brands = {
    for brand, domain in {
      femi9 = var.femi9_ses_domain
      lumi9 = var.lumi9_ses_domain
    } : brand => domain if domain != ""
  }

  # A subdomain of the sending domain, used as the envelope MAIL FROM. Worth
  # having: it aligns SPF with the visible From (so DMARC passes on SPF as well
  # as DKIM), and it keeps bounce traffic off the parent domain's reputation.
  ses_mail_from = {
    for brand, domain in local.ses_brands : brand => "${var.ses_mail_from_subdomain}.${domain}"
  }

  # The bare address inside a display-name form: "Lumi9 <no-reply@lumi9.in>" is
  # what a mail client shows and what EMAIL_FROM holds, but the IAM condition
  # key `ses:FromAddress` is compared against the ADDRESS ALONE. Passing the
  # whole string there produces an AccessDenied that names a condition nobody
  # can see failing.
  ses_from_raw = {
    femi9 = var.femi9_email_from
    lumi9 = var.lumi9_email_from != "" ? var.lumi9_email_from : var.femi9_email_from
  }

  ses_from_address = {
    for brand, _ in local.ses_brands :
    brand => trimspace(
      length(regexall("<([^>]+)>", local.ses_from_raw[brand])) > 0
      ? regexall("<([^>]+)>", local.ses_from_raw[brand])[0][0]
      : local.ses_from_raw[brand]
    )
  }
}

# A brand cannot send through SES as an address on somebody else's domain, and
# the failure if it tries is an AccessDenied at send time — after deploy, on a
# real customer's sign-in link. Checked here instead.
check "ses_from_matches_identity" {
  assert {
    condition = alltrue([
      for brand, domain in local.ses_brands :
      endswith(lower(local.ses_from_address[brand]), "@${lower(domain)}")
    ])
    error_message = "A brand sending through SES has an EMAIL_FROM outside its verified domain. Set <brand>_email_from to an address on <brand>_ses_domain - the IAM policy pins ses:FromAddress to it, so anything else fails with AccessDenied at send time."
  }
}

# ── The sending identity ─────────────────────────────────────────────────────
# A DOMAIN identity, not an address identity: verify lumi9.in once and every
# address on it can send, which is what makes no-reply@ and support@ one
# decision rather than two.
resource "aws_sesv2_email_identity" "brand" {
  for_each = local.ses_brands

  email_identity = each.value

  # Easy DKIM. AWS holds the private half and publishes three CNAMEs for the
  # public half; 2048-bit because a 1024-bit signing key is the kind of thing
  # that becomes an audit finding two years from now.
  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }

  configuration_set_name = aws_sesv2_configuration_set.brand[each.key].configuration_set_name

  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}-ses" })
}

resource "aws_sesv2_email_identity_mail_from_attributes" "brand" {
  for_each = local.ses_brands

  email_identity   = aws_sesv2_email_identity.brand[each.key].email_identity
  mail_from_domain = local.ses_mail_from[each.key]

  # If the MX record is missing, fall back to SES's own MAIL FROM rather than
  # refusing to send. The custom domain is a deliverability improvement, not a
  # precondition, and a missing DNS record must not stop a sign-in link.
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}

# ── The configuration set ────────────────────────────────────────────────────
# Every message is sent under this, and that is what makes bounces visible: a
# message sent outside a configuration set is delivered with no event feed at
# all, which is the failure you do not notice until sending stops.
resource "aws_sesv2_configuration_set" "brand" {
  for_each = local.ses_brands

  configuration_set_name = "${local.name_prefix}-${each.key}"

  delivery_options {
    # Refuse to fall back to plaintext. This is transactional mail carrying
    # sign-in links; a downgrade to cleartext SMTP is not an acceptable retry.
    tls_policy = "REQUIRE"
  }

  reputation_options {
    reputation_metrics_enabled = true
  }

  sending_options {
    sending_enabled = true
  }

  # SES's own suppression list, account-wide and on by default. It is what stops
  # a second send to an address that hard-bounced, and it is deliberately the
  # ONLY suppression list in play — a second one in our database that disagreed
  # with this would be worse than none.
  suppression_options {
    suppressed_reasons = ["BOUNCE", "COMPLAINT"]
  }

  tags = local.tags
}

# ── Where delivery events go ─────────────────────────────────────────────────
# SES → SNS → the storefront's /api/webhooks/ses. The app writes the outcome
# onto the NotificationLog row it already created when it sent, so `sent` stops
# meaning "we hope so".
resource "aws_sns_topic" "ses_events" {
  for_each = local.ses_brands

  name = "${local.name_prefix}-${each.key}-ses-events"
  tags = merge(local.tags, { Name = "${local.name_prefix}-${each.key}-ses-events" })
}

data "aws_iam_policy_document" "ses_events" {
  for_each = local.ses_brands

  statement {
    sid       = "AllowSESPublish"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.ses_events[each.key].arn]

    principals {
      type        = "Service"
      identifiers = ["ses.amazonaws.com"]
    }

    # Any SES account may address a topic ARN; only ours may publish to it.
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "ses_events" {
  for_each = local.ses_brands

  arn    = aws_sns_topic.ses_events[each.key].arn
  policy = data.aws_iam_policy_document.ses_events[each.key].json
}

resource "aws_sesv2_configuration_set_event_destination" "sns" {
  for_each = local.ses_brands

  configuration_set_name = aws_sesv2_configuration_set.brand[each.key].configuration_set_name
  event_destination_name = "sns"

  event_destination {
    enabled = true
    # BOUNCE and COMPLAINT are what the app acts on. DELIVERY closes the loop so
    # a `sent` row can become `delivered`. REJECT is the one that catches the
    # sandbox: SES rejects an unverified recipient before it ever leaves, and
    # without this event that failure is visible nowhere.
    matching_event_types = ["BOUNCE", "COMPLAINT", "DELIVERY", "REJECT", "RENDERING_FAILURE"]

    sns_destination {
      topic_arn = aws_sns_topic.ses_events[each.key].arn
    }
  }
}

# The HTTPS subscription, only once the brand has a URL to POST to. On a first
# apply with no `sites`, app_urls resolves to the distribution's own
# *.cloudfront.net name, which works; an app with no site at all is skipped
# rather than subscribed to nothing.
#
# It arrives PENDING. SNS POSTs a SubscriptionConfirmation, the route verifies
# it and GETs the SubscribeURL itself, and delivery begins — so this confirms
# without a human as long as the service is up. `terraform output
# ses_event_subscriptions` says whether that happened.
resource "aws_sns_topic_subscription" "ses_events" {
  for_each = {
    for brand, _ in local.ses_brands : brand => local.app_urls[brand]
    if try(local.app_urls[brand], "") != ""
  }

  topic_arn = aws_sns_topic.ses_events[each.key].arn
  protocol  = "https"
  endpoint  = "${each.value}/api/webhooks/ses"

  # Deliver the SES payload as SNS sends it — the route parses the envelope and
  # verifies its signature, both of which raw delivery would strip.
  raw_message_delivery = false

  # SNS retries an endpoint that is down; without a policy it gives up quickly
  # and the events are gone.
  delivery_policy = jsonencode({
    healthyRetryPolicy = {
      numRetries         = 10
      minDelayTarget     = 5
      maxDelayTarget     = 300
      numMinDelayRetries = 3
      numMaxDelayRetries = 3
      backoffFunction    = "exponential"
    }
  })
}

# ── What the task may do ─────────────────────────────────────────────────────
# Send as ONE identity, under ONE configuration set, from ONE address.
#
# The FromAddress condition is the load-bearing one. Without it a task could
# send as any address on the verified domain, and an `EMAIL_FROM` typo would
# deliver mail from a name nobody chose. With it, the same typo fails at the API
# with AccessDenied — loudly, in the NotificationLog, before a customer sees it.
data "aws_iam_policy_document" "task_ses" {
  for_each = local.ses_brands

  statement {
    sid     = "SendAsBrandIdentity"
    actions = ["ses:SendEmail"]
    resources = [
      aws_sesv2_email_identity.brand[each.key].arn,
      "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:configuration-set/${aws_sesv2_configuration_set.brand[each.key].configuration_set_name}",
    ]

    condition {
      test     = "StringEquals"
      variable = "ses:FromAddress"
      values   = [local.ses_from_address[each.key]]
    }
  }
}

resource "aws_iam_role_policy" "task_ses" {
  for_each = local.ses_brands

  name   = "send-${each.key}-mail"
  role   = aws_iam_role.task[each.key].id
  policy = data.aws_iam_policy_document.task_ses[each.key].json
}

# ── The console sends too ────────────────────────────────────────────────────
# Marking an order shipped in the console sends the dispatch email — from the
# ADMIN task, as the brand that owns the order (services/admin/orders.ts calls
# sendOrderStatusEmail). One console, both brands, so its role carries every
# SES brand's grant, each still pinned to that brand's own From address.
#
# Missing this does not fail a deploy or a health check. It fails silently, on
# the day an operator marks the first Lumi9 order shipped, as one failed row in
# NotificationLog that nobody is looking at.
data "aws_iam_policy_document" "admin_ses" {
  count = length(local.ses_brands) > 0 ? 1 : 0

  dynamic "statement" {
    for_each = local.ses_brands

    content {
      sid     = "SendAs${title(statement.key)}"
      actions = ["ses:SendEmail"]
      resources = [
        aws_sesv2_email_identity.brand[statement.key].arn,
        "arn:aws:ses:${var.aws_region}:${data.aws_caller_identity.current.account_id}:configuration-set/${aws_sesv2_configuration_set.brand[statement.key].configuration_set_name}",
      ]

      condition {
        test     = "StringEquals"
        variable = "ses:FromAddress"
        values   = [local.ses_from_address[statement.key]]
      }
    }
  }
}

resource "aws_iam_role_policy" "admin_ses" {
  count = length(local.ses_brands) > 0 ? 1 : 0

  name   = "send-brand-mail"
  role   = aws_iam_role.task["admin"].id
  policy = data.aws_iam_policy_document.admin_ses[0].json
}

# ── Optional DNS ─────────────────────────────────────────────────────────────
# Written only when this stack manages the zone. Otherwise add the records in
# `terraform output ses_dns_records` by hand — the identity does not verify and
# nothing sends until they resolve.
resource "aws_route53_record" "ses_dkim" {
  for_each = var.route53_zone_id != "" ? {
    for pair in flatten([
      for brand, identity in aws_sesv2_email_identity.brand : [
        for token in identity.dkim_signing_attributes[0].tokens : {
          key    = "${brand}-${token}"
          name   = "${token}._domainkey.${identity.email_identity}"
          record = "${token}.dkim.amazonses.com"
        }
      ]
    ]) : pair.key => pair
  } : {}

  zone_id = var.route53_zone_id
  name    = each.value.name
  type    = "CNAME"
  ttl     = 600
  records = [each.value.record]
}

resource "aws_route53_record" "ses_mail_from_mx" {
  for_each = var.route53_zone_id != "" ? local.ses_mail_from : {}

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "MX"
  ttl     = 600
  # The inbound endpoint is regional and is where BOUNCES are returned.
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "ses_mail_from_spf" {
  for_each = var.route53_zone_id != "" ? local.ses_mail_from : {}

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "TXT"
  ttl     = 600
  records = ["v=spf1 include:amazonses.com ~all"]
}

# ── Outputs: the DNS somebody has to add ─────────────────────────────────────
output "ses_dns_records" {
  description = "Records that must exist before SES will send as these domains. Three DKIM CNAMEs per domain, plus MX and SPF for the custom MAIL FROM. Until they resolve the identity stays PENDING and every send is rejected. Skip the MAIL FROM pair and mail still sends (behavior_on_mx_failure = USE_DEFAULT_VALUE), just with SPF aligned to amazonses.com rather than to your own domain."
  value = {
    for brand, identity in aws_sesv2_email_identity.brand : brand => {
      dkim_cnames = [
        for token in identity.dkim_signing_attributes[0].tokens : {
          name  = "${token}._domainkey.${identity.email_identity}"
          type  = "CNAME"
          value = "${token}.dkim.amazonses.com"
        }
      ]
      mail_from_mx = {
        name  = local.ses_mail_from[brand]
        type  = "MX"
        value = "10 feedback-smtp.${var.aws_region}.amazonses.com"
      }
      mail_from_spf = {
        name  = local.ses_mail_from[brand]
        type  = "TXT"
        value = "v=spf1 include:amazonses.com ~all"
      }
      # DMARC is not created here because it is a policy decision about the
      # whole domain, not about SES: `p=none` observes, `p=quarantine` acts, and
      # publishing the second before DKIM is verified sends your own mail to
      # spam. Start at none, read the reports, then tighten.
      suggested_dmarc = {
        name  = "_dmarc.${identity.email_identity}"
        type  = "TXT"
        value = "v=DMARC1; p=none; rua=mailto:${var.lumi9_care_inbox_email != "" ? var.lumi9_care_inbox_email : "postmaster@${identity.email_identity}"}"
      }
    }
  }
}

output "ses_identity_status" {
  description = "Whether each domain has verified. NOT_STARTED or PENDING means the DKIM records above are missing or have not propagated, and every send is rejected until that changes."
  value = {
    for brand, identity in aws_sesv2_email_identity.brand :
    brand => identity.verified_for_sending_status ? "verified" : "PENDING - add ses_dns_records, then wait for propagation"
  }
}

output "ses_event_subscriptions" {
  description = "The SNS subscription carrying bounces and complaints to each storefront. `pending confirmation` means the route has not confirmed it — check that the service is up and SES_EVENT_TOPIC_ARN matches, then republish an event."
  value = {
    for brand, sub in aws_sns_topic_subscription.ses_events :
    brand => sub.pending_confirmation ? "pending confirmation - ${sub.endpoint}" : "confirmed - ${sub.endpoint}"
  }
}

output "ses_sandbox_reminder" {
  description = "A REMINDER, not a status - Terraform cannot read the sandbox flag. A new SES account may only send to addresses it has individually verified; every real customer is refused with MessageRejected. Request production access in the SES console before launch."
  value       = length(local.ses_brands) == 0 ? "SES not in use" : "Check SES > Account dashboard for 'Sending limits'. If it says sandbox, request production access - allow a day for the answer."
}
