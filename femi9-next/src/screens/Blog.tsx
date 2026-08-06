'use client'
import { useMemo, useState } from 'react'
import { ArticleCard, MosaicTile } from '../components/BlogCards'
import type { BlogPostDTO, BlogCategoryDTO } from '@/lib/services/blog'

interface Props {
  // Posts + category chips are now fetched by the server page from Postgres.
  posts: BlogPostDTO[]
  categories: BlogCategoryDTO[]
}

// 'All' plus any category name coming from the DB.
type Filter = string

export function Blog({ posts, categories }: Props) {
  const [filter, setFilter] = useState<Filter>('All')
  const [subscribed, setSubscribed] = useState(false)

  const featured = useMemo(() => posts.filter((p) => p.featured).slice(0, 5), [posts])
  const list = useMemo(
    () => (filter === 'All' ? posts : posts.filter((p) => p.category === filter)),
    [filter, posts],
  )

  return (
    <main className="blog" id="top">
      <header className="blog-hero wrap">
        <span className="eyebrow">The Femi9 Journal</span>
        <h1 className="display blog-hero-title">
          Notes on cycles, bodies &amp; living well.
        </h1>
        <p className="blog-hero-sub">
          Honest, judgment-free writing on periods, hormones and comfort, from our
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
            {(['All', ...categories.map((c) => c.name)] as Filter[]).map((c) => (
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
          {subscribed ? (
            <p role="status" className="blog-news-confirm">Thanks — you’re on the list.</p>
          ) : (
            <form className="blog-news-form" onSubmit={(e) => { e.preventDefault(); setSubscribed(true) }}>
              <input type="email" placeholder="Your email address" aria-label="Email address" required />
              <button type="submit" className="btn btn-primary">Subscribe</button>
            </form>
          )}
        </div>
      </section>
    </main>
  )
}
