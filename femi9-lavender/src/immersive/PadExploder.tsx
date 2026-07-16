import { Fragment } from 'react'

/**
 * Scroll-driven exploded pad view. The work happens in <pad-exploder>, a
 * zero-dependency web component loaded from public/pad-exploder.js; React only
 * renders the element and its light-DOM fallback.
 *
 * The children below are NOT decoration. With JS running the component hides
 * them visually but keeps them in the accessibility tree; if the script or the
 * frames fail to load, this is what renders instead of a blank band. Keep the
 * copy here in sync with the LABELS array in pad-exploder.js.
 *
 * Note: <pad-exploder> pins itself with position:sticky, so it must not gain an
 * ancestor with overflow hidden/auto/scroll. See the note on body in base.css.
 */
const LAYERS: Array<[string, string]> = [
  ['1. Soft Top Layer', 'Certified organic cotton. The only thing that touches your skin.'],
  ['2. Side Leakage Guard', 'Raised edges that keep the flow where it belongs when you move.'],
  ['3. 9 Smart Benefits', 'The anion strip, helping control odour through the day.'],
  ['4. Cotton Layer', 'Organic cotton that spreads flow evenly instead of letting it pool.'],
  ['5. Air Laid Paper', 'A breathable sheet that carries moisture down and away from you.'],
  ['6. Absorbent Gel', 'The core. Locks liquid into a gel so the surface stays dry.'],
  ['7. Air Laid Paper', 'The mirror sheet under the core, keeping the pad flat and even.'],
  ['8. Cotton Layer', 'The second cotton pass. It is why the pad stays thin, not stiff.'],
  ['9. Breathable Layer', 'The back sheet. Lets air through, then breaks back down after.'],
]

export function PadExploder() {
  return (
    <pad-exploder
      id="anatomy"
      frames-path="/assets/pad-frames/"
      frame-count="90"
      reverse="true"
      scroll-length="420vh"
      heading="Every layer, in the open."
      intro-text="Nine layers, each doing one job. Here is exactly what sits against your skin."
    >
      <h2>Every layer, in the open.</h2>
      <p>Nine layers, each doing one job.</p>
      <dl>
        {LAYERS.map(([name, desc]) => (
          <Fragment key={name}>
            <dt>{name}</dt>
            <dd>{desc}</dd>
          </Fragment>
        ))}
      </dl>
    </pad-exploder>
  )
}
