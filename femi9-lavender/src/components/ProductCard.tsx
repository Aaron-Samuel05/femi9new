import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '../data/products'
import { rupees } from '../data/products'
import { useCart } from '../store/cart'
import { useReveal, revealClass } from './Reveal'
import { Plus } from './Icons'
import { PantyArt } from './PantyArt'

interface Props {
  product: Product
  delay?: 1 | 2 | 3 | 4
}

export const ProductCard = memo(function ProductCard({ product, delay }: Props) {
  const { add } = useCart()
  const { ref, inView } = useReveal<HTMLElement>()
  const { id, name, price, img, meta, flow, desc, tag, tagClass, type, packs, sizes } = product

  // "clearly display available sizes and pack types" — a small options row
  const options: string[] | null = packs
    ? packs.map((p) => `${p.count}`)
    : sizes
      ? sizes
      : null
  const optionSuffix = packs ? 'pcs' : sizes ? '' : ''

  return (
    <article ref={ref} className={revealClass(inView, delay, 'card')}>
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
          <button className="add" onClick={() => add(id)} aria-label={`Add ${name} to bag`}>
            <Plus />
          </button>
        </div>
      </div>
    </article>
  )
})
