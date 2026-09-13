import { CycleModeToggle } from './CycleMode'
import { PadSelector } from './PadSelector'
import { ExplodedPad } from './ExplodedPad'

export function ImmersiveShowcase() {
  return (
    <section id="immersive" className="immersive section">
      <div className="wrap">
        <header className="immersive-head">
          <div>
            <span className="eyebrow">A sensorial fit</span>
            <h2 className="display immersive-title">Choose by <em>feel</em>,<br />not by guesswork.</h2>
          </div>
          <CycleModeToggle />
        </header>
        <div className="immersive-grid">
          <PadSelector />
          <div className="immersive-copy">
            <p>Explore the Femi9 range by flow and fit. The 330mm XL collection is designed for heavier flow and overnight protection, while the 290mm Large range is positioned for regular everyday use.</p>
            <ul className="immersive-points">
              <li>330mm XL Double Wings — 9 pads · ₹225.</li>
              <li>330mm XL Centre Wings — 9 pads · ₹225.</li>
              <li>290mm Large — 9 pads · ₹198, with smaller trial packs also available.</li>
              <li>Free shipping on orders above ₹999.</li>
            </ul>
          </div>
        </div>
      </div>
      <div className="wrap">
        <header className="immersive-subhead">
          <span className="eyebrow">Radical transparency</span>
          <h3 className="display">Scroll to open it up.</h3>
          <p>See a tactile 3D interpretation of the Femi9 pad anatomy as you scroll, backed by an actual Femi9 product-detail photograph so the experience stays connected to the real product.</p>
        </header>
      </div>
      <ExplodedPad />
    </section>
  )
}
