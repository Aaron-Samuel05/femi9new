import { Drop, Leaf, ShieldCheck } from './Icons'

export function WhyBento() {
  return (
    <section className="section why" id="why">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <h2 className="display">Why it feels different.</h2>
            <p style={{ marginTop: 12 }}>Four things we got right, so your day stays yours.</p>
          </div>
        </div>

        <div className="bento">
          <div className="cell cell-img">
            {/* This section sits ~6000px down the page, so there is no reason
                to fetch these on load. */}
            <img
              src="/assets/img/pad-detail-1.webp"
              alt="Close-up of a Femi9 double-wing pad on a soft textured surface"
              width={760}
              height={1013}
              loading="lazy"
              decoding="async"
            />
            <div className="cell-cap">Double-wing security, barely-there feel.</div>
          </div>

          <div className="cell cell-butter">
            <h3>
              <span className="ico"><Drop /></span>The anion strip
            </h3>
            <p>
              A functional strip that helps control odour and eases cramps, so you feel steadier
              through the day.
            </p>
          </div>

          <div className="cell cell-sage">
            <h3>
              <span className="ico"><Leaf /></span>Cotton-soft top
            </h3>
            <p>Ultra-thin, breathable layers that stay dry and gentle on sensitive skin.</p>
          </div>

          <div className="cell cell-lilac cell-wide">
            <h3>
              <span className="ico"><ShieldCheck /></span>Nothing nasty
            </h3>
            <p>
              Toxin-free, chlorine-free and hypoallergenic. Certified organic, through and through,
              for skin that deserves better.
            </p>
          </div>

          <div className="cell cell-img">
            <img
              src="/assets/img/pad-detail-2.webp"
              alt="Close-up of a Femi9 centre-wing pad styled with soft accessories"
              width={760}
              height={1013}
              loading="lazy"
              decoding="async"
            />
            <div className="cell-cap">Centre-wing fit for heavier nights.</div>
          </div>
        </div>
      </div>
    </section>
  )
}
