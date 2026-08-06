#!/bin/sh
# =============================================================================
# Femi9 container entrypoint — run DB migrations, then start the app server.
# -----------------------------------------------------------------------------
# Invoked by the Dockerfile as ENTRYPOINT; the server command comes from CMD
# (`node server.js`) and is passed through as "$@". Written in POSIX sh so it
# runs on the Alpine (BusyBox ash) base without bash.
#
# `prisma migrate deploy` is IDEMPOTENT: it applies only migrations that have not
# yet been recorded in the database's `_prisma_migrations` table, and does nothing
# on subsequent boots. Prisma automatically uses the datasource `directUrl`
# (DIRECT_URL) for schema changes — this must be a NON-pooled connection
# (bypass RDS Proxy / PgBouncer) so DDL runs on a direct session.
#
# NOTE for AWS ECS/Fargate at scale: running migrations from the app entrypoint
# is fine for a single task, but if the service scales to N tasks they will all
# attempt to migrate on boot. Prisma serializes via an advisory lock so this is
# safe, but the cleaner pattern is a dedicated one-off ECS "migrate" task (this
# same image with CMD overridden to `npx prisma migrate deploy`) run before the
# service is updated. This entrypoint keeps the simple, self-contained path.
# =============================================================================

set -e  # abort (and fail the container) if a migration fails

# Fail fast with a clear message if the database URL was not injected.
: "${DATABASE_URL:?DATABASE_URL is not set — inject it from AWS Secrets Manager}"
: "${CYCLE_DATA_ENCRYPTION_KEY:?CYCLE_DATA_ENCRYPTION_KEY is not set — inject it from AWS Secrets Manager}"

if [ -d ./prisma/migrations ]; then
  echo "[entrypoint] Applying database migrations (prisma migrate deploy)…"
  npx prisma migrate deploy --schema=./prisma/schema.prisma
else
  # This repository predates Prisma migration history. db push applies additive
  # schema changes and refuses destructive changes unless explicitly authorised.
  echo "[entrypoint] Synchronising legacy schema (prisma db push)…"
  npx prisma db push --schema=./prisma/schema.prisma --skip-generate
fi
echo "[entrypoint] Migrations up to date."

echo "[entrypoint] Encrypting legacy cycle data (idempotent)…"
npx tsx ./scripts/migrate-cycle-data-encryption.ts

echo "[entrypoint] Starting server: $*"
# `exec` replaces this shell with the Node process so it becomes PID 1 and
# receives SIGTERM/SIGINT directly (clean, fast shutdowns on ECS task stop).
exec "$@"
