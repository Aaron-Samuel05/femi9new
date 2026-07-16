import { Link } from 'react-router-dom'
import { POSTS, type BlogPost } from '../data/blog'
import { ArticleCard, CatChip } from './BlogCards'
import ScrollStack, { ScrollStackItem } from '../immersive/ScrollStack'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function StackCard({ post }: { post: BlogPost }) {
  const poster: React.CSSProperties = post.image
    ? { backgroundImage: `url(${post.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: post.tone }
  return (
    <Link to={`/blog/${post.slug}`} className="jstack interactive">
      <span className="jstack-media" style={poster} aria-hidden="true" />
      <span className="jstack-body">
        <CatChip post={post} />
        <h3 className="display">{post.title}</h3>
        <p>{post.excerpt}</p>
        <span className="jstack-foot">
          <span className="bmeta">
            <b>{post.author}</b>
            <i />
            {post.date}
            <i />
            {post.readTime} min read
          </span>
          <span className="jstack-more">Read the story →</span>
        </span>
      </span>
    </Link>
  )
}

/** "From the Journal" — the important blogs on the home page, presented as a
 *  scroll-stack (cards pin and stack as you scroll). Reduced motion falls back
 *  to a plain 3-card grid. */
export function Journal() {
  const picks = POSTS.filter((p) => p.featured).slice(0, 4)

  return (
    <section id="journal" className="section journal journal--stack">
      <div className="wrap journal-head">
        <div>
          <span className="eyebrow">From the journal</span>
          <h2 className="display journal-title">Good reading for every phase.</h2>
        </div>
        <Link to="/blog" className="btn btn-ghost journal-all">
          Read the journal →
        </Link>
      </div>

      {prefersReduced ? (
        <div className="wrap bgrid journal-grid">
          {picks.slice(0, 3).map((p) => (
            <ArticleCard key={p.slug} post={p} />
          ))}
        </div>
      ) : (
        <ScrollStack
          itemDistance={150}
          itemStackDistance={26}
          stackPosition="22%"
          scaleEndPosition="12%"
          baseScale={0.86}
          itemScale={0.035}
        >
          {picks.map((p) => (
            <ScrollStackItem key={p.slug}>
              <StackCard post={p} />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      )}
    </section>
  )
}
