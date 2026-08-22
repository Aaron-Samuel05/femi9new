# CLAUDE.md — femi9-platform

Workspace root. Two consumer brands, one shared backend.

## The map

```
apps/
  femi9-web/    Femi9 storefront + account + (for now) the ops console.
                Next 15.5 · hand-written CSS · Prisma/Postgres · LIVE.
                Has its own CLAUDE.md — read it before touching this app.
  lumi9-web/    Lumi9 storefront. Next 16.3 · Tailwind v4.
                Frontend only: no backend, no database, cart in localStorage.
packages/       (empty — Phase 1 lands db/ and core/ here)
```

Everything else at this root is **dead**: `femi9-app/`, `femi9-react/`,
`femi9-scrool/`, `femi9-lavender/`, `index.html`, `app.js`, `styles.css`,
`assets/`, `Images/`. Superseded by `apps/femi9-web`. Never read them for
patterns, never edit them. The PDFs are product docs and are worth consulting.

## Where the plan lives

`apps/femi9-web/docs/TWO-BRAND-ARCHITECTURE.md` is the agreed design and the
phase list. Read it before any structural work. The short version:

- Separate domains, **fully separate customer bases** (no shared `User`).
- "One backend" means **one shared `packages/core`**, not an extracted API
  service — App Router server components read Postgres directly and must keep
  doing so.
- **One Postgres, three schemas**: `femi9` · `lumi9` · `platform`. Isolation
  lives in the connection string, so a brand cannot read another's rows.
- The admin console picks its brand with a **segmented toggle on the login
  form**. That toggle is untrusted client input — `AdminBrandRole` decides.

## Commands

```bash
npm install          # ALWAYS here. One hoisted lockfile; apps have none.
npm run dev:femi9    # :3000
npm run dev:lumi9    # :3001
npm run build        # turbo — both apps
npm run typecheck
```

`npm ci` only works at this root. There is no app-level `package-lock.json`.

## Things that will bite

**Docker builds from THIS directory**, not from the app:
```bash
docker build -f apps/femi9-web/Dockerfile -t femi9-web .
```
The context must be the workspace root because `npm ci` needs the hoisted
lockfile. `.dockerignore` here is load-bearing — it is what keeps `.env`, the
legacy prototypes and the other brand's source out of the image.

**`three` must stay single-versioned across the workspace.** Two copies gives
`@react-three/fiber` one `PerspectiveCamera` type and an app another, and casts
between them fail to compile. femi9-web declares the 3D stack but imports none
of it; its versions exist only to match lumi9-web.

**The two apps are on different Next majors** (15.5 vs 16.3), so lumi9's `next`
does not hoist. Phase 0b aligns them.

**`apps/femi9-web/.github/workflows/deploy.yml` is inert.** GitHub only runs
workflows from `<repo>/.github/workflows`. It has never executed. The two that
DO run are `ci.yml` and `deploy-staging.yml` at this root.

**`npm test` in femi9-web truncates every table.** Never run it against a `.env`
pointing at staging or production.
