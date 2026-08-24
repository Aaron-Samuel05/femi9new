# =============================================================================
# Admin console — production image (Next.js standalone on Alpine, non-root).
#
# ── BUILD CONTEXT IS THE WORKSPACE ROOT, NOT THIS DIRECTORY ──────────────────
#   docker build -f apps/admin/Dockerfile -t admin-web .
#
# ── TWO PRISMA GENERATORS, TWO OUTPUT PATHS ─────────────────────────────────
# This is the only image that needs both. `@femi9/db` writes the brand client to
# the default node_modules/.prisma/client; `@femi9/db-platform` writes to a
# package-local generated/ directory, because two generators aimed at the
# default path silently overwrite each other. The build stage therefore runs
# `prisma generate` TWICE, and the runner stage carries packages/ so the second
# one's output can still be resolved through its workspace symlink.
#
# ── NO public/ ──────────────────────────────────────────────────────────────
# The console ships no static assets — no logo files, no fonts, no images. There
# is deliberately no `COPY … public ./public` below; adding one would fail the
# build on a directory that does not exist.
# =============================================================================

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
ENV NEXT_TELEMETRY_DISABLED=1


# -----------------------------------------------------------------------------
# Stage 1 — deps.
# -----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app

# Every workspace manifest: `npm ci` reconciles the root lockfile against all of
# them and fails on one it cannot find.
COPY package.json package-lock.json ./
COPY apps/femi9-web/package.json apps/femi9-web/
COPY apps/lumi9-web/package.json apps/lumi9-web/
COPY apps/admin/package.json apps/admin/
COPY packages/db/package.json packages/db/
COPY packages/db-platform/package.json packages/db-platform/
COPY packages/core/package.json packages/core/

# Scoped to this workspace, so neither storefront's dependency tree ships here.
RUN npm ci --workspace admin-web --include-workspace-root


# -----------------------------------------------------------------------------
# Stage 2 — build.
# -----------------------------------------------------------------------------
FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Both clients, before the build, so server components can import either.
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma \
 && npx prisma generate --schema=packages/db-platform/prisma/schema.prisma

WORKDIR /app/apps/admin

# The console has no NEXT_PUBLIC_* values at all — no analytics, no payment
# widget, no public site URL. Nothing about it is configured at build time,
# which is a small but real security property: the image is identical for every
# environment and carries no environment's identity.

# This build must succeed with NO database credentials — the build stage has
# none, and they arrive at deploy time from Secrets Manager. `platformDb()` is
# called inside request handlers, never at module scope, which is what makes
# that possible. Keep it that way.
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 3 — runner.
# -----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Client-side chunks. (No public/ — see the header.)
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/static ./.next/static

# The standalone bundle, FLATTENED to /app/server.js — same layout as both
# storefront images, so one task-definition shape covers all three services.
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/standalone/apps/admin/. ./

# The complete build-stage node_modules: the Prisma CLI is a devDependency and
# is not traced into the bundle, but the entrypoint needs it to migrate.
COPY --from=build --chown=nextjs:nodejs /app/node_modules ./node_modules

# The workspace packages. Required here, not merely prudent: the platform Prisma
# client is generated to packages/db-platform/generated/, and the only path that
# reaches it is the node_modules/@femi9/db-platform symlink copied above. Drop
# this line and the console starts, then 500s on the first login attempt.
COPY --from=build --chown=nextjs:nodejs /app/packages ./packages

# The platform schema + its migration history, at the path the entrypoint uses.
# Named prisma-platform/ rather than prisma/ so it can never be confused with a
# brand schema by a future one-off task.
COPY --from=build --chown=nextjs:nodejs /app/packages/db-platform/prisma ./prisma-platform

# The create-admin script, so the first account can be made with a one-off ECS
# task on this same image instead of from somebody's laptop against production.
COPY --from=build --chown=nextjs:nodejs /app/packages/db-platform/scripts ./scripts-platform

# Recreate the `.bin/prisma` shim — COPY does not reliably preserve the
# generated symlink, and without it `npx prisma` tries to DOWNLOAD the CLI,
# which fails in a task with no egress and turns migrations into a boot loop.
RUN mkdir -p node_modules/.bin \
 && ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
 && chmod +x node_modules/prisma/build/index.js

RUN mkdir -p .next/cache && chown -R nextjs:nodejs .next

COPY --chown=nextjs:nodejs apps/admin/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

# /api/health is excluded from the route guard in proxy.ts — the load balancer
# has no session and never will.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
