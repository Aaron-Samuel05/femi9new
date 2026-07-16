import { Reveal } from './Reveal'
import { Whatsapp } from './Icons'
import { WA_NUMBER } from '../data/products'

export function Cta() {
  return (
    <section className="section cta">
      <Reveal className="wrap cta-in">
        <h2 className="display">Make the switch this month.</h2>
        <p>Try a starter pack, feel the difference, and never go back to plastic pads.</p>
        <div className="cta-actions">
          <a href="#products" className="btn btn-dark">
            Shop pads
          </a>
          <a
            href={`https://wa.me/${WA_NUMBER}`}
            target="_blank"
            rel="noopener"
            className="btn btn-on-yellow"
          >
            <Whatsapp />
            Order on WhatsApp
          </a>
        </div>
      </Reveal>
    </section>
  )
}
