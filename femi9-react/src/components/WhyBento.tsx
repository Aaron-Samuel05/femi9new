import { Reveal } from './Reveal'
import { Drop, Leaf, ShieldCheck } from './Icons'

export function WhyBento() {
  return (
    <section className="section why" id="why">
      <div className="wrap">
        <Reveal className="sec-head" >
          <div>
            <h2>Why it feels different.</h2>
            <p style={{ marginTop: 12 }}>Four things we got right, so your day stays yours.</p>
          </div>
        </Reveal>

        <div className="bento">
          <Reveal className="cell cell-img">
            <img
              src="/assets/img/pad-detail-1.jpg"
              alt="Close-up of a Femi9 double-wing pad on a soft textured surface"
            />
            <div className="cell-cap">Double-wing security, barely-there feel.</div>
          </Reveal>

          <Reveal className="cell cell-butter" delay={1}>
            <span className="ico">
              <Drop />
            </span>
            <h3>The anion strip</h3>
            <p>
              A functional strip that helps control odour and eases cramps, so you feel steadier
              through the day.
            </p>
          </Reveal>

          <Reveal className="cell cell-sage" delay={2}>
            <span className="ico">
              <Leaf />
            </span>
            <h3>Cotton-soft top</h3>
            <p>Ultra-thin, breathable layers that stay dry and gentle on sensitive skin.</p>
          </Reveal>

          <Reveal className="cell cell-lilac cell-wide" delay={1}>
            <span className="ico">
              <ShieldCheck />
            </span>
            <h3>Nothing nasty</h3>
            <p>
              Toxin-free, chlorine-free and hypoallergenic. Certified organic, through and through,
              for skin that deserves better.
            </p>
          </Reveal>

          <Reveal className="cell cell-img" delay={2}>
            <img
              src="/assets/img/pad-detail-2.jpg"
              alt="Close-up of a Femi9 centre-wing pad styled with soft accessories"
            />
            <div className="cell-cap">Centre-wing fit for heavier nights.</div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
