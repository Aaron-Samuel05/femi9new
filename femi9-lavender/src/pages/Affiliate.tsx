import '../styles/affiliate.css'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

/* ------------------------------------------------------------------ *
 * Femi9 — Creator / Affiliate Program (self-serve codes + earnings)
 * ------------------------------------------------------------------ */

const STORAGE_KEY = 'femi9:affiliate:account'

const PLATFORMS = ['Instagram', 'YouTube', 'TikTok', 'X', 'Blog'] as const
const FOLLOWER_BANDS = ['Under 5k', '5–25k', '25–100k', '100k+'] as const

type Stats = { clicks: number; signups: number; earnings: number }
type Account = {
  name: string
  handle: string
  platform: string[]
  followers: string
  email: string
  code: string
  joined: number
  stats: Stats
}

/* ---------------- reveal-on-scroll (self-contained) ---------------- */

const prefersReduced =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Rise({
  children,
  className = '',
  delay = 0,
  id,
}: {
  children: ReactNode
  className?: string
  delay?: number
  id?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(prefersReduced)

  useEffect(() => {
    if (prefersReduced) return
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setInView(true)
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      id={id}
      className={`af-rise${inView ? ' in' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/* ------------------------------- icons ------------------------------ */

const Ico = {
  tag: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 11.5V5a2 2 0 0 1 2-2h6.5a2 2 0 0 1 1.42.59l7 7a2 2 0 0 1 0 2.82l-6.5 6.5a2 2 0 0 1-2.82 0l-7-7A2 2 0 0 1 3 11.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </svg>
  ),
  coin: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7.5v9M14.4 9.3c-.6-.7-1.5-1-2.4-1-1.3 0-2.4.8-2.4 1.9 0 2.4 4.8 1.3 4.8 3.7 0 1.1-1.1 1.9-2.4 1.9-.9 0-1.8-.3-2.4-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="14.5" r="1.4" fill="currentColor" />
    </svg>
  ),
  gift: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="9.5" width="16" height="11" rx="1.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 9.5h18v3.2H3zM12 9.5v11M12 9.5C12 6.5 10.7 5 9 5S6 6.2 6 7.2 7.3 9.5 12 9.5Zm0 0c0-3 1.3-4.5 3-4.5s3 1.2 3 2.2-1.3 2.3-6 2.3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  copy: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3h-6A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12.5 4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
}

/* ---------------------------- helpers ------------------------------ */

/** Build a real-looking promo code from the handle (fallback name). */
function generateCode(handle: string, name: string): string {
  const source = (handle || name || '').trim()
  const tokens = source
    .replace(/^@+/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)

  let base = tokens.length
    ? tokens.reduce((a, b) => (b.length > a.length ? b : a))
    : ''
  base = base.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8)

  if (base.length < 3) {
    base =
      source.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8) || 'FEMI9'
  }

  // deterministic 2-digit suffix so the code is stable + unique-looking
  let h = 5381
  const seed = `${source}|${name}`
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  }
  const num = (h % 90) + 10 // 10–99, always two digits

  return `${base}${num}`
}

function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Account
    if (parsed && typeof parsed.code === 'string' && parsed.name) return parsed
  } catch {
    /* corrupt / unavailable storage — fall through to the form */
  }
  return null
}

const inr = (n: number) => `Rs. ${n.toLocaleString('en-IN')}`
const num = (n: number) => n.toLocaleString('en-IN')

/* ------------------------------------------------------------------ *
 * Component
 * ------------------------------------------------------------------ */

export function Affiliate() {
  const [account, setAccount] = useState<Account | null>(() => loadAccount())

  // form state
  const [name, setName] = useState('')
  const [handle, setHandle] = useState('')
  const [platform, setPlatform] = useState<string[]>(['Instagram'])
  const [followers, setFollowers] = useState<string>(FOLLOWER_BANDS[1])
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  // copy feedback
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)

  const togglePlatform = (p: string) => {
    setPlatform((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    )
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !handle.trim()) {
      setError('Please add your name and social handle to generate your code.')
      return
    }
    setError('')
    const normalizedHandle = `@${handle.replace(/^@+/, '').trim()}`
    const acct: Account = {
      name: name.trim(),
      handle: normalizedHandle,
      platform: platform.length ? platform : ['Instagram'],
      followers: followers || FOLLOWER_BANDS[0],
      email: email.trim(),
      code: generateCode(handle, name),
      joined: Date.now(),
      stats: { clicks: 0, signups: 0, earnings: 0 },
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(acct))
    } catch {
      /* storage may be full/blocked — dashboard still shows this session */
    }
    setAccount(acct)
    // bring the fresh dashboard into view
    requestAnimationFrame(() => {
      document.getElementById('join')?.scrollIntoView({
        behavior: prefersReduced ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  const startOver = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setAccount(null)
    setName('')
    setHandle('')
    setPlatform(['Instagram'])
    setFollowers(FOLLOWER_BANDS[1])
    setEmail('')
    setError('')
    requestAnimationFrame(() => {
      document.getElementById('join')?.scrollIntoView({
        behavior: prefersReduced ? 'auto' : 'smooth',
        block: 'start',
      })
    })
  }

  const copy = async (text: string, which: 'code' | 'link') => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(which)
      window.setTimeout(
        () => setCopied((c) => (c === which ? null : c)),
        1600,
      )
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <main className="affiliate">
      {/* ============================ HERO ============================ */}
      <header className="af-hero">
        <div className="af-hero-ambient" aria-hidden="true" />
        <div className="wrap af-hero-grid">
          <div className="af-hero-copy">
            <span className="eyebrow">Creator Program</span>
            <h1 className="display af-hero-title">
              Share what you love. Earn on every pack.
            </h1>
            <p className="af-hero-sub">
              Get a personal Femi9 code in a minute. Your followers get{' '}
              <strong>10% off</strong> their first order, and you earn{' '}
              <strong>15% commission</strong> on everything they buy — paid
              every month, straight to your UPI.
            </p>
            <div className="af-hero-cta">
              <a href="#join" className="btn btn-primary">
                Get my code {Ico.arrow}
              </a>
              <a href="#how" className="btn btn-ghost">
                See how it works
              </a>
            </div>
            <div className="af-hero-trust">
              <div className="af-avatars" aria-hidden="true">
                <span>A</span>
                <span>M</span>
                <span>R</span>
                <span>K</span>
              </div>
              <p>
                Trusted by <strong>400+</strong> Indian creators &amp; care
                communities.
              </p>
            </div>
          </div>

          {/* tangible reward preview — no image, pure layout */}
          <aside className="af-preview" aria-label="Example creator dashboard">
            <div className="af-preview-top">
              <div className="af-preview-who">
                <span className="af-preview-avatar">M</span>
                <div>
                  <b>Meher Kapoor</b>
                  <span>@meher.styles · Instagram</span>
                </div>
              </div>
              <span className="af-preview-live">Live</span>
            </div>

            <div className="af-preview-code">
              <span className="af-preview-label">Your code</span>
              <strong className="display">MEHER15</strong>
              <span className="af-preview-off">10% off for followers</span>
            </div>

            <div className="af-preview-stats">
              <div>
                <b>1,284</b>
                <span>Clicks</span>
              </div>
              <div>
                <b>128</b>
                <span>Orders</span>
              </div>
              <div>
                <b>Rs. 4,200</b>
                <span>This month</span>
              </div>
            </div>
            <p className="af-preview-note">Sample — yours starts at zero.</p>
          </aside>
        </div>
      </header>

      {/* ======================= HOW IT WORKS ======================= */}
      <section className="section af-how" id="how">
        <div className="wrap">
          <Rise className="af-head">
            <h2 className="display">Three steps to your first payout</h2>
            <p>
              No inventory, no invoices, no waiting on approvals. Register and
              start sharing the same day.
            </p>
          </Rise>

          <ol className="af-steps">
            {[
              {
                n: '01',
                t: 'Register & get your code',
                d: 'Tell us where you post. We instantly generate a unique promo code that belongs to you alone.',
              },
              {
                n: '02',
                t: 'Share it anywhere',
                d: 'Drop it in your bio, stories or videos. Anyone who uses it gets 10% off their first Femi9 order.',
              },
              {
                n: '03',
                t: 'Earn on every order',
                d: 'You keep 15% commission on everything they buy — tracked live and paid monthly via UPI.',
              },
            ].map((s, i) => (
              <Rise key={s.n} delay={i * 90}>
                <li className="af-step">
                  <span className="af-step-num display">{s.n}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              </Rise>
            ))}
          </ol>
        </div>
      </section>

      {/* ===================== PERKS + TIERS BAND ==================== */}
      <section className="section af-perks-section">
        <div className="wrap">
          <Rise>
            <div className="af-perks">
              <div className="af-perks-head">
                <h2 className="display">Made worth your while</h2>
                <p>
                  Real rewards for you and a genuine saving for the people who
                  trust you.
                </p>
              </div>

              <div className="af-perks-grid">
                {[
                  {
                    icon: Ico.tag,
                    t: '10% off for followers',
                    d: 'A discount they actually feel, on their first pack.',
                  },
                  {
                    icon: Ico.coin,
                    t: '15% commission for you',
                    d: 'On every order placed with your code — no cap.',
                  },
                  {
                    icon: Ico.calendar,
                    t: 'Monthly UPI payouts',
                    d: 'Paid on the 1st, no minimum threshold to start.',
                  },
                  {
                    icon: Ico.gift,
                    t: 'Free product drops',
                    d: 'First dibs on new launches and creator-only boxes.',
                  },
                ].map((p) => (
                  <div className="af-perk" key={p.t}>
                    <span className="af-perk-icon">{p.icon}</span>
                    <b>{p.t}</b>
                    <p>{p.d}</p>
                  </div>
                ))}
              </div>

              <div className="af-tiers">
                <span className="af-tiers-label">
                  Your rate grows as you do
                </span>
                <div className="af-tiers-row">
                  {[
                    { t: 'Rising', r: '15%', d: '0–25 orders / month' },
                    { t: 'Established', r: '18%', d: '25–75 orders / month' },
                    { t: 'Top creator', r: '22%', d: '75+ orders / month' },
                  ].map((tier) => (
                    <div className="af-tier" key={tier.t}>
                      <span className="af-tier-name">{tier.t}</span>
                      <b className="display">{tier.r}</b>
                      <span className="af-tier-sub">{tier.d}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Rise>
        </div>
      </section>

      {/* =================== FORM / DASHBOARD ======================= */}
      <section className="section af-join" id="join">
        <div className="wrap af-join-grid">
          <Rise className="af-join-intro">
            <span className="af-kicker">
              {account ? 'Your creator account' : 'Join the program'}
            </span>
            <h2 className="display">
              {account ? 'Everything you need to start sharing.' : 'Get your code.'}
            </h2>
            <p>
              {account
                ? 'Your code is live and ready. Copy it below, add it to your bio, and watch your first orders roll in.'
                : 'Free to join, no minimum following, and you can step away any time. We only need the basics to set up your code.'}
            </p>
            <ul className="af-reassure">
              <li>{Ico.check} Free forever — no fees, no lock-in</li>
              <li>{Ico.check} No minimum follower count</li>
              <li>{Ico.check} Track clicks &amp; earnings any time</li>
            </ul>
          </Rise>

          <Rise delay={90} className="af-join-panel">
            {account ? (
              /* ---------------------- DASHBOARD ---------------------- */
              <div className="af-dash">
                <div className="af-dash-hero">
                  <span className="af-dash-badge">You&rsquo;re in</span>
                  <h3 className="display">
                    You&rsquo;re in, {account.name.split(' ')[0]} 🎉
                  </h3>
                  <p>
                    Your unique Femi9 code is ready. Share it anywhere you post.
                  </p>
                </div>

                <div className="af-copyfield">
                  <span className="af-copyfield-label">Your affiliate code</span>
                  <div className="af-copyfield-row">
                    <code className="af-code display">{account.code}</code>
                    <button
                      type="button"
                      className={`af-copybtn${
                        copied === 'code' ? ' is-copied' : ''
                      }`}
                      onClick={() => copy(account.code, 'code')}
                      aria-label="Copy your affiliate code"
                    >
                      {copied === 'code' ? Ico.check : Ico.copy}
                      <span>{copied === 'code' ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="af-copyfield">
                  <span className="af-copyfield-label">Shareable link</span>
                  <div className="af-copyfield-row">
                    <span className="af-link" title={`https://femi9.in/r/${account.code}`}>
                      https://femi9.in/r/{account.code}
                    </span>
                    <button
                      type="button"
                      className={`af-copybtn${
                        copied === 'link' ? ' is-copied' : ''
                      }`}
                      onClick={() =>
                        copy(`https://femi9.in/r/${account.code}`, 'link')
                      }
                      aria-label="Copy your shareable link"
                    >
                      {copied === 'link' ? Ico.check : Ico.copy}
                      <span>{copied === 'link' ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                <div className="af-stats">
                  <div className="af-stat">
                    <b>{num(account.stats.clicks)}</b>
                    <span>Clicks</span>
                  </div>
                  <div className="af-stat">
                    <b>{num(account.stats.signups)}</b>
                    <span>Sign-ups</span>
                  </div>
                  <div className="af-stat">
                    <b>{inr(account.stats.earnings)}</b>
                    <span>Earnings</span>
                  </div>
                </div>

                <p className="af-payout-note">
                  {Ico.calendar}
                  Payouts on the 1st of each month via UPI. Your numbers update
                  the moment someone uses your code.
                </p>

                <button
                  type="button"
                  className="af-startover"
                  onClick={startOver}
                >
                  Register another creator
                </button>
              </div>
            ) : (
              /* ------------------ REGISTRATION FORM ------------------ */
              <form className="af-form" onSubmit={handleSubmit} noValidate>
                <div className="af-field">
                  <label htmlFor="af-name">Full name</label>
                  <input
                    id="af-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Aisha Verma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div className="af-field">
                  <label htmlFor="af-handle">Social handle</label>
                  <div className="af-handle">
                    <span aria-hidden="true">@</span>
                    <input
                      id="af-handle"
                      type="text"
                      autoComplete="off"
                      placeholder="aisha.reads"
                      value={handle.replace(/^@+/, '')}
                      onChange={(e) =>
                        setHandle(e.target.value.replace(/^@+/, ''))
                      }
                    />
                  </div>
                </div>

                <fieldset className="af-field af-fieldset">
                  <legend>Where do you post?</legend>
                  <div className="af-chips">
                    {PLATFORMS.map((p) => {
                      const on = platform.includes(p)
                      return (
                        <button
                          type="button"
                          key={p}
                          className={`af-chip${on ? ' is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => togglePlatform(p)}
                        >
                          {p}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="af-field">
                  <label htmlFor="af-followers">Followers</label>
                  <div className="af-select">
                    <select
                      id="af-followers"
                      value={followers}
                      onChange={(e) => setFollowers(e.target.value)}
                    >
                      {FOLLOWER_BANDS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                    <span className="af-select-arrow" aria-hidden="true" />
                  </div>
                </div>

                <div className="af-field">
                  <label htmlFor="af-email">Email</label>
                  <input
                    id="af-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {error && (
                  <p className="af-error" role="alert">
                    {error}
                  </p>
                )}

                <button type="submit" className="btn btn-primary af-submit">
                  Create my code
                </button>
                <p className="af-form-fine">
                  By joining you agree to share honestly. No spam — we promise.
                </p>
              </form>
            )}
          </Rise>
        </div>
      </section>

      {/* ============================= FAQ ========================== */}
      <section className="section af-faq-section">
        <div className="wrap af-faq-grid">
          <Rise className="af-faq-intro">
            <h2 className="display">Questions, answered</h2>
            <p>
              Everything creators ask before they sign up. Still unsure? Write to{' '}
              <strong>creators@femi9.in</strong>.
            </p>
          </Rise>

          <Rise delay={90} className="af-faq-list">
            {[
              {
                q: 'When do I get paid?',
                a: 'Earnings are tallied through the month and paid on the 1st via UPI. There is no minimum threshold to receive your first payout — even a single order counts.',
              },
              {
                q: 'Can I use the code myself?',
                a: 'Yes. Your code works on your own orders too, so you get the 10% follower discount whenever you restock — though commission is earned on your community’s orders.',
              },
              {
                q: 'Is there a minimum following?',
                a: 'None at all. Whether you have 500 engaged readers or 500k, you get the same code and the same starting rate. Your commission grows with orders, not follower count.',
              },
              {
                q: 'How is this different from a brand collab?',
                a: 'Collaborations and partnerships are separate, hands-on programs. This is fully self-serve: your code is always live, always yours, and earns commission automatically — no briefs or deadlines.',
              },
            ].map((f) => (
              <details className="af-faq" key={f.q}>
                <summary>
                  <span>{f.q}</span>
                  <span className="af-faq-mark" aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </Rise>
        </div>
      </section>
    </main>
  )
}
