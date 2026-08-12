'use client'

import { Whatsapp } from './Icons'
import { usePublicSettings } from '@/lib/use-public-settings'

export function Cta() {
  const { whatsappNumber } = usePublicSettings()
  return (
    <section className="section cta">
      <div className="wrap cta-in">
        <h2 className="display">Make the switch this month.</h2>
        <p>Try a starter pack, feel the difference, and never go back to plastic pads.</p>
        <div className="cta-actions">
          <a href="#products" className="btn btn-dark">
            Shop pads
          </a>
          <a
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener"
            className="btn btn-on-yellow">
            <Whatsapp />
            Order on WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
