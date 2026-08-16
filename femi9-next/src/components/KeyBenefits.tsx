import { BENEFIT_ICONS } from './BenefitIcons'
import { resolveBenefits, type ProductBenefit } from '../data/productBenefits'
import { OptImg } from '@/components/OptImg'
import type { OptImageBase } from '@/lib/opt-images'

/**
 * "Key Benefits" — the product shot standing at the centre of its own claims,
 * three down each side.
 *
 * No 'use client' and no hooks: its only importer (ProductDetail) is already a
 * client component, so this lands in the client graph either way — but keeping
 * it stateless means it hydrates to nothing and can be lifted into a server
 * component later without a rewrite.
 *
 * The layout is a three-column grid (text · image · text) that collapses to a
 * single column under 900px. It is NOT absolute positioning around a fixed-size
 * photo: the benefit bodies are 8-14 words of real copy that wrap differently at
 * every width, and anchoring them to a centre point would have them overlap the
 * product the moment a title runs to two lines.
 */

interface Props {
  productId: string
  productName: string
  /** DB-authored fallback when the product has no hand-written pack. */
  features: { title: string; body: string }[]
  /** Manifest asset for the centrepiece, when one exists for this product. */
  imageBase: OptImageBase | null
  /** DB-authored catalog photo — used when `imageBase` is null. */
  imageSrc: string
}

/** One claim: the overlapping icon pair, its title, its sentence. */
function Benefit({ benefit, align }: { benefit: ProductBenefit; align: 'left' | 'right' }) {
  const [First, Second] = benefit.icons.map((key) => BENEFIT_ICONS[key])

  return (
    <li className={`kb-item kb-item--${align}`}>
      <div className="kb-badges">
        <span className="kb-badge">
          <First />
        </span>
        <span className="kb-badge">
          <Second />
        </span>
      </div>
      <h3 className="kb-item-title">{benefit.title}</h3>
      <p className="kb-item-body">{benefit.body}</p>
    </li>
  )
}

export function KeyBenefits({ productId, productName, features, imageBase, imageSrc }: Props) {
  const pack = resolveBenefits(productId, features)

  // Nothing authored and nothing seeded — render nothing rather than an empty
  // frame around a lone photo the gallery already showed.
  if (!pack) return null

  return (
    <section className="kb-section" aria-labelledby="kb-heading">
      <h2 className="kb-heading" id="kb-heading">
        Key Benefits
      </h2>

      <div className="kb-layout">
        <ul className="kb-col kb-col--left">
          {pack.left.map((b) => (
            <Benefit key={b.title} benefit={b} align="left" />
          ))}
        </ul>

        <div className="kb-centre">
          {/* Decorative: every claim this photo illustrates is already read out
              as text on both sides, so an alt describing it again would make a
              screen reader repeat the whole section. */}
          {imageBase ? (
            <OptImg
              base={imageBase}
              sizes="(max-width: 900px) 78vw, 460px"
              alt=""
              className="kb-centre-img"
            />
          ) : (
            <img
              className="kb-centre-img"
              src={imageSrc}
              alt=""
              width={720}
              height={960}
              loading="lazy"
              decoding="async"
            />
          )}
        </div>

        <ul className="kb-col kb-col--right">
          {pack.right.map((b) => (
            <Benefit key={b.title} benefit={b} align="right" />
          ))}
        </ul>
      </div>

      {/* The product name belongs to the section, but printing it under a photo
          that is already captioned by six claims would be noise; it is the
          accessible name of the region instead. */}
      <span className="kb-sr-only">{`Key benefits of ${productName}`}</span>
    </section>
  )
}
