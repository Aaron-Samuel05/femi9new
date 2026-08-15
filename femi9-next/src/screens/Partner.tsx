import { useState } from 'react'
import '../styles/partner.css'

type FormState = {
  name: string
  phone: string
  city: string
  reason: string
  situation: string
}

const SITUATIONS = ['Homemaker', 'Student', 'Working', 'Running a small shop']

const STATS = [
  { n: '5,000+', l: 'women entrepreneurs' },
  { n: '12', l: 'districts across Tamil Nadu' },
  { n: 'Rs.8,000–20,000', l: 'average monthly earning' },
  { n: '100%', l: 'flexible hours' },
]

const STEPS = [
  {
    n: '01',
    t: 'Apply',
    d: 'Fill the short form below. It takes about two minutes - no paperwork.',
  },
  {
    n: '02',
    t: 'Get onboarded',
    d: 'Meet your local team, collect a starter kit and simple, friendly training.',
  },
  {
    n: '03',
    t: 'Sell in your community',
    d: 'On WhatsApp, at your doorstep, or through nearby shops - however suits you.',
  },
  {
    n: '04',
    t: 'Earn & grow',
    d: 'Make money on every pack and build a loyal base of customers who reorder.',
  },
]

// small, plain stroke icons — a simple shape per benefit
function IconCoin() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v9M14.4 9.4c-.6-.7-1.5-1-2.4-1-1.5 0-2.6.8-2.6 2s1.1 1.6 2.6 1.9c1.5.3 2.6.8 2.6 2s-1.1 2-2.6 2c-1 0-1.9-.4-2.5-1.1" strokeLinecap="round" />
    </svg>
  )
}
function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 11 12 4l8 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9h12v-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19v-5h4v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3.5 5 6.2v5c0 4.3 2.9 7.3 7 9.3 4.1-2 7-5 7-9.3v-5L12 3.5Z" strokeLinejoin="round" />
      <path d="M9.2 12.2 11.2 14l3.6-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconSupport() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5.5 20c.6-3.4 3.2-5.4 6.5-5.4S17.9 16.6 18.5 20" strokeLinecap="round" />
    </svg>
  )
}
function IconSprout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 20v-7" strokeLinecap="round" />
      <path d="M12 13c0-3-2.2-5-5-5 0 3 2.2 5 5 5Z" strokeLinejoin="round" />
      <path d="M12 12c0-3.4 2.3-5.6 5.4-5.6C17.4 9.8 15.1 12 12 12Z" strokeLinejoin="round" />
    </svg>
  )
}

const BENEFITS = [
  {
    icon: <IconCoin />,
    t: 'Flexible income',
    d: 'Earn on every pack you sell. The more you grow, the more you make.',
  },
  {
    icon: <IconHome />,
    t: 'Work from home',
    d: 'Sell around your family and your day. No office, no boss, no commute.',
  },
  {
    icon: <IconShield />,
    t: 'A product women trust',
    d: 'Organic, doctor-formulated pads your neighbours reorder with confidence.',
  },
  {
    icon: <IconSupport />,
    t: 'Training & support',
    d: 'We guide you at every step, from your very first sale onward.',
  },
  {
    icon: <IconSprout />,
    t: 'No big investment',
    d: 'Start small with a low-cost starter kit. No savings needed to begin.',
  },
]

const VOICES = [
  {
    q: 'I earn while my kids are at school, and my neighbours finally trust their pads.',
    name: 'Selvi',
    place: 'Erode',
  },
  {
    q: 'I started with one starter kit. Now thirty homes on my street buy only from me.',
    name: 'Kavitha',
    place: 'Namakkal',
  },
]

function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function Partner() {
  const [form, setForm] = useState<FormState>({
    name: '',
    phone: '',
    city: '',
    reason: '',
    situation: SITUATIONS[0],
  })
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  // Holds just the applicant's name once the lead is accepted — enough to
  // personalise the success panel without keeping the whole submission around.
  const [saved, setSaved] = useState<{ name: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const update = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  const onPhone = (value: string) =>
    update('phone', value.replace(/\D/g, '').slice(0, 10))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = form.name.trim()
    const phone = form.phone.trim()
    const next: { name?: string; phone?: string } = {}
    if (!name) next.name = 'Please tell us your name.'
    if (phone.length !== 10) next.phone = 'Enter your 10-digit mobile number.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    // Persist the lead to the CRM pipeline (was a localStorage stub before) so
    // the sales team can follow up — the whole point of the form.
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch('/api/partner/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          city: form.city.trim(),
          situation: form.situation,
          reason: form.reason.trim(),
        }),
      })
      if (!res.ok) throw new Error()
      setSaved({ name })
    } catch {
      // Keep the form intact so the visitor can simply retry.
      setSubmitError('Something went wrong sending your application. Please try again in a moment.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="partner">
      {/* ── 1 · HERO ───────────────────────────────────────────── */}
      <section className="pt-hero">
        <div className="pt-hero-glow" aria-hidden="true" />
        <div className="wrap pt-hero-inner">
          <span className="eyebrow">Opportunities</span>
          <h1 className="display pt-hero-title">
            Turn better periods into your livelihood.
          </h1>
          <p className="pt-hero-sub">
            Join 5,000+ women across Tamil Nadu earning a real income by bringing
            trusted, organic period care to the people they already know.
          </p>
          <div className="pt-hero-cta">
            <button type="button" className="btn btn-primary" onClick={() => scrollToId('apply')}>
              Apply to become a partner
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => scrollToId('how')}>
              How it works
            </button>
          </div>
          <p className="pt-hero-note">
            No investment to start · Work on your own hours · We call you on WhatsApp
          </p>
        </div>
      </section>

      {/* ── 2 · STATS BAND ─────────────────────────────────────── */}
      <section className="wrap pt-stats-wrap">
        <div className="pt-stats">
          {STATS.map((s) => (
            <div className="pt-stat" key={s.l}>
              <div className="display pt-stat-n">{s.n}</div>
              <div className="pt-stat-l">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 3 · HOW IT WORKS ───────────────────────────────────── */}
      <section id="how" className="section wrap pt-how">
        <header className="pt-head">
          <h2 className="display">How it works</h2>
          <p>Four simple steps from your first hello to your first earning.</p>
        </header>
        <ol className="pt-steps">
          {STEPS.map((s) => (
            <li className="pt-step" key={s.n}>
              <span className="display pt-step-n">{s.n}</span>
              <h3 className="pt-step-t">{s.t}</h3>
              <p className="pt-step-d">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 4 · WHY PARTNER (bento) ────────────────────────────── */}
      <section className="section wrap pt-why">
        <header className="pt-head">
          <h2 className="display">Why partner with Femi9</h2>
          <p>Dignified work that fits your life - and grows a business that is yours.</p>
        </header>
        <div className="pt-why-grid">
          <article className="pt-feature">
            <h3 className="display pt-feature-t">Be part of a movement</h3>
            <p className="pt-feature-d">
              Every pack you sell puts health, dignity and income into the hands of
              women across Tamil Nadu - starting with your own.
            </p>
            <p className="pt-feature-tag">5,000+ women already lead the way</p>
          </article>
          {BENEFITS.map((b) => (
            <article className="pt-benefit" key={b.t}>
              <span className="pt-benefit-ic">{b.icon}</span>
              <h3 className="pt-benefit-t">{b.t}</h3>
              <p className="pt-benefit-d">{b.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── 5 · VOICES (plum panel) ────────────────────────────── */}
      <section className="section wrap">
        <div className="pt-voices">
          <div className="pt-voices-head">
            <span className="pt-voices-eyebrow">In their words</span>
            <h2 className="display pt-voices-title">Partners who lead in their streets.</h2>
          </div>
          <div className="pt-voices-grid">
            {VOICES.map((v) => (
              <figure className="pt-voice" key={v.name}>
                <blockquote>{v.q}</blockquote>
                <figcaption>
                  <span className="pt-voice-name">{v.name}</span>
                  <span className="pt-voice-place">{v.place}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6 · APPLICATION FORM ───────────────────────────────── */}
      <section id="apply" className="section wrap pt-apply">
        <div className="pt-apply-grid">
          <div className="pt-apply-intro">
            <h2 className="display">Apply to become a partner</h2>
            <p>
              Tell us a little about yourself. There is no cost to apply and no
              obligation - our team will call you on WhatsApp to talk it through.
            </p>
            <ul className="pt-apply-list">
              <li>A friendly local team, in your own language</li>
              <li>A starter kit and hands-on training</li>
              <li>Earn from your very first pack</li>
            </ul>
          </div>

          {saved ? (
            <div className="pt-success" role="status" aria-live="polite">
              <span className="pt-success-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m5 12.5 4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="display">Application received</h3>
              <p>
                Thank you, {saved.name}. Our team will reach out on WhatsApp within
                2 working days.
              </p>
              <p className="pt-success-sub">
                Keep your phone handy - we&apos;ll call you on WhatsApp to talk it
                through. Welcome to the Femi9 family.
              </p>
            </div>
          ) : (
            <form className="pt-form" onSubmit={onSubmit} noValidate>
              <div className="pt-field">
                <label htmlFor="pt-name">Full name</label>
                <input
                  id="pt-name"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Lakshmi Priya"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  aria-invalid={!!errors.name}
                />
                {errors.name && <span className="pt-err">{errors.name}</span>}
              </div>

              <div className="pt-field">
                <label htmlFor="pt-phone">Phone number</label>
                <div className="pt-phone">
                  <span className="pt-phone-cc">+91</span>
                  <input
                    id="pt-phone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="10-digit mobile number"
                    value={form.phone}
                    onChange={(e) => onPhone(e.target.value)}
                    aria-invalid={!!errors.phone}
                  />
                </div>
                {errors.phone && <span className="pt-err">{errors.phone}</span>}
              </div>

              <div className="pt-field">
                <label htmlFor="pt-city">City / district</label>
                <input
                  id="pt-city"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="e.g. Coimbatore"
                  value={form.city}
                  onChange={(e) => update('city', e.target.value)}
                />
              </div>

              <div className="pt-field">
                <label htmlFor="pt-situation">Your current situation</label>
                <select
                  id="pt-situation"
                  value={form.situation}
                  onChange={(e) => update('situation', e.target.value)}
                >
                  {SITUATIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-field pt-field--full">
                <label htmlFor="pt-reason">Why do you want to partner?</label>
                <textarea
                  id="pt-reason"
                  rows={3}
                  placeholder="A line or two about what brings you here - no wrong answers."
                  value={form.reason}
                  onChange={(e) => update('reason', e.target.value)}
                />
              </div>

              {submitError && (
                <div className="pt-field pt-field--full">
                  <span className="pt-err" role="alert">{submitError}</span>
                </div>
              )}

              <div className="pt-form-foot">
                <button type="submit" className="btn btn-primary pt-submit" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit application'}
                </button>
                <span className="pt-form-note">We reply on WhatsApp within 2 working days.</span>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* ── 7 · CLOSING ────────────────────────────────────────── */}
      <section className="wrap pt-close">
        <p className="display">
          Whether you sell to five homes or five hundred, you belong here. Femi9
          grows because women like you choose to lead.
        </p>
      </section>
    </main>
  )
}
