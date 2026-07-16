import { Link } from 'react-router-dom'
import { CATEGORY_META, type BlogPost } from '../data/blog'
import { BlogCover } from './BlogCover'

export function CatChip({ post, onDark = false }: { post: BlogPost; onDark?: boolean }) {
  const { color } = CATEGORY_META[post.category]
  return (
    <span
      className={`bcat ${onDark ? 'bcat--dark' : ''}`}
      style={onDark ? undefined : { color, background: `${color}1a` }}
    >
      {post.category}
    </span>
  )
}

function Meta({ post }: { post: BlogPost }) {
  return (
    <span className="bmeta">
      <b>{post.author}</b>
      <i />
      {post.date}
      <i />
      {post.readTime} min read
    </span>
  )
}

/** Standard editorial card used in the grids and the home teaser. */
export function ArticleCard({ post }: { post: BlogPost }) {
  return (
    <Link to={`/blog/${post.slug}`} className="bcard interactive">
      <span className="bcard-poster">
        <BlogCover post={post} />
        <CatChip post={post} />
      </span>
      <span className="bcard-body">
        <h3>{post.title}</h3>
        <p>{post.excerpt}</p>
        <Meta post={post} />
      </span>
    </Link>
  )
}

/** Full-bleed overlay tile used in the featured mosaic. */
export function MosaicTile({ post, big = false }: { post: BlogPost; big?: boolean }) {
  return (
    <Link to={`/blog/${post.slug}`} className={`mtile interactive ${big ? 'mtile--big' : ''}`}>
      <BlogCover post={post} variant="deep" />
      <span className="mtile-scrim">
        <span className="mtile-cat">{post.category}</span>
        <h3>{post.title}</h3>
        <span className="mtile-read">{post.readTime} min read</span>
      </span>
    </Link>
  )
}
