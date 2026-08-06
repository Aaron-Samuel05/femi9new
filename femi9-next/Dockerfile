# syntax=docker/dockerfile:1.7
# =============================================================================
# Femi9 — production container image (Next.js 15 standalone + Prisma 6)
# -----------------------------------------------------------------------------
# Target runtime: AWS ECS Fargate (ap-south-1) behind an ALB. Image is pushed to
# ECR and run as a Fargate task; Aurora Serverless v2 (via RDS Proxy) is reached
# over DATABASE_URL / DIRECT_URL supplied from AWS Secrets Manager at task start.
#
# Multi-stage build:
#   1. deps    — install the full dependency tree once (cached on lockfile).
#   2. build   — generate the Prisma client + run `next build` (standalone output).
#   3. runner  — tiny, NON-root image that ships only the standalone server, the
#                static assets, `public/`, the Prisma schema+migrations, and the
#                Prisma CLI/engines needed to run `prisma migrate deploy` on boot.
#
# The three stages all use the SAME base (node:22-alpine / musl libc) on purpose:
# the Prisma query & schema engine binaries are platform-specific, so generating
# them on Alpine guarantees they match the Alpine runner (linux-musl-openssl-3.0.x).
# If you ever generate the client on a glibc host instead, add the musl target to
# prisma/schema.prisma: `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`.
#
# TODO(reproducibility): pin the base image by digest for immutable builds, e.g.
#   FROM node:22-alpine@sha256:<digest> AS base
# =============================================================================


# -----------------------------------------------------------------------------
# Shared base — one place to bump the Node version and OS-level deps.
# `libc6-compat` smooths over glibc/musl differences; `openssl` provides the
# libssl that Prisma's engines dynamically link against.
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
# Next.js build/telemetry should never phone home from CI or a container.
ENV NEXT_TELEMETRY_DISABLED=1


# -----------------------------------------------------------------------------
# Stage 1 — deps: install node_modules from the lockfile (dev + prod).
# Kept separate so this layer is cached and only re-runs when the lockfile
# (or package.json) changes, not on every source edit.
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Only the manifest + lockfile — maximizes Docker layer cache hits.
COPY package.json package-lock.json ./

# `npm ci` = clean, reproducible install straight from package-lock.json.
# We need devDependencies here because `next build` and `prisma generate`
# rely on them (typescript, prisma CLI, @types, etc.).
RUN npm ci


# -----------------------------------------------------------------------------
# Stage 2 — build: compile the app and generate the Prisma client.
# -----------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

# Reuse the installed dependencies from the deps stage.
COPY --from=deps /app/node_modules ./node_modules

# Copy the rest of the source. `.dockerignore` keeps this lean (no node_modules,
# .next, .git, tests, .env, etc.).
COPY . .

# Generate the Prisma client (writes to node_modules/.prisma/client and pulls the
# correct musl engine). Run BEFORE the build so server code can import it.
RUN npx prisma generate

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

# Produce the optimized production build. With `output: 'standalone'` this writes
# .next/standalone (server.js + minimal node_modules) and .next/static.
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
# assets and images. (This is the copy the note in the spec refers to.)
COPY --from=build --chown=nextjs:nodejs /app/public       ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# The standalone bundle: server.js + a pruned node_modules + traced app code.
# This lands the app's own node_modules at /app/node_modules.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./

# --- Prisma at runtime -----------------------------------------------------
# The entrypoint runs `prisma migrate deploy` on boot, but the Prisma CLI is a
# devDependency and is NOT traced into the standalone bundle. Prisma 6's CLI also
# pulls a real transitive closure (@prisma/config → effect, c12, empathic,
# deepmerge-ts, …), so cherry-picking a few dirs is fragile. Overlay the COMPLETE
# build-stage node_modules instead — this guarantees the CLI + engines + generated
# client are all present to run migrations fully OFFLINE at container start.
# (Trade-off: a larger image; a later optimization can trace just the CLI closure.)
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

# The Prisma schema + migration history — required by `prisma migrate deploy`.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/scripts ./scripts
# Keep the static catalog available to the idempotent Prisma seed task.
COPY --from=build --chown=nextjs:nodejs /app/src/data ./src/data
COPY --from=build --chown=nextjs:nodejs /app/src/lib/cycle-crypto.ts ./src/lib/cycle-crypto.ts

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
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
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
