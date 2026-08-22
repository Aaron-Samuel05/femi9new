-- ─────────────────────────────────────────────────────────────────────────────
-- gen-blog-sync.sql
-- Run this against NEON. It prints a self-contained SQL script that mirrors the
-- blog tables (BlogCategory + BlogPost) into another Postgres — normally the
-- staging Aurora cluster, which no laptop can reach directly.
--
--   psql "$NEON_DIRECT_URL" -f gen-blog-sync.sql -o blog-sync.sql
--
-- Why generate SQL instead of piping pg_dump straight across:
--   • Neon runs PostgreSQL 18, Aurora runs 16. Restoring a newer server's dump
--     into an older one is unsupported, and pg_dump refuses to talk to a server
--     newer than itself — so the usual `pg_dump | psql` is off the table.
--   • Aurora already has the authoritative schema (the container entrypoint runs
--     `prisma migrate deploy` on boot). Only the ROWS need to move, and plain
--     INSERTs cross major versions safely.
--
-- The output is idempotent: upsert, then delete anything the source no longer
-- has, so re-running converges instead of duplicating. Categories are written
-- before posts because BlogPost.categoryId references BlogCategory, and the
-- deletes run last so an existing post never blocks a category delete.
--
-- Everything keys on NATURAL keys, never on id. The two databases were seeded
-- independently, so their cuids disagree while the human-meaningful keys line up
-- (BlogCategory.name and BlogPost.slug are both @unique). Keying on id would
-- sail past those unique indexes and abort on
-- `duplicate key value violates unique constraint "BlogCategory_name_key"`.
-- Consequently each post's categoryId is re-resolved by category NAME against
-- the TARGET database, so posts attach to Aurora's category rows rather than
-- carrying Neon's dangling ids.
-- ─────────────────────────────────────────────────────────────────────────────
\pset tuples_only on
\pset format unaligned

select '-- Blog sync: Neon (neondb) -> Aurora (femi9). Generated from live Neon data.';
select 'BEGIN;';

-- Conflict on name, not id: the target keeps its own category id, which the post
-- inserts below then look up by name.
select format(
  'INSERT INTO "BlogCategory" ("id","name","color","tint") VALUES (%L,%L,%L,%L)'
  || ' ON CONFLICT ("name") DO UPDATE SET "color"=EXCLUDED."color","tint"=EXCLUDED."tint";',
  id, name, color, tint)
from "BlogCategory" order by name;

-- %L renders the text[] `body` as a quoted array literal and NULL `image` as a
-- bare NULL; both coerce correctly on insert. `status` is a ModerationStatus
-- enum and casts implicitly from its quoted label. categoryId is a scalar
-- subquery resolved against the target at load time.
select format(
  'INSERT INTO "BlogPost" ("id","slug","title","categoryId","excerpt","author","readTime","tone","image","featured","status","body","publishedAt","updatedAt")'
  || ' VALUES (%L,%L,%L,(SELECT "id" FROM "BlogCategory" WHERE "name"=%L),%L,%L,%L,%L,%L,%L,%L,%L,%L,%L)'
  || ' ON CONFLICT ("slug") DO UPDATE SET "title"=EXCLUDED."title","categoryId"=EXCLUDED."categoryId",'
  || '"excerpt"=EXCLUDED."excerpt","author"=EXCLUDED."author","readTime"=EXCLUDED."readTime","tone"=EXCLUDED."tone",'
  || '"image"=EXCLUDED."image","featured"=EXCLUDED."featured","status"=EXCLUDED."status","body"=EXCLUDED."body",'
  || '"publishedAt"=EXCLUDED."publishedAt","updatedAt"=EXCLUDED."updatedAt";',
  p.id, p.slug, p.title, c.name, p.excerpt, p.author, p."readTime", p.tone, p.image,
  p.featured, p.status, p.body, p."publishedAt", p."updatedAt")
from "BlogPost" p join "BlogCategory" c on c.id = p."categoryId" order by p.slug;

-- Drop anything the target has that Neon does not, so the result mirrors the
-- source rather than accumulating both sets side by side.
select format('DELETE FROM "BlogPost" WHERE "slug" NOT IN (%s);',
              (select string_agg(format('%L', slug), ',' order by slug) from "BlogPost"));
select format('DELETE FROM "BlogCategory" WHERE "name" NOT IN (%s);',
              (select string_agg(format('%L', name), ',' order by name) from "BlogCategory"));

select 'COMMIT;';
