import { memo } from 'react'
import { Link } from '@/lib/router-compat'
import type { Product } from '../data/products'
import { rupees } from '../data/products'
import type { Variant } from '@/lib/services/products'
import { useCart } from '../store/cart'
import { Plus } from './Icons'
import { PantyArt } from './PantyArt'

interface Props {
  // Cards from the catalog grid carry variants; the "related" strip on the PDP
  // reuses static products that have none — hence the optional field + guard.
  product: Product & { variants?: Variant[] }
}

export const ProductCard = memo(function ProductCard({ product }: Props) {
  const { add } = useCart()
  const { id, name, price, img, meta, flow, desc, tag, tagClass, type, packs, sizes, variants } = product

  // Pick the default purchasable variant for a one-tap add. Variants arrive
  // ordered by price ascending, so "the last pack" is the largest/priciest pack.
  const isPanty = type === 'panty'
  const packVariants = (variants ?? []).filter((v) => v.kind === 'pack')
  const defaultVariant: Variant | undefined = isPanty
    ? (variants ?? []).find((v) => v.kind === 'size')
    : packVariants.find((v) => v.price === price) ?? packVariants[packVariants.length - 1]

  // "clearly display available sizes and pack types" — a small options row
  const options: string[] | null = packs
    ? packs.map((p) => `${p.count}`)
    : sizes
      ? sizes
      : null
  const optionSuffix = packs ? 'pcs' : sizes ? '' : ''

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
        {options && (
          <div className="card-opts" aria-label={packs ? 'Available pack sizes' : 'Available sizes'}>
            {packs && <span className="card-opts-label">Packs</span>}
            {options.map((o) => (
              <span className="opt-chip" key={o}>{o}</span>
            ))}
            {optionSuffix && <span className="card-opts-suffix">{optionSuffix}</span>}
          </div>
        )}
        <div className="card-foot">
          <span className="price">
            <b>{packs ? `from ${rupees(packs[0].price)}` : rupees(price)}</b>
            <span>{meta}</span>
          </span>
          <button
            className="add"
            onClick={() => defaultVariant && add(defaultVariant.id)}
            disabled={!defaultVariant}
            aria-label={`Add ${name} to bag`}
          >
            <Plus />
          </button>
        </div>
      </div>
    </article>
  )
})
