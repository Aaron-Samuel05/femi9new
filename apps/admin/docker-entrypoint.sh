#!/bin/sh
# =============================================================================
# Admin console entrypoint — make sure the platform schema exists and is
# migrated, then start the server.
#
# ── What this DOESN'T migrate, and why ──────────────────────────────────────
# Only `platform`. The console reads both brands' data, so it is tempting to
# have it migrate their schemas too — but then two services would race to apply
# the same history to the same schema, and which one wins would depend on task
# start order. Each app migrates exactly the schema it is the front for:
# femi9-web owns `femi9`, lumi9-web owns `lumi9`, this owns `platform`. One
# writer per schema, always.
#
# The ordering consequence is documented in infra/terraform/README.md: bring the
# storefronts up before, or alongside, the console. A console whose brand
# schemas are not migrated yet still starts and still lets people sign in — its
# health probe reports the brand as degraded rather than failing.
# =============================================================================

set -e

# The platform database holds admin identity. Without it nobody can sign in, so
# there is no useful degraded mode — refuse to start rather than boot a console
# that will 500 on its own login form.
: "${DATABASE_URL_PLATFORM:?DATABASE_URL_PLATFORM is not set — inject it from AWS Secrets Manager}"

# DDL wants a direct, unpooled session; RDS Proxy can pin or reject it. Fall
# back to the pooled URL so a plain `docker run` against local Postgres works.
MIGRATE_URL="${DIRECT_URL_PLATFORM:-$DATABASE_URL_PLATFORM}"

# Must match the `?schema=` in the URLs above. A separate variable because sh
# has no URL parser, and guessing wrong would migrate the wrong schema.
PLATFORM_SCHEMA="${PLATFORM_DB_SCHEMA:-platform}"

echo "[entrypoint] Ensuring schema \"$PLATFORM_SCHEMA\" exists…"
echo "CREATE SCHEMA IF NOT EXISTS \"$PLATFORM_SCHEMA\";" \
  | npx prisma db execute --url "$MIGRATE_URL" --stdin

# Idempotent: applies only what `_prisma_migrations` does not already record.
echo "[entrypoint] Applying platform migrations…"
DATABASE_URL_PLATFORM="$MIGRATE_URL" \
  npx prisma migrate deploy --schema=./prisma-platform/schema.prisma
echo "[entrypoint] Platform schema up to date."

# NOTE: there is no bootstrap admin here on purpose. Seeding a default account
# from environment variables would put a working credential in the task
# definition and in CloudWatch's env dump. The first admin is created out of
# band with `npm run create-admin` — see apps/admin/CLAUDE.md.

echo "[entrypoint] Starting server: $*"
# exec so Node is PID 1 and gets SIGTERM directly on task stop.
exec "$@"
