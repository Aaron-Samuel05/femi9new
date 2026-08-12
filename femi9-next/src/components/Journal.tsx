import { Link } from '@/lib/router-compat'
import { ArticleCard, CatChip } from './BlogCards'
import { BlogCover } from './BlogCover'
import ScrollStack, { ScrollStackItem } from '../immersive/ScrollStack'
import type { BlogPostDTO } from '@/lib/services/blog'

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function StackCard({ post }: { post: BlogPostDTO }) {
  return (
    <Link to={`/blog/${post.slug}`} className="jstack interactive">
      <span className="jstack-media">
        <BlogCover post={post} />
      </span>
      <span className="jstack-body">
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
export function Journal({ posts }: { posts: BlogPostDTO[] }) {
  const picks = posts.filter((p) => p.featured).slice(0, 4)

  return (
    <section id="journal" className="section journal journal--stack">
      <div className="wrap journal-head">
        <div>
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
