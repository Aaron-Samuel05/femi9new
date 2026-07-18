import '../styles/collabs.css'
import { Link } from 'react-router-dom'

/* ── platform glyphs (monochrome, currentColor) ───────────────────────── */
type Platform = 'Instagram' | 'YouTube'

function PlatformIcon({ platform }: { platform: Platform }) {
  if (platform === 'YouTube') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="4" />
        <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* ── data ─────────────────────────────────────────────────────────────── */
type Collab = {
  name: string
  handle: string
  platform: Platform
  followers: string
  initials: string
  avatar: string
  quote: string
  tag?: string
}

const FEATURED: Collab = {
  name: 'Aisha Rahman',
  handle: '@aisha.reads',
  platform: 'Instagram',
  followers: '128k',
  initials: 'AR',
  avatar: 'av-gold',
  tag: '▶ Reel',
  quote:
    "I’ve tried every ‘organic’ pad on the shelf. Femi9 is the first that actually feels soft on a heavy day. And every pack backs women entrepreneurs across Tamil Nadu.",
}

const COLLABS: Collab[] = [
  {
    name: 'Priya Nair',
    handle: '@priyawellness',
    platform: 'Instagram',
    followers: '86k',
    initials: 'PN',
    avatar: 'av-lilac',
    tag: 'Giveaway',
    quote:
      'Ran a giveaway with Femi9 and my DMs filled up with thank-yous. The anion strip genuinely took the edge off my cramps.',
  },
  {
    name: 'Dr. Sneha',
    handle: '@drsneha.care',
    platform: 'YouTube',
    followers: '240k',
    initials: 'DS',
    avatar: 'av-plum',
    tag: 'Honest review',
    quote:
      'As a gynaecologist I read ingredient lists closely. No chlorine, no bleach, no toxins. I recommend Femi9 to my patients.',
  },
  {
    name: 'Meera',
    handle: '@meeraeveryday',
    platform: 'Instagram',
    followers: '54k',
    initials: 'M',
    avatar: 'av-sage',
    quote: 'Slipped a pack into my everyday bag and forgot it was even there. Barely-there, breathable, done.',
  },
  {
    name: 'Kavya',
    handle: '@kavyaspeaks',
    platform: 'YouTube',
    followers: '112k',
    initials: 'K',
    avatar: 'av-gold',
    tag: '▶ Reel',
    quote: 'Did a no-filter unboxing and the packaging alone won me over. The all-day comfort sealed it.',
  },
  {
    name: 'Ananya Iyer',
    handle: '@ananya.day',
    platform: 'Instagram',
    followers: '39k',
    initials: 'AI',
    avatar: 'av-plum2',
    quote: 'The first period-care brand my little sister and I both swear by. Gentle enough for her, reliable for me.',
  },
]

const STATS = [
  { value: '40+', label: 'creators' },
  { value: '2.1M', label: 'combined reach' },
  { value: '4.8★', label: 'avg honest rating' },
]

/* ── card ─────────────────────────────────────────────────────────────── */
function CollabCard({ c, featured = false }: { c: Collab; featured?: boolean }) {
  return (
    <article className={`collab-card${featured ? ' collab-feat' : ''}`}>
      <header className="collab-head">
        <span className={`avatar ${c.avatar}`} aria-hidden="true">
          {c.initials}
        </span>
        <span className="collab-id">
          <span className="collab-name">{c.name}</span>
          <span className="collab-handle">{c.handle}</span>
        </span>
        {c.tag && <span className="collab-tag">{c.tag}</span>}
      </header>

      <p className="collab-quote">{c.quote}</p>

      <p className="collab-meta">
        <PlatformIcon platform={c.platform} />
        <span>{c.platform}</span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span>{c.followers} followers</span>
      </p>
    </article>
  )
}

/* ── section ──────────────────────────────────────────────────────────── */
export function Collabs() {
  return (
    <section className="section collabs" id="collabs">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <h2 className="display">Loved by creators. Worn by real people.</h2>
            <p>From honest reels to heartfelt giveaways. Creators across India who tried Femi9 and stayed.</p>
          </div>
          <Link className="btn btn-ghost" to="/affiliate">
            Become a creator →
          </Link>
        </div>

        <ul className="collab-stats" aria-label="Creator community at a glance">
          {STATS.map((s) => (
            <li key={s.label}>
              <b>{s.value}</b> {s.label}
            </li>
          ))}
        </ul>

        <div className="collab-grid">
          <CollabCard c={FEATURED} featured />
          {COLLABS.map((c) => (
            <CollabCard key={c.handle} c={c} />
          ))}
        </div>
      </div>
    </section>
  )
}
