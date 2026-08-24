#!/bin/sh
# =============================================================================
# Lumi9 container entrypoint — make sure this brand's schema exists and is
# migrated, then start the server.
#
# Invoked as ENTRYPOINT; the server command arrives from CMD as "$@". POSIX sh,
# because the Alpine base has BusyBox ash and no bash.
# =============================================================================

set -e

# ── The two URLs this brand runs on ─────────────────────────────────────────
# DATABASE_URL_LUMI9 is what `dbFor('lumi9')` reads at runtime. Fail fast and by
# name: `dbFor` throws a clear error too, but it does so on the first request,
# which means a task that boots, goes unhealthy, and gets replaced by another
# that does the same. Better to refuse to start.
: "${DATABASE_URL_LUMI9:?DATABASE_URL_LUMI9 is not set — inject it from AWS Secrets Manager}"

# Migrations need a DIRECT, unpooled session: DDL through RDS Proxy or PgBouncer
# can pin or fail outright. Fall back to the pooled URL only so a plain
# `docker run` against a local Postgres still works.
MIGRATE_URL="${DIRECT_URL_LUMI9:-$DATABASE_URL_LUMI9}"

# The Postgres schema this brand lives in. It must match the `?schema=` in the
# URLs above; it is a separate variable because sh has no URL parser and
# guessing wrong here would silently migrate the wrong schema.
BRAND_SCHEMA="${BRAND_DB_SCHEMA:-lumi9}"

# ── 1. The schema itself ────────────────────────────────────────────────────
# Prisma writes `_prisma_migrations` into the schema on the search_path, so that
# schema has to exist first. Creating it here rather than in a migration keeps
# the migration history schema-agnostic — the same fifteen files are what Femi9
# applies to ITS schema.
echo "[entrypoint] Ensuring schema \"$BRAND_SCHEMA\" exists…"
echo "CREATE SCHEMA IF NOT EXISTS \"$BRAND_SCHEMA\";" \
  | npx prisma db execute --url "$MIGRATE_URL" --stdin

# ── 2. Migrations ───────────────────────────────────────────────────────────
# `migrate deploy` is idempotent — it applies only what `_prisma_migrations`
# does not already record, and does nothing on every boot after the first.
#
# DATABASE_URL/DIRECT_URL are set for THIS COMMAND ONLY, because that is what
# schema.prisma reads. Exporting them into the container would be a real hazard:
# `dbFor('femi9')` treats a bare DATABASE_URL as Femi9's transitional fallback,
# so a stray Femi9 read inside the Lumi9 image would quietly succeed against
# Lumi9's schema instead of failing loudly.
echo "[entrypoint] Applying migrations to \"$BRAND_SCHEMA\"…"
DATABASE_URL="$DATABASE_URL_LUMI9" DIRECT_URL="$MIGRATE_URL" \
  npx prisma migrate deploy --schema=../../packages/db/prisma/schema.prisma
echo "[entrypoint] Migrations up to date."

# NOTE on scale: with N tasks every one of them runs this on boot. Prisma
# serialises migrations behind a Postgres advisory lock so that is safe, but the
# tidier pattern is a one-off ECS task with CMD overridden — see
# infra/terraform/README.md, which documents exactly that for seeding.

echo "[entrypoint] Starting server: $*"
# exec so Node becomes PID 1 and receives SIGTERM directly — ECS stops a task by
# sending it, and a shell parent would swallow it and force a 30s kill instead.
exec "$@"
