import { Reveal } from './Reveal'

export function Story() {
  return (
    <section className="section story" id="story">
      <div className="wrap story-in">
        <Reveal>
          <span className="eyebrow">Our story</span>
          <h2 className="display">
            Built by a doctor. Backed by women. Made for <em>every body.</em>
          </h2>
          <p className="lead">
            Femi9 began with a simple belief: period care should be safe, honest and genuinely
            comfortable. Today it is also a movement that puts income and dignity into women's hands.
          </p>
          <div className="founders">
            <div className="founder">
              <b>Dr. Gomathi</b>
              <span>Founder</span>
              <small>
                Leads the brand with her medical expertise, focused on safe, comfortable and
                innovative period care.
              </small>
            </div>
            <div className="founder">
              <b>Nayanthara &amp; Vignesh Shivan</b>
              <span>Co-founders</span>
              <small>
                Drive the mission to break period taboos and grow real social impact through
                awareness.
              </small>
            </div>
          </div>
        </Reveal>

        <Reveal className="story-quote" delay={2}>
          <p className="q">
            "Beyond menstrual care, we support over <b>5,000 women entrepreneurs</b>, turning better
            periods into economic independence."
          </p>
          <p className="attr">The Femi9 mission</p>
          <a href="#products" className="btn btn-primary">
            Shop pads
          </a>
        </Reveal>
      </div>
    </section>
  )
}
