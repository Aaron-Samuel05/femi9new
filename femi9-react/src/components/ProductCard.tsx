import { memo } from 'react'
import { Link } from 'react-router-dom'
import type { Product } from '../data/products'
import { rupees } from '../data/products'
import { useCart } from '../store/cart'
import { useReveal, revealClass } from './Reveal'
import { Plus } from './Icons'

interface Props {
  product: Product
  delay?: 1 | 2 | 3 | 4
}

export const ProductCard = memo(function ProductCard({ product, delay }: Props) {
  const { add } = useCart()
  const { ref, inView } = useReveal<HTMLElement>()
  const { id, name, price, img, meta, flow, desc, tag, tagClass } = product

  return (
    <article ref={ref} className={revealClass(inView, delay, 'card')}>
      <Link to={`/product/${id}`} className="card-media" aria-label={name}>
        {tag && <span className={`tag${tagClass ? ` ${tagClass}` : ''}`}>{tag}</span>}
        <img src={img} alt={`Femi9 ${name} pack`} loading="lazy" />
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
          <button className="add" onClick={() => add(id)} aria-label={`Add ${name} to bag`}>
            <Plus />
          </button>
        </div>
      </div>
    </article>
  )
})
