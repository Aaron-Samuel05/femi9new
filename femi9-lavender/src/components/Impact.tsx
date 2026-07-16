import { Reveal } from './Reveal'

export function Impact() {
  return (
    <section className="section impact" id="impact">
      <div className="wrap impact-in">
        <Reveal className="impact-copy">
          <h2 className="display">Every pack funds a livelihood.</h2>
          <p>
            Femi9 pads reach you through a network of women entrepreneurs across Tamil Nadu.
            Buying a pack puts money into that network. The pack itself breaks down instead of
            outliving you in a landfill.
          </p>
        </Reveal>

        <Reveal className="impact-figure" delay={1}>
          <b className="impact-num">5,000+</b>
          <span className="impact-num-label">
            women entrepreneurs across Tamil Nadu earn from the packs they sell.
          </span>
          <ul className="impact-facts">
            <li>Biodegradable, cover to core.</li>
            <li>No chlorine, no bleach, no synthetic fragrance.</li>
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
