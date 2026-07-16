import { useMemo, useState } from 'react'
import { POSTS, CATEGORIES, type BlogCategory } from '../data/blog'
import { ArticleCard, MosaicTile } from '../components/BlogCards'

type Filter = 'All' | BlogCategory

export function Blog() {
  const [filter, setFilter] = useState<Filter>('All')

  const featured = useMemo(() => POSTS.filter((p) => p.featured).slice(0, 5), [])
  const list = useMemo(
    () => (filter === 'All' ? POSTS : POSTS.filter((p) => p.category === filter)),
    [filter],
  )

  return (
    <main className="blog" id="top">
      <header className="blog-hero wrap">
        <span className="eyebrow">The Femi9 Journal</span>
        <h1 className="display blog-hero-title">
          Notes on cycles, bodies &amp; living well.
        </h1>
        <p className="blog-hero-sub">
          Honest, judgment-free writing on periods, hormones and comfort — from our
          founder-doctor and the people who make Femi9.
        </p>
      </header>

      <section className="wrap">
        <div className="bmosaic">
          {featured[0] && <MosaicTile post={featured[0]} big />}
          {featured.slice(1, 5).map((p) => (
            <MosaicTile key={p.slug} post={p} />
          ))}
        </div>
      </section>

      <section className="wrap blog-latest">
        <div className="blog-latest-head">
          <h2 className="display">The latest</h2>
          <div className="bchips" role="tablist" aria-label="Filter articles by topic">
            {(['All', ...CATEGORIES] as Filter[]).map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={filter === c}
                className={`bchip ${filter === c ? 'is-active' : ''}`}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="bgrid">
          {list.map((p) => (
            <ArticleCard key={p.slug} post={p} />
          ))}
        </div>
      </section>

      <section className="wrap">
        <div className="blog-news">
          <div>
            <h2 className="display">Care notes, in your inbox.</h2>
            <p>A gentle, occasional letter — cycle tips and new writing. No spam, ever.</p>
          </div>
          <form className="blog-news-form" onSubmit={(e) => e.preventDefault()}>
            <input type="email" placeholder="Your email address" aria-label="Email address" />
            <button type="submit" className="btn btn-primary">Subscribe</button>
          </form>
        </div>
      </section>
    </main>
  )
}
