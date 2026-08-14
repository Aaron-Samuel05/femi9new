'use client'

// Explicitly a client component: it calls useCart() for the one-tap add. It used
// to inherit the boundary from Home.tsx, its only importer, which meant the
// first server component to render a product grid (/products) would have tried
// to run a hook on the server.

import { memo, useEffect, useState } from 'react'
import { Link } from '@/lib/router-compat'
import type { Product } from '../data/products'
import { rupees } from '../data/products'
import type { Variant } from '@/lib/services/products'
import { useCart } from '../store/cart'
import { PantyArt } from './PantyArt'
import { OptImg } from '@/components/OptImg'

interface Props {
  // Cards from the catalog grid carry variants; the "related" strip on the PDP
  // reuses static products that have none — hence the optional field + guard.
  product: Product & { variants?: Variant[] }
  showInsideOnHover?: boolean
}

/** Rendered if the product photo 404s, so the card shows a pack instead of the
 *  browser's broken-image glyph. There is at least one dead `img` path live. */
const IMAGE_FALLBACK = '/assets/opt/img/sample-640.webp'

export const ProductCard = memo(function ProductCard({ product, showInsideOnHover = false }: Props) {
  const { add } = useCart()
  const { id, name, price, img, meta, flow, desc, tag, tagClass, type, variants } = product

  // The second "inside the pack" photo is revealed by :hover / :focus-within
  // only. A phone has neither — tapping the media link navigates to the PDP in
  // the same gesture — so it was a second full-size download that could never
  // be painted. Start false so the server never emits it, and only opt in once
  // we know the pointer can actually hover.
  const [canHover, setCanHover] = useState(false)
  useEffect(() => {
    setCanHover(window.matchMedia('(hover: hover) and (pointer: fine)').matches)
  }, [])
  const showInside = showInsideOnHover && canHover

  // Pick the default purchasable variant for a one-tap add.
  const isPanty = type === 'panty'
  const packVariants = (variants ?? []).filter((v) => v.kind === 'pack')
  const defaultVariant: Variant | undefined = isPanty
    ? (variants ?? []).find((v) => v.kind === 'size')
    : packVariants.find((v) => v.price === price) ?? packVariants[packVariants.length - 1]

  return (
    <article className="card">
      <Link to={`/product/${id}`} className="card-media" aria-label={name}>
        {tag && <span className={`tag${tagClass ? ` ${tagClass}` : ''}`}>{tag}</span>}
        {type === 'panty' ? (
          <PantyArt />
        ) : (
          <>
            <img
              className={showInside ? 'card-media__image card-media__image--pack' : undefined}
              src={img}
              alt={`Femi9 ${name} pack`}
              width={720}
              height={960}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                if (e.currentTarget.src.endsWith(IMAGE_FALLBACK)) return
                e.currentTarget.src = IMAGE_FALLBACK
              }}
            />
            {showInside && (
              <OptImg
                className="card-media__image card-media__image--inside"
                base="figma-home/products-imgFrame206-hover"
                sizes="(max-width: 1180px) 46vw, 300px"
                alt=""
              />
            )}
          </>
        )}
      </Link>
      <div className="card-body">
        <span className="card-flow">{flow}</span>
        <Link to={`/product/${id}`} style={{ color: 'inherit' }}><h3>{name}</h3></Link>
        <p className="card-desc">{desc}</p>
        <div className="card-foot">
          <span className="price">
            <b>{rupees(price)}</b>
            <span>{meta}</span>
          </span>
          <button
            className="add"
            onClick={() => defaultVariant && add(defaultVariant.id)}
            disabled={!defaultVariant}
            aria-label={`Add ${name} to bag`}
          >
            Buy Now
          </button>
        </div>
      </div>
    </article>
  )
})
