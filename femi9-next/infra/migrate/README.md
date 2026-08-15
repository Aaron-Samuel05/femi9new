# Copying blog data from Neon into staging Aurora

Moves `BlogCategory` + `BlogPost` from the Neon dev database into the staging
Aurora cluster. Everything here is idempotent — re-running converges rather than
duplicating.

## Why it takes a detour

Three constraints rule out the obvious `pg_dump | psql`:

1. **Aurora is unreachable from a laptop.** `femi9-staging-aurora` is
   `publicly_accessible = false`, and its security group accepts 5432 only from
   the RDS Proxy SG and the app SG (`infra/terraform/network.tf:227-249`). The
   load has to run from inside the VPC.
2. **Neon is PostgreSQL 18, Aurora is 16.** Restoring a newer server's dump into
   an older server is unsupported, and `pg_dump` refuses to connect to a server
   newer than itself. Only *rows* move; Aurora keeps the schema that
   `prisma migrate deploy` already put there (`docker-entrypoint.sh:29-38`).
3. **`DIRECT_URL` is not a libpq URL.** It ends in `?schema=public&sslmode=require`,
   and `schema=` is a Prisma-only parameter — `psql` rejects it with
   `invalid URI query parameter`. The task strips it before connecting.

So: generate plain SQL from Neon locally, park it in S3, and run one throwaway
Fargate task inside the VPC that fetches and applies it.

## Steps

All commands use the `femi9-deploy` profile (account `851725383246`, `ap-south-1`).

### 1. Generate the SQL from Neon

```bash
psql "$NEON_DIRECT_URL" -f infra/migrate/gen-blog-sync.sql -o blog-sync.sql
```

`$NEON_DIRECT_URL` is `DIRECT_URL` from `femi9-next/.env` — the host *without*
`-pooler`. Expect ~36 KB: 6 categories, 12 posts.

Dry-run it against any Postgres before trusting it — swap the trailing `COMMIT`
for `ROLLBACK` and it will exercise every insert, cast and FK without writing:

```bash
sed 's/^COMMIT;$/ROLLBACK;/' blog-sync.sql > dryrun.sql
psql "$NEON_DIRECT_URL" -v ON_ERROR_STOP=1 -f dryrun.sql
```

### 2. Stage it in S3 and presign it

```bash
aws s3 cp blog-sync.sql s3://femi9-staging-uploads-851725383246/tmp/blog-sync.sql \
  --profile femi9-deploy --region ap-south-1

aws s3 presign s3://femi9-staging-uploads-851725383246/tmp/blog-sync.sql \
  --expires-in 3600 --profile femi9-deploy --region ap-south-1
```

The bucket blocks public access, so the presigned URL is how the task reads it.
Delete the object afterwards — step 5.

### 3. Register the one-off task definition

```bash
aws ecs register-task-definition \
  --cli-input-json file://infra/migrate/blogsync-task.json \
  --profile femi9-deploy --region ap-south-1
```

Only needed once; later runs reuse the `femi9-staging-blogsync` family.

### 4. Run it

It must land in the same VPC, carry the **app security group** (that is what
Aurora's SG trusts), and get a public IP (staging runs `enable_nat = false`, so
a public IP is its only route out to S3). Reuse the running service's own
networking rather than hand-copying subnet IDs:

```bash
NETCFG=$(aws ecs describe-services --cluster femi9-staging-cluster \
  --services femi9-staging-svc --profile femi9-deploy --region ap-south-1 \
  --query 'services[0].networkConfiguration' --output json)

aws ecs run-task \
  --cluster femi9-staging-cluster \
  --task-definition femi9-staging-blogsync \
  --launch-type FARGATE \
  --network-configuration "$NETCFG" \
  --overrides '{"containerOverrides":[{"name":"blogsync","environment":[{"name":"SQL_URL","value":"<PRESIGNED_URL_FROM_STEP_2>"}]}]}' \
  --profile femi9-deploy --region ap-south-1
```

Watch it — the task logs to the existing app log group under the `blogsync`
prefix, and prints category and post counts when it finishes:

```bash
aws logs tail /ecs/femi9-staging --log-stream-name-prefix blogsync --follow \
  --profile femi9-deploy --region ap-south-1
```

Expect `6` then `12`. Any SQL error aborts the transaction (`ON_ERROR_STOP=1`
plus the script's own `BEGIN`/`COMMIT`), leaving Aurora untouched.

### 5. Clean up

```bash
aws s3 rm s3://femi9-staging-uploads-851725383246/tmp/blog-sync.sql \
  --profile femi9-deploy --region ap-south-1
```

## What this does to existing target rows

Matching is by **natural key**, never by id — the two databases were seeded
separately, so their cuids disagree while `BlogCategory.name` and `BlogPost.slug`
(both `@unique`) line up:

- **Categories** upsert on `name`. The target keeps its own category ids; only
  `color` / `tint` are refreshed.
- **Posts** upsert on `slug`, and each post's `categoryId` is re-resolved by
  category *name* against the target, so posts bind to the target's category rows
  instead of carrying Neon's ids across.
- **Deletes** remove posts/categories the source no longer has, making the target
  a mirror. Drop the two `DELETE` lines from the generated SQL to merge instead.

Keying on id instead fails loudly rather than silently: the first run of this
sync aborted on
`duplicate key value violates unique constraint "BlogCategory_name_key"`,
because both databases had a category called “Cycle & Hormones” under different
ids. The transaction rolled back and left the target untouched.

Nothing outside `BlogCategory` / `BlogPost` is touched; no other model references
them.

## Note on cover images

`BlogPost.image` holds app-relative paths (`/assets/img/blogs/*.png`) served from
`public/`, not S3 URLs — so covers travel with the deployed image and need no
separate copy. If you later switch to uploaded covers via the admin blog form
(`app/admin/(panel)/content/blog/_form.tsx`), the bytes will live in the uploads
bucket and will *not* follow a row copied between environments.
