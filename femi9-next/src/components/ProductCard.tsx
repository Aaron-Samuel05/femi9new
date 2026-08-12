import { memo } from 'react'
import { Link } from '@/lib/router-compat'
import type { Product } from '../data/products'
import { rupees } from '../data/products'
import type { Variant } from '@/lib/services/products'
import { useCart } from '../store/cart'
import { PantyArt } from './PantyArt'

interface Props {
  // Cards from the catalog grid carry variants; the "related" strip on the PDP
  // reuses static products that have none — hence the optional field + guard.
  product: Product & { variants?: Variant[] }
}

export const ProductCard = memo(function ProductCard({ product }: Props) {
  const { add } = useCart()
  const { id, name, price, img, meta, flow, desc, tag, tagClass, type, variants } = product

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
          <img src={img} alt={`Femi9 ${name} pack`} loading="lazy" />
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
