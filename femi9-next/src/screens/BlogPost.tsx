import { Link } from '@/lib/router-compat'
import { CATEGORY_META, type BlogCategory } from '../data/blog'
import { ArticleCard, CatChip } from '../components/BlogCards'
import { BlogCover } from '../components/BlogCover'
import type { BlogPostDTO } from '@/lib/services/blog'

interface Props {
  // Article + related reads are resolved on the server by slug and passed in.
  post: BlogPostDTO
  related: BlogPostDTO[]
}

function Body({ lines }: { lines: string[] }) {
  return (
    <>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>
        if (line.startsWith('> ')) return <blockquote key={i}>{line.slice(2)}</blockquote>
        return <p key={i}>{line}</p>
      })}
    </>
  )
}

export function BlogPost({ post, related }: Props) {
  // category is a plain string on the DTO; CATEGORY_META is keyed by the known
  // category union, so we narrow it for the colour lookup.
  const { color } = CATEGORY_META[post.category as BlogCategory]

  return (
    <main className="blog article" id="top">
      <div className="wrap article-top">
        <Link to="/blog" className="article-back">← The Femi9 Journal</Link>
        <div className="article-head">
          <CatChip post={post} />
          <h1 className="display article-title">{post.title}</h1>
          <span className="bmeta article-meta">
            <b>{post.author}</b>
            <i />
            {post.date}
            <i />
            {post.readTime} min read
          </span>
        </div>
      </div>

      <div className="article-cover">
        <BlogCover post={post} variant="deep" className="article-cover-art" />
      </div>

      <article className="wrap article-body" style={{ '--accent': color } as React.CSSProperties}>
        <Body lines={post.body} />
      </article>

      <div className="wrap article-cta">
        <Link to="/#products" className="btn btn-primary">Shop Femi9 pads</Link>
      </div>

      <section className="wrap article-related">
        <h2 className="display">Keep reading</h2>
        <div className="bgrid">
          {related.map((p) => (
            <ArticleCard key={p.slug} post={p} />
          ))}
        </div>
      </section>
    </main>
  )
}
