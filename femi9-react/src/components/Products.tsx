import { PRODUCTS } from '../data/products'
import { Reveal } from './Reveal'
import { ProductCard } from './ProductCard'
import { Truck, ArrowRight } from './Icons'

export function Products() {
  return (
    <section className="section products-showcase" id="products">
      <div className="wrap">
        <Reveal className="sec-head products-head">
          <div>
            <span className="eyebrow">FEMI9 PERIOD CARE</span>
            <h2 style={{ marginTop: 14 }}>Find your<br />Femi9.</h2>
            <p className="products-lead">Different days. Different needs. One softer standard.</p>
          </div>
          <div className="products-head-right">
            <p className="ship-note"><Truck /> Free shipping over Rs.999</p>
            <a className="products-view-all" href="#products">Explore all products <ArrowRight /></a>
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
