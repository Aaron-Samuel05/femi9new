import { PRODUCTS } from '../data/products'
import { ProductCard } from './ProductCard'
import { Truck } from './Icons'

export function Products() {
  return (
    <section className="section" id="products">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <h2 className="display" style={{ marginTop: 14 }}>Different days, different needs.</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p className="ship-note">
              <Truck /> Free shipping over Rs.999
            </p>
          </div>
        </div>

        <div className="grid-products">
          {PRODUCTS.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
