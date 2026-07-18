import '../styles/periods-wall.css'
import { useEffect, useMemo, useRef, useState } from 'react'

/* ============================================================
   PERIODS WALL — a warm, judgment-free community wall where
   people share honest experiences with period products.
   Demo data persists to localStorage (key: femi9:wall:posts).
   ============================================================ */

type Post = {
  id: string
  name: string        // real name, or "Anonymous"
  handle: string      // gentle alias (used as display name when anonymous)
  product: string     // what they used (may be "")
  rating: number      // 0 = no rating, else 1–5
  body: string
  ts: number
  likes: number       // seed baseline (like toggles are local, not persisted)
  replies: number
}

const STORAGE_KEY = 'femi9:wall:posts'

/* ---------- compose options ---------- */
const PRODUCTS = ['Femi9 330mm', 'Femi9 290mm', 'Femi9 Panties', 'Another brand', 'First period']

/* ---------- feed filters ---------- */
const FILTERS = ['All', 'Femi9', 'Cramps', 'First period', 'Heavy days', 'Switching', 'Sensitive skin'] as const
type FilterName = (typeof FILTERS)[number]

const FILTER_KEYWORDS: Record<string, string[]> = {
  Cramps: ['cramp', 'pain', 'ache', 'sore'],
  'First period': ['first period', 'first-ever', 'first time', 'menarche', 'started'],
  'Heavy days': ['heavy', 'flow', 'night', 'leak', 'overnight', 'gush'],
  Switching: ['switch', 'another brand', 'other brand', 'used to', 'earlier', 'moved'],
  'Sensitive skin': ['sensitive', 'rash', 'irritat', 'skin', 'itch', 'chafe'],
}

/* ---------- gentle anonymous aliases ---------- */
const ALIAS_A = ['quiet', 'gentle', 'soft', 'calm', 'brave', 'kind', 'warm', 'still', 'moonlit', 'sunny']
const ALIAS_B = ['lotus', 'jasmine', 'river', 'dawn', 'breeze', 'koel', 'peony', 'marigold', 'tulsi', 'willow']
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]
const randomAlias = () => `${pick(ALIAS_A)}_${pick(ALIAS_B)}`
const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 18) || 'friend'
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)

/* ---------- time-ago helper ---------- */
function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (s < 45) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  return `${w}w ago`
}

/* ---------- seed data (module-level) ---------- */
const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000
const NOW = Date.now()

const SEED: Post[] = [
  {
    id: 'seed-1',
    name: 'Aisha',
    handle: 'aisha_cbe',
    product: 'Femi9 330mm',
    rating: 5,
    body:
      "I switched from a plastic-topped brand that always felt sweaty by afternoon. The cotton-soft top on the 330mm is such a relief on heavy nights — I sleep through without checking every two hours. Wish I'd found these in Coimbatore sooner.",
    ts: NOW - 2 * DAY - 4 * HOUR,
    likes: 34,
    replies: 6,
  },
  {
    id: 'seed-2',
    name: 'Anonymous',
    handle: 'quiet_lotus',
    product: 'First period',
    rating: 5,
    body:
      "My first period came at school and I was so scared. Amma had kept a Femi9 pack in my bag ‘just in case’ and honestly it made everything feel less frightening. Nobody tells you it's okay to be nervous — it is, and you figure it out.",
    ts: NOW - 5 * DAY - 2 * HOUR,
    likes: 58,
    replies: 11,
  },
  {
    id: 'seed-3',
    name: 'Priya',
    handle: 'priya_mdu',
    product: 'Femi9 290mm',
    rating: 4,
    body:
      "Day-two cramps are brutal for me, so comfort really matters. The 290mm stays soft and doesn’t bunch up when I'm running around at work in Madurai. Taking off one star only because I'd love a slimmer travel pack.",
    ts: NOW - 1 * DAY - 6 * HOUR,
    likes: 21,
    replies: 3,
  },
  {
    id: 'seed-4',
    name: 'Meena',
    handle: 'meena_slm',
    product: 'Femi9 330mm',
    rating: 5,
    body:
      "I have really sensitive skin and my old pads used to leave a red rash by the third day. After two cycles on Femi9 the irritation is basically gone — no itch, no chafing. That alone changed my whole week.",
    ts: NOW - 8 * DAY,
    likes: 42,
    replies: 7,
  },
  {
    id: 'seed-5',
    name: 'Kavya',
    handle: 'kavya_maa',
    product: 'Femi9 Panties',
    rating: 4,
    body:
      "Bought the period panties for my heavy days after one too many night-time leaks. Wearing them under my regular clothes for college in Chennai gave me so much confidence — I stopped double-checking my seat every hour.",
    ts: NOW - 14 * HOUR,
    likes: 27,
    replies: 5,
  },
  {
    id: 'seed-6',
    name: 'Anonymous',
    handle: 'gentle_koel',
    product: 'Another brand',
    rating: 3,
    body:
      "Trying to be honest here — the brand I used before was a bit cheaper and easy to find at the local shop. But it leaked on my heavier days and the plastic feel bothered me. Considering making the switch this month, reading everyone's stories helps.",
    ts: NOW - 6 * DAY - 3 * HOUR,
    likes: 15,
    replies: 9,
  },
  {
    id: 'seed-7',
    name: 'Lakshmi',
    handle: 'lakshmi_trz',
    product: 'Femi9 290mm',
    rating: 5,
    body:
      "What made me try Femi9 was that the pads are organic and compost-friendly. One month in and I don't miss my old brand at all — same protection, and I feel better about what I'm throwing away each cycle. Small change, big peace of mind.",
    ts: NOW - 15 * DAY - 5 * HOUR,
    likes: 39,
    replies: 4,
  },
  {
    id: 'seed-8',
    name: 'Anonymous',
    handle: 'warm_marigold',
    product: 'Femi9 290mm',
    rating: 5,
    body:
      "Posting for my daughter — her first period arrived last week and she was so overwhelmed. We sat down, opened a pack together, and talked. She said the pad didn't feel bulky and she could still play. As a mother, watching her worry melt away meant everything.",
    ts: NOW - 3 * DAY - 20 * MIN,
    likes: 61,
    replies: 13,
  },
]

/* ---------- persistence ---------- */
function loadPosts(): Post[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length) return parsed as Post[]
    }
  } catch {
    /* ignore (SSR / private mode / quota) */
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED))
  } catch {
    /* ignore */
  }
  return SEED
}

/* ---------- icons ---------- */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`pw-star-svg${filled ? ' is-on' : ''}`}>
      <path d="M12 2.4l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 18.98 6.12 21.07l1.12-6.55-4.76-4.64 6.58-.96z" />
    </svg>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`pw-heart-svg${filled ? ' is-on' : ''}`}>
      <path d="M12 20.6l-1.42-1.28C5.6 14.86 2.5 12.06 2.5 8.6 2.5 6 4.53 4 7.1 4c1.5 0 2.96.7 3.9 1.82C11.94 4.7 13.4 4 14.9 4 17.47 4 19.5 6 19.5 8.6c0 3.46-3.1 6.26-8.08 10.72z" />
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pw-reply-svg">
      <path d="M20 4H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3v3.2L11.4 17H20a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
    </svg>
  )
}

function LotusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="pw-anon-svg">
      <path d="M12 3c1.5 1.7 2.3 3.4 2.3 5.2 0 .9-.2 1.7-.6 2.6.9-.3 1.7-.9 2.5-1.8 1.2 1.6 1.5 3.2 1 4.9 1-.2 1.9-.7 2.8-1.5.3 2-.5 3.7-2.2 5-1.7 1.3-3.6 1.9-5.8 1.9s-4.1-.6-5.8-1.9c-1.7-1.3-2.5-3-2.2-5 .9.8 1.8 1.3 2.8 1.5-.5-1.7-.2-3.3 1-4.9.8.9 1.6 1.5 2.5 1.8-.4-.9-.6-1.7-.6-2.6C9.7 6.4 10.5 4.7 12 3z" />
    </svg>
  )
}

/* ---------- read-only star row ---------- */
function StarRow({ value }: { value: number }) {
  if (!value) return null
  return (
    <span className="pw-stars-view" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <StarIcon key={n} filled={value >= n} />
      ))}
    </span>
  )
}

/* ---------- one feed card ---------- */
function PostCard({
  post,
  liked,
  onToggleLike,
}: {
  post: Post
  liked: boolean
  onToggleLike: (id: string) => void
}) {
  const isAnon = post.name === 'Anonymous'
  const displayName = isAnon ? post.handle : post.name
  const tone = ([...displayName].reduce((a, c) => a + c.charCodeAt(0), 0)) % 4
  const likeCount = post.likes + (liked ? 1 : 0)

  return (
    <article className="pw-card" data-tone={tone}>
      <header className="pw-card-head">
        <div className="pw-avatar" aria-hidden="true">
          {isAnon ? <LotusIcon /> : displayName.charAt(0).toUpperCase()}
        </div>
        <div className="pw-who">
          <span className="pw-name">{displayName}</span>
          <span className="pw-meta">
            {isAnon ? 'shared anonymously' : `@${post.handle}`}
            <i className="pw-dot" />
            {timeAgo(post.ts)}
          </span>
        </div>
      </header>

      {(post.product || post.rating) && (
        <div className="pw-tags">
          {post.product && <span className="pw-product">{post.product}</span>}
          <StarRow value={post.rating} />
        </div>
      )}

      <p className="pw-body">{post.body}</p>

      <footer className="pw-card-foot">
        <button
          type="button"
          className={`pw-heart${liked ? ' is-liked' : ''}`}
          aria-pressed={liked}
          aria-label={liked ? `Unlike, ${likeCount} likes` : `Like, ${likeCount} likes`}
          onClick={() => onToggleLike(post.id)}
        >
          <HeartIcon filled={liked} />
          <span>{likeCount}</span>
        </button>
        <span className="pw-replies">
          <ReplyIcon />
          {post.replies} {post.replies === 1 ? 'reply' : 'replies'}
        </span>
      </footer>
    </article>
  )
}

/* ============================================================
   PAGE
   ============================================================ */
export function PeriodsWall() {
  const [posts, setPosts] = useState<Post[]>(() => loadPosts())
  const [filter, setFilter] = useState<FilterName>('All')
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set())

  // compose form
  const [name, setName] = useState('')
  const [product, setProduct] = useState('')
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [body, setBody] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // persist whenever posts change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts))
    } catch {
      /* ignore */
    }
  }, [posts])

  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
  }, [])

  const visible = useMemo(() => {
    if (filter === 'All') return posts
    if (filter === 'Femi9') return posts.filter((p) => p.product.toLowerCase().includes('femi9'))
    const kws = FILTER_KEYWORDS[filter] ?? [filter.toLowerCase()]
    return posts.filter((p) => {
      const hay = `${p.product} ${p.body}`.toLowerCase()
      return kws.some((k) => hay.includes(k))
    })
  }, [posts, filter])

  function toggleLike(id: string) {
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = body.trim()
    if (!text) return // ignore empty submissions

    const trimmedName = name.trim()
    const isAnon = trimmedName.length === 0
    const post: Post = {
      id: uid(),
      name: isAnon ? 'Anonymous' : trimmedName,
      handle: isAnon ? randomAlias() : slugify(trimmedName),
      product,
      rating,
      body: text,
      ts: Date.now(),
      likes: 0,
      replies: 0,
    }

    setPosts((prev) => [post, ...prev])
    setName('')
    setProduct('')
    setRating(0)
    setHoverRating(0)
    setBody('')

    setConfirmed(true)
    if (confirmTimer.current) clearTimeout(confirmTimer.current)
    confirmTimer.current = setTimeout(() => setConfirmed(false), 4000)
  }

  return (
    <main className="pwall">
      {/* ---------- hero ---------- */}
      <header className="wrap pwall-hero">
        <span className="eyebrow">Periods Wall</span>
        <h1 className="display pwall-title">Real period stories, no judgment.</h1>
        <p className="pwall-sub">
          A gentle corner of Femi9 where people across India share how their days really go —
          with our pads or whatever they used before. Read, relate, and add your own.
        </p>
        <p className="pwall-kind">
          <span aria-hidden="true">💛</span> Be kind. Every body and every flow is different.
        </p>
      </header>

      <section className="wrap pwall-body-wrap">
        {/* ---------- compose ---------- */}
        <form className="pw-compose" onSubmit={handleSubmit} noValidate>
          <h2 className="pw-compose-title">Share your experience</h2>
          <p className="pw-compose-sub">Two lines is plenty. Honest and kind is all we ask.</p>

          <label className="pw-sr-only" htmlFor="pw-name">
            Your name (optional)
          </label>
          <input
            id="pw-name"
            className="pw-input"
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (or stay anonymous)"
          />

          <div className="pw-field">
            <span className="pw-label">What did you use?</span>
            <div className="pw-chips" role="group" aria-label="Choose a product">
              {PRODUCTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pw-chip${product === p ? ' is-active' : ''}`}
                  aria-pressed={product === p}
                  onClick={() => setProduct(product === p ? '' : p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="pw-field">
            <span className="pw-label">How would you rate it?</span>
            <div className="pw-stars" role="group" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="pw-star"
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  aria-pressed={rating === n}
                  onMouseEnter={() => setHoverRating(n)}
                  onMouseLeave={() => setHoverRating(0)}
                  onFocus={() => setHoverRating(n)}
                  onBlur={() => setHoverRating(0)}
                  onClick={() => setRating(rating === n ? 0 : n)}
                >
                  <StarIcon filled={(hoverRating || rating) >= n} />
                </button>
              ))}
            </div>
          </div>

          <label className="pw-sr-only" htmlFor="pw-body">
            Your story
          </label>
          <textarea
            id="pw-body"
            className="pw-textarea"
            value={body}
            maxLength={600}
            rows={4}
            onChange={(e) => setBody(e.target.value)}
            placeholder="How did it go? Share honestly…"
          />

          <div className="pw-compose-foot">
            <button type="submit" className="btn btn-primary">
              Post to the wall
            </button>
            <span className={`pw-confirm${confirmed ? ' is-shown' : ''}`} role="status" aria-live="polite">
              {confirmed ? 'Thank you for sharing 💛 your story is on the wall.' : ''}
            </span>
          </div>
        </form>

        {/* ---------- filters ---------- */}
        <div className="pw-filters" role="group" aria-label="Filter stories">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`pw-filter${filter === f ? ' is-active' : ''}`}
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* ---------- feed ---------- */}
        <div className="pw-feed">
          {visible.length === 0 ? (
            <div className="pw-empty">
              <p className="pw-empty-title">Nothing here yet.</p>
              <p className="pw-empty-sub">
                No stories under “{filter}” right now — try another filter, or be the first to write one.
              </p>
            </div>
          ) : (
            visible.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                liked={likedIds.has(post.id)}
                onToggleLike={toggleLike}
              />
            ))
          )}
        </div>
      </section>
    </main>
  )
}
