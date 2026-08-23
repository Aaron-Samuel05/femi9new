# Runbook — giving each brand its own Postgres schema

Status: **rehearsed, not executed.** The live Neon database is untouched and
Femi9 still reads `DATABASE_URL`. This is the one step in Phase 2 that changes
production data, so it waits for a human.

SQL: [`rename-public-to-femi9.sql`](./rename-public-to-femi9.sql)

## What it does

```
before                          after
──────                          ─────
public.*    (49 tables)         femi9.*     (49 tables, same rows)
                                lumi9.*     (empty, awaiting Phase 3)
                                platform.*  (admin identity)
                                public.*    (empty, recreated)
```

The rename is **metadata-only**: Postgres rewrites one catalog entry rather than
moving data, so it is effectively instant regardless of database size. It takes
an `ACCESS EXCLUSIVE` lock for that instant — a blip, not a maintenance window.

## What the rehearsal proved

Run against a local copy with the real schema and a seeded row:

| Check | Result |
| --- | --- |
| Tables moved to `femi9` | 49 |
| Tables left in `public` | 0 |
| Row data after rename | intact |
| Prisma against `?schema=femi9` | **"already in sync"** — no migration needed |
| `dbFor('femi9')` reads renamed schema | yes, through the real code path |
| `dbFor('lumi9')` reads Femi9's rows | **no** — `table lumi9.Setting does not exist` |
| Rollback restores `public` | 49 tables, data intact |
| Rename re-applies after rollback | yes |

That last pair matters most: the escape hatch is the thing you cannot test
during an incident, so it was tested before one.

## Before you run it

**1. Check where extensions live.** This is the one real gotcha.

```sql
SELECT e.extname, n.nspname AS installed_in
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
 WHERE n.nspname = 'public';
```

Anything listed moves with the rename and falls out of the default
`search_path`. Unqualified calls to its functions then fail with "function does
not exist", which reads like corruption and is not. Relocate first:

```sql
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;     -- per extension
ALTER DATABASE neondb SET search_path = "$user", public, extensions;
```

The rehearsal database had none, but a managed provider may differ — **check,
do not assume.**

**2. Take a backup / branch.** On Neon, create a branch first: it is instant and
gives a point-in-time copy to fall back to beyond the SQL rollback.

**3. Pick a quiet moment.** The lock is brief but it is exclusive; nothing
should be mid-transaction.

## Running it

```bash
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f docs/rename-public-to-femi9.sql
```

Use the **direct** (non-pooled) URL. DDL through a connection pooler can land on
a different session than you expect.

## After

Set these, then redeploy:

```
DATABASE_URL_FEMI9=postgresql://…/neondb?schema=femi9
DATABASE_URL_LUMI9=postgresql://…/neondb?schema=lumi9
DATABASE_URL_PLATFORM=postgresql://…/neondb?schema=platform
```

`dbFor('femi9')` prefers `DATABASE_URL_FEMI9` and falls back to `DATABASE_URL`,
so **leave `DATABASE_URL` set during the cutover**. If anything is wrong, unset
`DATABASE_URL_FEMI9` and the app is back on the old path without a deploy.
Remove it once you are satisfied.

Then create the platform tables and the first admin:

```bash
DATABASE_URL_PLATFORM=… npm run push --workspace @femi9/db-platform

DATABASE_URL_PLATFORM=… ADMIN_SEED_PASSWORD='…' \
  npm run create-admin --workspace @femi9/db-platform -- \
  --email you@company.com --name "You" --brand femi9 --role owner
```

## Rolling back

Equally instant, equally metadata-only:

```sql
BEGIN;
DROP SCHEMA IF EXISTS public CASCADE;   -- safe ONLY while still empty
ALTER SCHEMA femi9 RENAME TO public;
COMMIT;
```

Then unset `DATABASE_URL_FEMI9`. Verified working in the rehearsal, including
re-applying the rename afterwards.

## Why this instead of a `brand` column

A discriminator column would have meant altering ~20 models on the live
database, converting six global uniques to composite — including `User.email`,
which authentication depends on — and backfilling. It would also leave
cross-brand leakage possible forever, guarded only by a `where` clause somebody
has to remember.

Separate schemas make that leak impossible in the connection rather than in a
query, and the migration is one instant DDL instead of a schema rewrite on live
auth data. The full comparison is in
[`../apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md`](../apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md).
