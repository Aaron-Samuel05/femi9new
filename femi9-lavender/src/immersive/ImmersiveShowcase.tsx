import { CycleModeToggle } from './CycleMode'
import { PadSelector } from './PadSelector'

/**
 * The immersive block that stitches the interactive spec pieces into one
 * editorial storefront moment (spec §2 selector, §3 cycle mode, §5 typography).
 * Dropped into the Home page as a normal section.
 *
 * The exploded anatomy that used to live at the foot of this section is now
 * <PadExploder>, mounted directly in Home so its sticky stage has as few
 * ancestors as possible.
 */
export function ImmersiveShowcase() {
  return (
    <section id="immersive" className="immersive section">
      <div className="wrap">
        <header className="immersive-head">
          <div>
            <h2 className="display immersive-title">
              Choose by <em>feel</em>,<br />
              not by guesswork.
            </h2>
          </div>
          <CycleModeToggle />
        </header>

        <div className="immersive-grid">
          <PadSelector />
          <div className="immersive-copy">
            <p>
              Drag from spotting to heavy flow and watch the pad respond in real
              time. Length, absorbency and cushioning all shift as you go, so
              the fit is something you feel rather than guess.
            </p>
            <ul className="immersive-points">
              <li>Five real Femi9 lengths, 155mm to 425mm overnight.</li>
              <li>The whole site changes mood with your cycle phase.</li>
              <li>No dropdowns, no size charts to decode.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
