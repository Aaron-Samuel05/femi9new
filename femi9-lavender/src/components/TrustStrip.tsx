import { Leaf, Drop, Recycle, ShieldCheck } from './Icons'

const ITEMS = [
  { Icon: Leaf, title: 'Certified organic cotton', sub: 'Soft, plant-based top sheet' },
  { Icon: Drop, title: 'Anion comfort strip', sub: 'Helps ease cramps and odour' },
  { Icon: Recycle, title: '100% biodegradable', sub: 'Kinder to the planet' },
  { Icon: ShieldCheck, title: 'Toxin-free & gentle', sub: 'Hypoallergenic, chlorine-free' },
]

export function TrustStrip() {
  return (
    <section className="trust">
      <div className="wrap trust-in">
        {ITEMS.map(({ Icon, title, sub }) => (
          <div className="t" key={title}>
            <Icon />
            <div>
              <b>{title}</b>
              <span>{sub}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
