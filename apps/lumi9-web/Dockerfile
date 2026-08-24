# =============================================================================
# Lumi9 web — production image (Next.js standalone on Alpine, non-root).
#
# ── BUILD CONTEXT IS THE WORKSPACE ROOT, NOT THIS DIRECTORY ──────────────────
# npm workspaces keep the lockfile and the hoisted node_modules at the repo
# root, so an app-scoped context cannot run `npm ci`. Build from the root and
# point at this file:
#
#   docker build -f apps/lumi9-web/Dockerfile -t lumi9-web .
#
# ── THIS BUILD USES ITS OWN IGNORE FILE ─────────────────────────────────────
# BuildKit prefers `<dockerfile>.dockerignore` over the context's root one, so
# `apps/lumi9-web/Dockerfile.dockerignore` governs here. That matters: the root
# .dockerignore excludes apps/lumi9-web/** (it was written for Femi9's build,
# where this brand's source is dead weight). Reusing it would produce an image
# with no application in it. Femi9's build is untouched by this and keeps using
# the root file.
#
# ── THE RUNTIME LAYOUT IS THE ONE NEXT PRODUCED ─────────────────────────────
# Femi9's image FLATTENS the standalone bundle to /app/server.js, preserving the
# layout it had before the monorepo so its task definition kept working. This
# one does not, and that is the single most important line in the file: see the
# runner stage for why moving the bundle two levels up dangles every symlink
# Turbopack wrote into .next/node_modules and 500s every route.
#
# The consequence to know about: the working directory is /app/apps/lumi9-web,
# not /app. A one-off task overriding CMD gets paths relative to that.
# =============================================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1


# -----------------------------------------------------------------------------
# Stage 1 — deps: install the workspace dependencies.
# Separate so the layer is cached and only re-runs when a manifest or the
# lockfile changes, not on every source edit.
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Only the manifests + lockfile — maximises Docker layer cache hits.
# EVERY workspace manifest has to be here: `npm ci` reconciles the root lockfile
# against all of them and fails on one it cannot find. That includes admin and
# db-platform, which this app never imports.
COPY package.json package-lock.json ./
COPY apps/femi9-web/package.json apps/femi9-web/
COPY apps/lumi9-web/package.json apps/lumi9-web/
COPY apps/admin/package.json apps/admin/
COPY packages/db/package.json packages/db/
COPY packages/db-platform/package.json packages/db-platform/
COPY packages/core/package.json packages/core/

# Clean, reproducible install straight from the lockfile. devDependencies are
# required: `next build` and `prisma generate` both live there.
#
# Scoped to this workspace so Femi9's dependency tree — its own Next, its
# Sentry, its MaxMind reader — never enters this image. The runner stage
# overlays this whole node_modules, so anything installed here ships.
RUN npm ci --workspace lumi9-web --include-workspace-root


# -----------------------------------------------------------------------------
# Stage 2 — build: compile the app and generate the Prisma client.
# -----------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# The rest of the workspace. Dockerfile.dockerignore keeps this lean.
COPY . .

# Generate the brand Prisma client BEFORE the build, so server components can
# import it. Writes to the hoisted node_modules/.prisma/client and pulls the
# musl engine that matches this Alpine base.
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

WORKDIR /app/apps/lumi9-web

# NEXT_PUBLIC_* values are inlined into the CLIENT bundle at `next build` time —
# they are NOT read from the container env at runtime. So they arrive as build
# args (CI passes them; empty defaults keep a bare `docker build` working).
#
# NEXT_PUBLIC_RAZORPAY_KEY_ID_LUMI9 is the per-brand form the checkout widget
# resolves first. Passing the shared NEXT_PUBLIC_RAZORPAY_KEY_ID instead is
# valid and is what runs today, while both brands transact on Femi9's account.
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID=""
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID_LUMI9=""
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID \
    NEXT_PUBLIC_RAZORPAY_KEY_ID_LUMI9=$NEXT_PUBLIC_RAZORPAY_KEY_ID_LUMI9

# Produce the optimised production build. The root layout is force-dynamic
# because the catalogue is read live, so this stage needs NO database
# credentials — which is the only reason it can run in CI at all.
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 3 — runner: minimal, hardened, NON-root runtime image.
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

# PORT/HOSTNAME matter: the standalone server binds localhost by default, and a
# task that binds localhost never passes an ALB health check.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Unprivileged runtime user. uid/gid 1001 matches Femi9's image and Vercel's
# reference Dockerfile.
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# --- The standalone bundle, WITH ITS NESTED LAYOUT INTACT --------------------
# `output: 'standalone'` traced from the workspace root emits
#   .next/standalone/apps/lumi9-web/server.js   +   .next/standalone/node_modules
# and those two paths are related by more than convention. Turbopack writes its
# externalised server packages into apps/lumi9-web/.next/node_modules as RELATIVE
# SYMLINKS -- @prisma/client-<hash> -> ../../../../../node_modules/@prisma/client
# -- counted from exactly this depth.
#
# Femi9's image flattens the bundle to /app/server.js, which is byte-for-byte
# the layout it had before the monorepo and keeps its task definition working.
# Doing the same here moved every one of those symlinks two levels up, so each
# resolved to /node_modules/... and dangled. The image built, started, and
# answered 500 on EVERY route with "Cannot find module
# '@prisma/client-2c3a283f134fdcb6'". Nothing but running the container shows it.
#
# So this image keeps the layout Next produced. There is no legacy task
# definition to preserve for a service that has never been deployed.
COPY --from=build --chown=nextjs:nodejs /app/apps/lumi9-web/.next/standalone/ ./

# public/ and .next/static are NOT bundled into standalone -- copy them beside
# server.js. Lumi9's public/ is the heavy one: pack photography, the mascot GLB
# and its Draco decoder, all of which next.config marks immutable.
COPY --from=build --chown=nextjs:nodejs /app/apps/lumi9-web/public       ./apps/lumi9-web/public
COPY --from=build --chown=nextjs:nodejs /app/apps/lumi9-web/.next/static ./apps/lumi9-web/.next/static

# --- Prisma at runtime -----------------------------------------------------
# The entrypoint runs `prisma db execute` and `prisma migrate deploy`, but the
# Prisma CLI is a devDependency and is NOT traced into the standalone bundle.
# Prisma 6's CLI also pulls a real transitive closure (@prisma/config -> effect,
# c12, empathic, deepmerge-ts ...), so cherry-picking directories is fragile.
# Overlay the COMPLETE build-stage node_modules: a strict superset of the traced
# one, at the exact path those symlinks above expect, which guarantees CLI +
# engines + generated client are present and migrations run fully OFFLINE.
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

# The workspace packages. npm links every workspace into node_modules as a
# SYMLINK (node_modules/@femi9/core -> ../../packages/core) and the overlay
# above copies those links verbatim; without their targets on disk each one
# dangles. The TypeScript sources are a rounding error next to node_modules.
COPY --from=build --chown=nextjs:nodejs /app/packages ./packages

# --- The one-off task surface ----------------------------------------------
# The seed scripts, NOT run on boot: this same image is launched as a one-off
# ECS task with CMD overridden to load Lumi9's catalogue and delivery zones.
# See infra/terraform/README.md.
#
# EVERY PATH BELOW IS THE WORKSPACE PATH, UNCHANGED. Relocating a script is
# what breaks it: seed.ts reads `../src/lib/catalog` and `../src/lib/content`,
# so copying prisma/ to some tidier name resolves those imports against a
# directory that is not there. The failure lands on the one-off task, long
# after the image deployed and passed every health check. So: prisma/ stays
# prisma/, src/lib stays src/lib, and the shared schema is reached at its real
# location under packages/ -- which the COPY above already put in place.
COPY --from=build --chown=nextjs:nodejs /app/apps/lumi9-web/prisma  ./apps/lumi9-web/prisma
COPY --from=build --chown=nextjs:nodejs /app/apps/lumi9-web/src/lib ./apps/lumi9-web/src/lib

# Recreate the `.bin/prisma` shim -- COPY does not reliably preserve the
# generated bin symlink, and without it `npx prisma` tries to DOWNLOAD the CLI,
# which fails in a task with no egress and turns migrations into a boot loop.
RUN mkdir -p node_modules/.bin \
 && ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
 && chmod +x node_modules/prisma/build/index.js

# Everything from here runs from the app directory, where server.js lives.
WORKDIR /app/apps/lumi9-web

# Next writes ISR/cache artifacts under .next/cache -- the non-root user needs it.
RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

COPY --chown=nextjs:nodejs apps/lumi9-web/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# Container-level probe. In production the ALB target group health check on
# /api/health is authoritative; this one exists so `docker ps` and Compose can
# tell a booting container from a wedged one. `wget` is BusyBox's, from Alpine.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
