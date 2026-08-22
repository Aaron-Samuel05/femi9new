# =============================================================================
# Femi9 web — production image (Next.js standalone on Alpine, non-root).
#
# ── BUILD CONTEXT IS THE WORKSPACE ROOT, NOT THIS DIRECTORY ──────────────────
# npm workspaces keep the lockfile and the hoisted node_modules at the repo
# root, so an app-scoped context cannot run `npm ci`. Build from the root and
# point at this file:
#
#   docker build -f apps/femi9-web/Dockerfile -t femi9-web .
#
# Optionally with the MaxMind licence key as a BuildKit secret:
#   docker build --secret id=maxmind_license_key,env=MAXMIND_LICENSE_KEY \
#                -f apps/femi9-web/Dockerfile -t femi9-web .
#
# ── THE RUNTIME LAYOUT IS DELIBERATELY FLAT ─────────────────────────────────
# `output: 'standalone'` traced from the workspace root emits a NESTED bundle:
#   .next/standalone/apps/femi9-web/server.js   + .next/standalone/node_modules
# The runner stage flattens that back to /app/server.js with /app/node_modules,
# which is byte-for-byte the layout this image had before the monorepo move.
# That is on purpose: the entrypoint, HEALTHCHECK, CMD and the ECS task
# definition all keep working with no change. `server.js` is entirely
# __dirname-relative, so relocating it is safe.
# =============================================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1


# -----------------------------------------------------------------------------
# Stage 1 — deps: install the workspace dependencies.
# Kept separate so this layer is cached and only re-runs when a lockfile or a
# package.json changes, not on every source edit.
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Only the manifests + lockfile — maximizes Docker layer cache hits.
# Every workspace manifest must be present: `npm ci` validates the root lockfile
# against all of them and fails if one is missing. lumi9's package.json is
# re-included by .dockerignore for exactly this reason.
COPY package.json package-lock.json ./
COPY apps/femi9-web/package.json apps/femi9-web/
COPY apps/lumi9-web/package.json apps/lumi9-web/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/

# `npm ci` = clean, reproducible install straight from package-lock.json.
# devDependencies are needed here because `next build` and `prisma generate`
# rely on them (typescript, prisma CLI, @types, …).
#
# Scoped to this workspace so the OTHER brand's dependency tree (its own Next,
# Tailwind, eslint) never enters this image — the runner stage overlays this
# whole node_modules, so anything installed here ships.
RUN npm ci --workspace femi9-web --include-workspace-root


# -----------------------------------------------------------------------------
# Stage 2 — build: compile the app and generate the Prisma client.
# -----------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

# Reuse the installed dependencies from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the workspace. `.dockerignore` keeps this lean (no
# node_modules, .next, .git, tests, .env, legacy prototypes, lumi9 source …).
COPY . .

# Everything below is app-scoped. The tooling still resolves out of the hoisted
# /app/node_modules — npm and Node both walk parent directories for node_modules
# and .bin, so no per-app install is required.
WORKDIR /app/apps/femi9-web

# Generate the Prisma client (writes to the hoisted node_modules/.prisma/client
# and pulls the correct musl engine). Run BEFORE the build so server code can
# import it. Via the npm script, because the schema now lives in packages/db and
# the script carries the --schema flag that points there.
RUN npm run db:generate

# NEXT_PUBLIC_* values are inlined into the CLIENT bundle at `next build` time —
# they are NOT read from the container env at runtime. So they must be present as
# build args here (passed via `docker build --build-arg ...` in CI / by hand).
# An empty default keeps local `docker build` working; production passes the real
# public site URL (e.g. the CloudFront URL) and the Razorpay publishable key id.
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=""
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# GeoLite2 databases for the geo resolver (src/lib/geo/mmdb.ts). Baked into the
# image on purpose: every task then gets an identical, immutable database with no
# writable volume and no runtime network egress — the same property the Prisma
# engines above are shipped for. Refreshing means rebuilding; MaxMind publishes
# weekly and the ASN data this app leans on is stable.
#
# The licence key is a BuildKit secret, so it never lands in an image layer or in
# `docker history`.
#
# Entirely optional — with no secret mounted the script writes an empty directory
# and exits 0. The app runs fine that way: geo lookups return null and the
# resolver falls back to the CloudFront viewer headers.
RUN --mount=type=secret,id=maxmind_license_key \
    MAXMIND_LICENSE_KEY="$(cat /run/secrets/maxmind_license_key 2>/dev/null || true)" \
    node scripts/fetch-geoip.mjs

# Produce the optimized production build. With `output: 'standalone'` and a
# workspace-rooted trace this writes:
#   .next/standalone/apps/femi9-web/  (server.js + traced app code)
#   .next/standalone/node_modules/    (pruned, hoisted dependencies)
#   .next/static/                     (NOT copied into standalone — see runner)
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 3 — runner: minimal, hardened, NON-root runtime image.
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

# Production runtime configuration.
#  - NODE_ENV=production        → framework + libs run in production mode.
#  - PORT=3000 / HOSTNAME=0.0.0.0 → the standalone server binds all interfaces so
#    the ALB / Docker can reach it (defaults to localhost otherwise).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Run as an unprivileged user (defense in depth; also an ECS/Fargate best practice).
# uid/gid 1001 matches the convention in Vercel's official Next.js Docker example.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# --- Application artifacts -------------------------------------------------
# NOTE: the standalone server does NOT bundle `public/` or `.next/static/`
# automatically — we copy them explicitly here so the app can serve its static
# assets and images.
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/public       ./public
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/.next/static ./.next/static

# The standalone bundle, FLATTENED. The trailing `/.` copies the *contents* of
# the nested app directory, so /app ends up with server.js and .next/ directly —
# the pre-monorepo layout that CMD and the entrypoint expect.
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/.next/standalone/apps/femi9-web/. ./

# --- Prisma at runtime -----------------------------------------------------
# The entrypoint runs `prisma migrate deploy` on boot, but the Prisma CLI is a
# devDependency and is NOT traced into the standalone bundle. Prisma 6's CLI also
# pulls a real transitive closure (@prisma/config → effect, c12, empathic,
# deepmerge-ts, …), so cherry-picking a few dirs is fragile. Overlay the COMPLETE
# build-stage node_modules instead — this guarantees the CLI + engines + generated
# client are all present to run migrations fully OFFLINE at container start.
# It is a strict superset of the traced standalone node_modules, so it also
# satisfies the server itself.
# (Trade-off: a larger image; a later optimization can trace just the CLI closure.)
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

# The Prisma schema + migration history — required by `prisma migrate deploy`.
# It lives in packages/db now (one schema, both brands) but is copied to the same
# /app/prisma the entrypoint has always used, so that script is unchanged.
COPY --from=build --chown=nextjs:nodejs /app/packages/db/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/scripts ./scripts
# Keep the static catalog available to the idempotent Prisma seed task.
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/src/data ./src/data

# The GeoLite2 databases (or an empty directory, if the build had no licence key).
# Next's standalone tracer only follows JS imports, so a data file it never sees
# referenced has to be copied explicitly — same reason `public/` is copied above.
# Paths are relative to the working directory, which is where server.js runs.
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/data ./data
COPY --from=build --chown=nextjs:nodejs /app/apps/femi9-web/src/lib/cycle-crypto.ts ./src/lib/cycle-crypto.ts

# Recreate the `.bin/prisma` shim so `npx prisma ...` resolves the locally-copied
# CLI instead of trying to download it (COPY does not reliably preserve the
# generated bin symlink). This guarantees migrations run without network egress.
RUN mkdir -p node_modules/.bin \
 && ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
 && chmod +x node_modules/prisma/build/index.js

# Next's runtime writes cached artifacts (e.g. ISR) under .next/cache — make sure
# the non-root user owns a writable cache dir.
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

# --- Entrypoint ------------------------------------------------------------
# migrate-then-start wrapper. Copied executable and owned by the runtime user.
COPY --chown=nextjs:nodejs apps/femi9-web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Drop privileges for everything that follows.
USER nextjs

EXPOSE 3000

# Container-level health probe. In production the ALB target group health check is
# authoritative; point that at a dedicated /api/health route if/when one exists.
# `wget` here is BusyBox's, bundled with the Alpine base image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/ || exit 1

# ENTRYPOINT runs migrations, then execs CMD. Keeping the server in CMD makes the
# image easy to reuse for one-off tasks (e.g. override CMD to run a seed script).
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
