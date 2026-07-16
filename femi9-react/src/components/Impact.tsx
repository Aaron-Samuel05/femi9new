import { Reveal } from './Reveal'

const STATS = [
  { value: '5,000+', label: 'Women entrepreneurs supported' },
  { value: '100%', label: 'Biodegradable materials' },
  { value: 'Zero', label: 'Toxins, chlorine or bleach' },
]

export function Impact() {
  return (
    <section className="section impact" id="impact">
      <div className="wrap impact-in">
        <Reveal className="impact-copy">
          <h2>Good for you. Good for her. Good for Earth.</h2>
          <p>
            Every Femi9 pack is designed to be biodegradable and toxin-free, and every purchase
            helps fund a growing network of women entrepreneurs across Tamil Nadu and beyond.
          </p>
        </Reveal>
        <Reveal className="stats" delay={1}>
          {STATS.map((s) => (
            <div className="stat" key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}
