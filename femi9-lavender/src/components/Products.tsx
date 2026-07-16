import { PRODUCTS } from '../data/products'
import { Reveal } from './Reveal'
import { ProductCard } from './ProductCard'
import { Truck } from './Icons'

export function Products() {
  return (
    <section className="section" id="products">
      <div className="wrap">
        <Reveal className="sec-head">
          <div>
            <h2 className="display" style={{ marginTop: 14 }}>Different days, different needs.</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="ship-note">
              <Truck /> Free shipping over Rs.999
            </p>
          </div>
        </Reveal>

        <div className="grid-products">
          {PRODUCTS.map((product, i) => (
            <ProductCard key={product.id} product={product} delay={(i % 4 || undefined) as 1 | 2 | 3 | undefined} />
          ))}
        </div>
      </div>
    </section>
  )
}
