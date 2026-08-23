-- =============================================================================
-- Phase 2 — give each brand its own Postgres schema.
--
-- ⚠️  NOT YET RUN AGAINST PRODUCTION. This has been rehearsed end-to-end against
--     a local copy (see docs/RENAME-RUNBOOK.md) but the live Neon database is
--     untouched, and Femi9 still reads DATABASE_URL.
--
-- The rename is metadata-only: Postgres rewrites a catalog entry, not the
-- tables. It is effectively instant on any size of database, and it takes an
-- ACCESS EXCLUSIVE lock on the schema for that instant — so run it when nothing
-- is mid-transaction, and expect a blip rather than a migration window.
--
-- `_prisma_migrations` lives in the schema and moves with it, so migration
-- history is preserved and `prisma migrate deploy` continues from where it was.
-- =============================================================================

-- ── STEP 0: look before you leap ────────────────────────────────────────────
-- Run these two READS FIRST and read the output. Do not proceed blind.
--
--   \dx
--   SELECT e.extname, n.nspname AS installed_in
--     FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace;
--
-- Any extension installed INTO public (pgcrypto, uuid-ossp, pg_trgm, …) moves
-- with the rename and drops out of the default search_path. Queries that call
-- its functions unqualified then fail with "function does not exist" — which
-- looks like corruption and is not. If the list is empty apart from plpgsql
-- (which lives in pg_catalog), there is nothing to do.
--
-- If extensions ARE in public, relocate them BEFORE renaming:
--   CREATE SCHEMA IF NOT EXISTS extensions;
--   ALTER EXTENSION pgcrypto SET SCHEMA extensions;   -- repeat per extension
--   ALTER DATABASE <db> SET search_path = "$user", public, extensions;
--
-- Note: some managed providers (Neon included) pre-install extensions this way
-- already. Check rather than assume.

-- ── STEP 1: the rename ──────────────────────────────────────────────────────
BEGIN;

ALTER SCHEMA public RENAME TO femi9;

-- Recreate an empty `public`. Nothing of ours goes in it, but tooling and
-- extensions default to it, and its absence surprises things.
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO PUBLIC;

-- The second brand, and the console's identity store. Empty for now: migrations
-- fill lumi9, and @femi9/db-platform fills platform.
CREATE SCHEMA IF NOT EXISTS lumi9;
CREATE SCHEMA IF NOT EXISTS platform;

COMMIT;

-- ── STEP 2: point the app at it ─────────────────────────────────────────────
-- Nothing in the application changes except environment:
--
--   DATABASE_URL_FEMI9=postgresql://…/<db>?schema=femi9
--   DATABASE_URL_LUMI9=postgresql://…/<db>?schema=lumi9
--   DATABASE_URL_PLATFORM=postgresql://…/<db>?schema=platform
--
-- `dbFor('femi9')` prefers DATABASE_URL_FEMI9 and falls back to DATABASE_URL,
-- so the old variable can stay set during the cutover and be removed after.

-- ── STEP 3: verify ──────────────────────────────────────────────────────────
--   SELECT count(*) FROM femi9."Order";      -- your orders, where they were
--   SELECT count(*) FROM femi9._prisma_migrations;
--   SELECT schema_name FROM information_schema.schemata
--    WHERE schema_name IN ('femi9','lumi9','platform','public');

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- Equally instant, and equally metadata-only. `public` must be dropped first
-- because the name is taken by the empty one created above.
--
--   BEGIN;
--   DROP SCHEMA IF EXISTS public CASCADE;   -- safe ONLY while it is still empty
--   ALTER SCHEMA femi9 RENAME TO public;
--   COMMIT;
--
-- Then unset DATABASE_URL_FEMI9 so the app falls back to DATABASE_URL again.
