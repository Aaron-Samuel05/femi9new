# `<pad-exploder>` — scroll-driven exploded pad view

A self-contained Web Component: as the visitor scrolls, a sanitary pad separates
into its nine layers on a `<canvas>`, then labelled callouts fade in. Works in
plain HTML, React, Vue, WordPress — anything that renders HTML — with **zero
dependencies and no build step**.

```
your-site/
├── pad-exploder.js          ← the component (one file)
└── frames/
    └── optimised/           ← 90 × frame-001…090 (.webp + .jpg fallback)
```

## Install

1. Copy `pad-exploder.js` and the `frames/optimised/` folder into your project.
2. Add the script tag (anywhere, `defer` is fine):

```html
<script src="/path/to/pad-exploder.js" defer></script>
```

3. Drop the element where the section should appear:

```html
<pad-exploder frames-path="/path/to/frames/optimised/"></pad-exploder>
```

That's it. All styling is inside the component's Shadow DOM — your site's CSS
cannot break it and it cannot leak into your site. It cleans up after itself
on unmount, so it's safe in React strict mode / SPA route changes, and it is
SSR-safe (the script is a no-op during Next.js/Nuxt server renders).

### Recommended: give it fallback content

For SEO, screen readers and JS-disabled visitors, put the real copy in the
element's light DOM (see `demo.html` for the full version):

```html
<pad-exploder frames-path="/frames/optimised/">
  <h2>What's inside</h2>
  <p>Nine thoughtful layers, working together.</p>
  <dl>
    <dt>1. Soft Top Layer</dt><dd>Your one-liner.</dd>
    <!-- … all nine layers … -->
  </dl>
</pad-exploder>
```

With JS running this content is visually hidden but stays in the accessibility
tree; without JS it renders as normal HTML. If you omit it, the component
generates an equivalent `<dl>` from its built-in label config.

## ⚠️ Integration gotcha #1: `overflow: hidden` breaks the animation

The component relies on `position: sticky`. **If ANY ancestor of
`<pad-exploder>` has `overflow: hidden`, `overflow: auto`, `overflow-x: hidden`
or `overflow: clip`, sticky positioning silently stops working** — the pad will
scroll away with the page instead of pinning while the layers separate.

If the animation "scrolls past instead of sticking", walk up the DOM from the
component and check every ancestor (including `body` and `html`) in DevTools:

```js
let n = document.querySelector('pad-exploder');
while ((n = n.parentElement)) {
  const o = getComputedStyle(n).overflow;
  if (o !== 'visible') console.log('sticky-breaker →', n, o);
}
```

Common culprits: `overflow-x: hidden` on `body` (used to stop horizontal
scroll), carousel/section wrappers, and `main { overflow: hidden }` in themes.
Fix by removing the rule or moving `<pad-exploder>` outside that wrapper.

## Attributes

| Attribute       | Default                | What it does |
|-----------------|------------------------|--------------|
| `frames-path`   | `./frames/optimised/`  | Folder with `frame-001.webp/.jpg` … Relative or absolute URL; trailing `/` optional. Everything resolves from here — no hardcoded paths. |
| `frame-count`   | `90`                   | How many frames are in the folder. |
| `reverse`       | `true`                 | `true` = files run exploded→closed on disk (our case), so scrolling down plays them **backwards** (closed → exploded). Set `reverse="false"` if you ever re-export frames in the other order. |
| `scroll-length` | `400vh`                | Height of the scroll runway. Bigger = slower, more cinematic scrub; smaller = quicker. `300vh`–`600vh` is the sweet spot. |
| `heading`       | `What's inside`        | Section heading. |
| `intro-text`    | *(built-in line)*      | One-liner under the heading (hidden on small screens). |
| `frame-ext`     | `auto`                 | `auto` picks WebP where supported, JPG elsewhere. Force with `webp` or `jpg`. |
| `debug`         | *(off)*                | Present = show magenta anchor dots (see tuning below). `?debug` in the page URL works too. |

## Tuning the label positions (you'll want to do this once)

All nine callouts live in **one config array at the top of
`pad-exploder.js`** — `LABELS`, around **line 64**. Each callout *tracks its
layer* while the pad expands, so an entry holds a small keyframe track:

```js
{ name: 'Cotton Layer', desc: 'One-line description goes here.', side: 'left',
  track: [{ f: 60, x: 31, y: 53 }, { f: 75, x: 31, y: 51 }, { f: 90, x: 30, y: 49 }] }
```

- `f` — the **expansion frame** (1 = closed pad … 90 = fully exploded;
  playback order, i.e. the reverse of the file numbering).
- `x` / `y` — the anchor dot position at that frame, as a **percentage of
  the canvas** (0–100). Between keyframes the position is interpolated, so
  the dot, line and text glide along with the layer as you scroll.
- `side` — `'left'` or `'right'`: which side the text sits on (desktop only;
  mobile uses a compact grid below the pad). Sides don't strictly alternate:
  layer 4 shows its face on the left and layer 5 on the right, because each
  partly hides the other in the render.
- `desc` — placeholder. Replace each with your real one-liner.
  Layers 4/8 (Cotton) and 5/7 (Air Laid Paper) repeat **on purpose** —
  the pad is symmetrical.

Workflow:

1. **Final look**: open `demo.html?debug&pe-progress=1` — every anchor is a
   magenta dot labelled `n · x,y`. Nudge the `f: 90` keyframes until each
   dot kisses its layer.
2. **Mid-flight tracking**: `?debug&pe-progress=0.6` (≈ frame 60) and
   `?debug&pe-progress=0.73` (≈ frame 75) freeze the expansion at the other
   keyframes — adjust those entries the same way. Add a fourth keyframe to
   any track if its layer drifts between them.
3. Remove `?debug…` from the URL when happy.

Other knobs, all at the top of the file (lines ~95–112):

- `REVEAL_START_FRAME` / `REVEAL_END_FRAME` — the expansion-frame window
  across which the nine callouts appear **one by one** (defaults: first at
  frame 60, last landing exactly as the final frame settles). Scrolling
  back up removes them in reverse order.
- `REVEAL_HYST_FRAMES` — how many frames back you must scrub past a
  callout's threshold before it hides (prevents flicker at the boundary).
- `END_HOLD` — the fraction of the runway at the end that holds the finished
  view still (default 0.12): the pad is fully exploded by 88% scroll and the
  remaining stretch is a quiet dwell so the user gets a beat to take it in.
- `FADE_MS`, `CONNECTOR_PX` — fade duration and connector line length.
- Scroll speed per-instance: the `scroll-length` attribute (no code edit).

## Behaviour notes

- **Rendering**: frames draw to a `<canvas>` (no `<img>`-swap flicker),
  devicePixelRatio-aware, contain-fit and centred, redrawn only when the frame
  index changes, inside `requestAnimationFrame`.
- **Choreography**: the explosion completes at 88% of the runway; the first
  callout appears at expansion frame 60 and the rest follow one by one, each
  **riding along with its layer** (anchor positions are keyframe-interpolated
  per frame) until everything locks in as the final frame settles. The last
  12% of the runway is a still hold with everything in place. All of it is
  scroll-driven, so scrubbing back and forth replays it exactly.
- **Loading**: all frames are preloaded and decoded before the scrub enables,
  behind a progress indicator, so the first scroll is stutter-free.
- **Missing frames**: single 404s borrow the nearest loaded frame; if a `.webp`
  is missing it retries `.jpg`; if *nothing* loads the section collapses to the
  readable text content — never a blank box.
- **Reduced motion**: `prefers-reduced-motion: reduce` skips the scrub and
  shows the final exploded frame with all labels visible, no scroll runway.
- **Accessibility**: canvas has a descriptive `aria-label`; the real copy is a
  semantic `<dl>` in the light DOM; decorative shadow-DOM visuals are
  `aria-hidden` so nothing is announced twice.
- **No scroll hijacking**: listeners are passive; the host page's scroll is
  never intercepted or smoothed.
- Resize, orientation change, and starting hidden (`display:none` tabs,
  accordions) are all handled; nothing is cached that a resize could stale.

## Regenerating / replacing frames

Name files `frame-001.webp` … zero-padded, 3 digits, starting at 1, with
matching `.jpg` fallbacks, and set `frame-count`. If your new sequence plays
closed→exploded on disk, set `reverse="false"`.

## Local preview

Browsers block image loading from `file://` pages inconsistently — serve the
folder instead. Any static server works:

```
cd <this folder>
npx serve .          # or: python -m http.server 8000
```

then open `http://localhost:3000/demo.html` (port per the server's output).
