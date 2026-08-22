# Lumi9 storefront

Marketing site + storefront for Lumi9 ("Cloud Soft") — 16 pages, built from
`design_handoff_lumi9/` on Next.js (App Router) + TypeScript + Tailwind CSS v4,
with the 3D avocado mascot rendered through react-three-fiber.

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
npm run lint
```

## Route map

| Design file (`.dc.html`) | Route |
| --- | --- |
| Lumi9 Home | `/` |
| Lumi9 Shop | `/shop` |
| Lumi9 PDP | `/product/[size]` — `nb` · `s` · `m` · `l` · `xl` |
| Lumi9 Cart | `/cart` |
| Lumi9 Checkout | `/checkout` |
| Lumi9 Confirmation | `/confirmation` |
| Lumi9 Subscription | `/subscription` |
| Lumi9 Size Guide | `/size-guide` |
| Lumi9 About | `/about` |
| Lumi9 Blog | `/journal` |
| Lumi9 Account | `/account` |
| Lumi9 FAQ | `/help` |
| Lumi9 Contact | `/contact` |
| Lumi9 Login | `/login` |
| Lumi9 404 | `not-found.tsx` (any unmatched path) |
| Lumi9 Privacy | `/privacy` |

## Layout of the code

```
src/
  app/                     one folder per route; server components by default
  components/
    site/                  Nav (solid · home · checkout · minimal), Footer, PageShell
    three/                 HeroMascot, FooterMascot, shared model/light rig
    motion/                Reveal, Parallax, FloatyBlob
    ui/                    Icon set, Accordion, QtyStepper, small display bits
    home|shop|pdp|cart|…   per-screen interactive pieces (client components)
  lib/
    catalog.ts             sizes, pack tiers, prices, shipping rules, ₹ formatting
    content.ts             all marketing copy from the handoff
    cart.tsx               cart + last-order store (localStorage) via useSyncExternalStore
    motion.ts              reduced-motion, shared reveal observer, shared parallax rAF loop
```

Design tokens live in `src/app/globals.css` as a Tailwind v4 `@theme` block —
colours (`moss`, `moss-deep`, `midnight`, `butter`, `paper`, …), the two font
families, the shadow ladder, and the `marquee` / `floaty` keyframes. Repeated
patterns (`.eyebrow`, `.btn`, `.chip`, `.field`, `.panel`, `.blob-pattern`,
`.reveal`) are component classes in the same file.

## Responsive model

Layout is **fluid first, breakpoints second**: spacing, radii and the recurring
type roles are `clamp()` tokens that interpolate with the viewport, so the 1440px
design compresses continuously instead of snapping between two fixed states.

| Token | Utility | Range |
| --- | --- | --- |
| `--spacing-gutter` | `px-safe` (adds notch insets) | 18 → 48px |
| `--spacing-section` / `-lg` / `-sm` | `py-section` … | 48 → 130px |
| `--spacing-block` | `gap-block` | 28 → 64px |
| `--spacing-card` / `-lg` | `p-card` | 20 → 48px |
| `--radius-chip` / `card` / `panel` / `media` / `footer` | `rounded-card` … | 12 → 56px |
| `--text-eyebrow` / `lead` / `body` / `numeral` / `quote` | `text-lead` … | 12 → 88px |

Breakpoints then handle the things that must *re-flow* rather than merely scale:
column counts, sticky-vs-static rails, and the size-guide table (a real table
from `sm`, one card per size below it).

Other rules the whole app follows:

- **`coarse:` variant** (`@media (pointer: coarse)`) gives every control a ≥44px
  hit area on touch devices at any width — an 1024px iPad gets touch sizing while
  a 900px desktop window keeps the design's compact chrome.
- **Overflow instead of squeeze**: filter chips, nav links, PDP thumbnails, account
  tabs and the legal TOC use the `.scroll-row` utility (edge-to-edge horizontal
  scroll, hidden scrollbar) rather than wrapping into tall stacks.
- **`--nav-h`** is published by the `Nav` component via a `ResizeObserver`, so the
  home hero clears the fixed bar by its measured height at any width.
- **`svh` + height queries**: the hero uses `100svh` (no mobile-chrome jump) and
  drops its min-height under `max-height: 560px` so landscape phones don't overflow.
- **Inputs never below 16px**, so iOS Safari doesn't zoom on focus.
- Verified with an automated sweep of all 16 routes at 320/375/430/768/844×390/1024
  — no horizontal overflow and no sub-36px touch target anywhere.

## Notes for the next person

- **Fonts** — ABeeZee (display) and Hanken Grotesk (UI) load via `next/font/google`
  and are exposed as `font-display` / `font-ui`.
- **Mascot** — `public/assets/mascot.glb` is meshopt-compressed; drei's `useGLTF`
  bundles the decoder, so nothing is fetched from a CDN. The footer canvas mounts
  only when the footer is within 400px of the viewport. Both canvases fall back
  quietly (hero shows "Lumi is napping") if WebGL or the GLB fails.
- **Mascot framing** — `FitCamera` measures the loaded model (`MascotExtents`:
  half-height, plus the XZ radius = the widest silhouette any Y-rotation can
  produce) and pulls the camera back to whichever of the vertical/horizontal limits
  is tighter for the current canvas ratio. So the mascot is never clipped on a
  narrow phone canvas or a wide footer panel, at any point of its sway. `padding`
  eases from generous on desktop to near edge-to-edge on a phone, so it scales up
  to fill a small frame instead of shrinking into it.
- **Motion** — one IntersectionObserver drives every `.reveal`; one rAF loop drives
  every `<Parallax>`. Both no-op under `prefers-reduced-motion`, as does the
  5-layer auto-advance.
- **Responsive** — mobile-first against the handoff's single 768px breakpoint
  (`md:` = the 1440px design). The mobile nav keeps the CTA on row one and lets the
  link row scroll horizontally instead of stacking to three rows.
- **Demo cart** — `SEED_DEMO_CART` in `src/lib/cart.tsx` seeds the three line items
  from the Cart/Checkout designs on a first visit so those screens are reviewable.
  **Set it to `false` before shipping to real shoppers.**
- **Placeholder data** — prices, order history, addresses, reviews and journal posts
  are the handoff's placeholder content. Product data is centralised in
  `lib/catalog.ts`; everything else is in `lib/content.ts`.
- **Not wired to a backend** — newsletter, contact, promo code, auth and payment
  submit to local state only. Each has a single obvious call site to replace.
