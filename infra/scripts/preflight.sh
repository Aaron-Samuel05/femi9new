#!/usr/bin/env bash
#
# preflight.sh — will these tasks be able to become healthy?
#
# ── What this is for ────────────────────────────────────────────────────────
# Terraform seeds every operator-owned secret with a "TODO-" placeholder and
# then steps aside (ignore_changes), so the real values are set out of band and
# Terraform can never see them again. That is the right design and it has one
# hole: NOTHING CHECKS. A stack whose Razorpay credentials are still
# placeholders plans clean, applies clean, and then every task fails
# /api/health — which fails CLOSED, correctly — so the deployment stalls, rolls
# back, and reports a timeout that says nothing about the cause.
#
# So this reads the values back from Secrets Manager and answers the only
# question that matters before a deploy: is anything still a placeholder that
# the health check treats as BLOCKING?
#
# The classification below mirrors packages/core/src/brand-readiness.ts and
# payment-identity.ts exactly — including the per-brand-then-shared fallback,
# and including that a "TODO-" prefix reads as ABSENT rather than as a value.
# If the two ever disagree, brand-readiness.ts is the authority: it is what the
# load balancer actually asks.
#
# ── Usage ───────────────────────────────────────────────────────────────────
#   infra/scripts/preflight.sh                              # everything
#   infra/scripts/preflight.sh femi9plat-staging ap-south-1 lumi9
#
# The THIRD argument scopes it to one service, and it matters. Each brand fails
# its health check on its OWN payment credentials, so blocking a Femi9 deploy
# because LUMI9's secret is a placeholder stops a rollout that would have been
# perfectly healthy — a check that cries wolf gets switched off, and then it is
# not there on the day it is right. The deploy workflow passes the app it is
# deploying; a bare run checks everything, which is what you want before launch.
#
# `admin` blocks on nothing: the console's /api/health gates on the platform
# database and AUTH_SECRET, never on Razorpay (apps/admin/app/api/health).
#
# Exit 0: every blocking value for this scope is set.
# Exit 1: one is still a placeholder — that deploy would stall and roll back.
# Exit 2: could not read Secrets Manager, so nothing was checked.
#
# Warnings never fail the run. A missing webhook secret degrades one feature; a
# missing Razorpay secret is an outage.

set -uo pipefail

PREFIX="${1:-femi9plat-staging}"
REGION="${2:-${AWS_REGION:-ap-south-1}}"
SCOPE="${3:-all}"

case "$SCOPE" in
  all)   BRANDS="femi9 lumi9"; PAY_BLOCKS=yes ;;
  femi9) BRANDS="femi9";       PAY_BLOCKS=yes ;;
  lumi9) BRANDS="lumi9";       PAY_BLOCKS=yes ;;
  # The console needs neither brand's gateway to become healthy. It is still
  # worth SAYING what is unset — an operator refunding an order through a
  # placeholder credential is a different bad day.
  admin) BRANDS="femi9 lumi9"; PAY_BLOCKS=no ;;
  *) printf 'Unknown scope "%s" - use femi9, lumi9, admin, or leave it out.\n' "$SCOPE" >&2; exit 2 ;;
esac

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
if [ ! -t 1 ]; then RED=''; YEL=''; GRN=''; DIM=''; OFF=''; fi

blocking=0
warnings=0

# Cache each secret so a per-brand name and its shared fallback cost one call.
declare -A CACHE

# Echoes the value, or the empty string when the secret is missing, empty, or
# still carries a placeholder. Same rule as `usable()` in payment-identity.ts:
# TODO followed by a separator or a word boundary, case-insensitive.
secret_value() {
  local name="$1" value
  if [ -n "${CACHE[$name]+set}" ]; then printf '%s' "${CACHE[$name]}"; return; fi

  value="$(aws secretsmanager get-secret-value \
    --secret-id "${PREFIX}/${name}" \
    --region "$REGION" \
    --query SecretString --output text 2>/dev/null)" || value=''

  [ "$value" = "None" ] && value=''
  case "$value" in
    TODO|TODO[-_:]*|TODO' '*) value='' ;;
  esac

  CACHE[$name]="$value"
  printf '%s' "$value"
}

# Per-brand name first, then the shared one — perBrand() in payment-identity.ts.
resolved() {
  local name="$1" brand="${2:-}" upper value
  if [ -n "$brand" ]; then
    upper="$(printf '%s' "$brand" | tr '[:lower:]' '[:upper:]')"
    value="$(secret_value "${name}_${upper}")"
    [ -n "$value" ] && { printf '%s' "$value"; return; }
  fi
  secret_value "$name"
}

check() {
  local severity="$1" label="$2" name="$3" brand="${4:-}" note="${5:-}"
  if [ -n "$(resolved "$name" "$brand")" ]; then
    printf '  %sok%s   %s\n' "$GRN" "$OFF" "$label"
  elif [ "$severity" = block ]; then
    blocking=$((blocking + 1))
    printf '  %sBLOCK%s %s\n        %s%s%s\n' "$RED" "$OFF" "$label" "$DIM" "$note" "$OFF"
  else
    warnings=$((warnings + 1))
    printf '  %swarn%s %s\n        %s%s%s\n' "$YEL" "$OFF" "$label" "$DIM" "$note" "$OFF"
  fi
}

command -v aws >/dev/null 2>&1 || {
  printf '%saws CLI not found.%s This script reads the values Terraform is not allowed to see.\n' "$RED" "$OFF"
  exit 2
}

# Prove we can READ before interpreting silence as absence. Without this, a
# laptop with no credentials reports every secret as a placeholder - a report
# that looks exactly like the failure it is meant to detect, and would teach
# whoever ran it to disbelieve the next one.
aws sts get-caller-identity --region "$REGION" >/dev/null 2>&1 || {
  printf '%sCannot reach AWS%s - could not call sts get-caller-identity, so nothing\nbelow could be read and every value would report as missing. Configure\ncredentials for the account this stack lives in and run it again.\n' "$RED" "$OFF"
  exit 2
}

printf '\nPreflight: %s in %s (scope: %s)\n\n' "$PREFIX" "$REGION" "$SCOPE"

if [ "$PAY_BLOCKS" = yes ]; then
  printf 'Payments — a brand that cannot create a charge fails /api/health and never\nenters the load balancer. This is the one that stalls a deploy.\n'
  PAY_SEVERITY=block
else
  printf 'Payments — reported, not blocking: the console becomes healthy without them.\nIt does issue refunds through them, though.\n'
  PAY_SEVERITY=warn
fi

for brand in $BRANDS; do
  check "$PAY_SEVERITY" "$brand can create a charge (RAZORPAY_KEY_ID/SECRET)" RAZORPAY_KEY_ID "$brand" \
    "Set ${PREFIX}/RAZORPAY_KEY_ID (or _${brand^^}) — until then every $brand task answers 503 and the deployment rolls back."
  check "$PAY_SEVERITY" "$brand key secret" RAZORPAY_KEY_SECRET "$brand" \
    "Set ${PREFIX}/RAZORPAY_KEY_SECRET (or _${brand^^})."
  check warn "$brand webhook signature" RAZORPAY_WEBHOOK_SECRET "$brand" \
    "Orders get marked paid by the browser callback alone. Sharp edge: once the two brands use DIFFERENT merchant accounts, a payment verified against the other's secret fails silently — money taken, nothing shipped."
done

printf '\nScheduled jobs — silent and expensive when off.\n'
check warn "CRON_SECRET" CRON_SECRET "" \
  "Every /api/cron/* route refuses its caller: subscriptions ship one box and then nothing forever while the account page still shows a next-delivery date, and orders whose webhook was missed sit pending, holding stock, with the money taken. Nothing on any dashboard looks wrong. NOTE: the EventBridge connection holds a COPY of this value — after setting it, run terraform apply or the schedules keep presenting the placeholder."

printf '\nMail — no new sign-ins without it; already-signed-in shoppers unaffected.\n'
# Only Resend has a secret to check. SES authenticates with the task ROLE, so
# there is nothing in Secrets Manager that can be missing — what can be wrong is
# the domain (DKIM records still not resolving, identity PENDING) or the account
# (still in the SES sandbox, where every address that is not individually
# verified is refused). Neither is visible from Secrets Manager, so this says so
# rather than reporting a green tick that means nothing.
for brand in $BRANDS; do
  upper="$(printf '%s' "$brand" | tr '[:lower:]' '[:upper:]')"
  eval "brand_provider=\${MAIL_PROVIDER_${upper}:-}"
  provider="$(printf '%s' "${brand_provider:-${MAIL_PROVIDER:-}}" | tr '[:upper:]' '[:lower:]')"

  if [ "$provider" = "ses" ]; then
    printf '  %sn/a%s   %s sends through SES - no key to check\n' "$DIM" "$OFF" "$brand"
    printf '        %sCheck instead: terraform output ses_identity_status (PENDING means the DKIM\n        records are missing) and the SES console Account dashboard (sandbox means\n        every real customer is refused).%s\n' "$DIM" "$OFF"
    continue
  fi

  check warn "$brand transactional mail (RESEND_API_KEY)" RESEND_API_KEY "$brand" \
    "Sign-in links, order confirmations and dispatch mail all fail to send."
done

printf '\nWhatsApp — the ONLY delivery path for a sign-in OTP, and the only thing a\nphone-only customer hears after paying. There is no SMS fallback.\n'
for brand in femi9 lumi9; do
  check warn "$brand WhatsApp (WHATSAPP_TOKEN)" WHATSAPP_TOKEN "$brand" \
    "Phone sign-in disappears from $brand's login card, and no order confirmation, delivery or cancellation message is sent. Every OTP signup has a null email, so those customers are told nothing at all. Sharp edge: the sender id (WHATSAPP_PHONE_NUMBER_ID) is a task ENVIRONMENT variable rather than a secret, so it is not read here — a token without it sends nothing."
done

printf '\nError reporting — see also the alarms in infra/terraform/alarms.tf.\n'
check warn "SENTRY_DSN" SENTRY_DSN "" \
  "Unhandled exceptions are visible only in the CloudWatch log group, which nobody is reading at 2am."

printf '\n'
if [ "$blocking" -gt 0 ]; then
  printf '%s%d blocking%s, %d warnings. DO NOT DEPLOY: the tasks cannot pass their\nhealth check, so the rollout will stall at "waiting for service stability" and\nroll back with no explanation.\n\n' "$RED" "$blocking" "$OFF" "$warnings"
  printf '  aws secretsmanager put-secret-value --secret-id %s/NAME \\\n    --secret-string '"'"'the real value'"'"' --region %s\n\n' "$PREFIX" "$REGION"
  exit 1
fi

printf '%sNo blocking values missing%s — the tasks can become healthy. %d warnings above.\n\n' "$GRN" "$OFF" "$warnings"
exit 0
