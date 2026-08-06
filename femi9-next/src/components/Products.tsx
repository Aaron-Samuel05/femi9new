import { ProductCard } from './ProductCard'
import { Truck } from './Icons'
import type { ProductWithVariants } from '@/lib/services/products'

// The product grid now receives its catalog from the server (Postgres) as a
// prop rather than importing the static PRODUCTS array. Markup is unchanged.
export function Products({ products }: { products: ProductWithVariants[] }) {
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
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  )
}
