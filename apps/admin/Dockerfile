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
#
# ── THE WORKING DIRECTORY IS /app/apps/admin, NOT /app ──────────────────────
# Unlike Femi9's image, this one keeps the standalone bundle's nested layout.
# See the runner stage: flattening it dangles every symlink Turbopack wrote into
# .next/node_modules and every route answers 500.
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

# --- The standalone bundle, WITH ITS NESTED LAYOUT INTACT --------------------
# `output: 'standalone'` traced from the workspace root emits
#   .next/standalone/apps/admin/server.js   +   .next/standalone/node_modules
# and those two paths are related by more than convention. Turbopack writes its
# externalised server packages into apps/admin/.next/node_modules as RELATIVE
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
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/standalone/ ./

# Client-side chunks. (No public/ -- the console ships no static assets.)
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

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

# NOTE what is NOT copied here. The platform schema, its migrations and the
# create-admin script all live under packages/db-platform, which the COPY above
# already placed at its real workspace path -- so the entrypoint and any one-off
# task reach them there.
#
# An earlier version copied them to tidier names beside server.js, and
# create-admin died on `Cannot find module '../src/index'`: it imports the
# package it lives in, by a relative path that only holds at the original
# depth. Moving a script rewrites its imports. Don't move scripts.

# Recreate the `.bin/prisma` shim -- COPY does not reliably preserve the
# generated bin symlink, and without it `npx prisma` tries to DOWNLOAD the CLI,
# which fails in a task with no egress and turns migrations into a boot loop.
RUN mkdir -p node_modules/.bin \
 && ln -sf ../prisma/build/index.js node_modules/.bin/prisma \
 && chmod +x node_modules/prisma/build/index.js

# Everything from here runs from the app directory, where server.js lives.
WORKDIR /app/apps/admin

# Next writes ISR/cache artifacts under .next/cache -- the non-root user needs it.
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
