'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

/**
 * Storefront sign-in. Standalone (not under the (store) group) so no nav/footer
 * chrome frames the flow. Two paths share one card:
 *   • Phone OTP — enter number → "Send code" → enter 6 digits → "Verify" → /account
 *   • Email magic link — enter email → "Email me a link"
 *
 * In MOCK/dev mode the request APIs echo a devCode / devLink (no real provider is
 * configured); we surface those on the page so the whole flow is usable locally.
 * Styling stays on the storefront tokens (var(--…)) + the shared .btn classes —
 * deliberately NOT the admin .adm-* system.
 */

type Method = 'phone' | 'email'
type PhoneStep = 'enter' | 'code'

const card: CSSProperties = {
  width: '100%',
  maxWidth: 420,
  background: 'var(--surface)',
  border: '1px solid var(--line-soft)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow)',
  padding: 'clamp(26px,4vw,38px)',
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '.78rem 1rem',
  borderRadius: 14,
  border: '1.5px solid var(--line)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  font: 'inherit',
  outline: 'none',
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '.82rem',
  fontWeight: 600,
  color: 'var(--ink)',
  marginBottom: '.4rem',
}

const tabStyle = (active: boolean): CSSProperties => ({
  flex: 1,
  padding: '.6rem .5rem',
  borderRadius: 'var(--r-chip)',
  fontWeight: 600,
  fontSize: '.9rem',
  color: active ? 'var(--navy)' : 'var(--muted)',
  background: active ? 'var(--lilac-tint)' : 'transparent',
  transition: 'background .2s, color .2s',
})

const noteBox = (tone: 'error' | 'info' | 'dev'): CSSProperties => ({
  padding: '.7rem .9rem',
  borderRadius: 14,
  fontSize: '.86rem',
  marginBottom: '1rem',
  border: '1px solid',
  ...(tone === 'error'
    ? { background: 'rgba(200,40,60,.06)', borderColor: 'rgba(200,40,60,.25)', color: '#9a2237' }
    : tone === 'dev'
      ? { background: 'var(--butter-soft)', borderColor: 'var(--yellow)', color: 'var(--navy)' }
      : { background: 'var(--lilac-tint)', borderColor: 'var(--line)', color: 'var(--ink)' }),
})

export default function LoginPage() {
  const router = useRouter()

  const [method, setMethod] = useState<Method>('phone')

  // Phone OTP
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('enter')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)

  // Email magic link
  const [email, setEmail] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const [devLink, setDevLink] = useState<string | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // Surface the magic-link failure the verify route redirects with. Read from the
  // URL directly (no useSearchParams → no Suspense boundary needed for prerender).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'link') {
      setError('That sign-in link is invalid or has expired. Please request a new one.')
    } else if (params.get('error') === 'google-config') {
      setError('Google sign-in is temporarily unavailable. Please use phone or email sign-in.')
    } else if (params.get('error') === 'google') {
      setError('We could not sign you in with Google. Please try again or use another method.')
    }
  }, [])

  // Move focus to the code field the moment the OTP step appears.
  useEffect(() => {
    if (phoneStep === 'code') codeRef.current?.focus()
  }, [phoneStep])

  function switchMethod(next: Method) {
    setMethod(next)
    setError(null)
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (phone.length !== 10) {
      setError('Enter your 10-digit mobile number.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Could not send the code. Please try again.')
        return
      }
      setDevCode(typeof data?.devCode === 'string' ? data.devCode : null)
      setPhoneStep('code')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (code.length !== 6) {
      setError('Enter the 6-digit code we sent you.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'That code is invalid or has expired.')
        return
      }
      // Cookie is set by the API; refresh so guarded server layouts re-read it.
      router.push('/account')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/auth/email/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError(data?.error ?? 'Could not send the link. Please try again.')
        return
      }
      setDevLink(typeof data?.devLink === 'string' ? data.devLink : null)
      setEmailSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'clamp(20px,5vw,48px)',
      }}
    >
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <Link href="/" aria-label="Femi9 home">
            <img src="/assets/img/logo.png" alt="Femi9" style={{ height: 34, margin: '0 auto .9rem' }} />
          </Link>
          <span className="eyebrow" style={{ justifyContent: 'center' }}>
            Your account
          </span>
          <h1 style={{ fontSize: 'clamp(1.5rem,4vw,1.9rem)', margin: '.45em 0 .2em' }}>Sign in</h1>
          <p style={{ color: 'var(--muted)', fontSize: '.92rem' }}>
            Track orders, manage your subscription, and earn Bloom points.
          </p>
        </div>

        {/* Continue with Google — a top-level navigation to the OAuth start
            route (not a fetch), so the browser follows Google's redirects. */}
        <a
          href="/api/auth/google"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: '.72rem 1rem',
            borderRadius: 14,
            border: '1.5px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
            fontWeight: 600,
            fontSize: '.95rem',
            marginBottom: '1.1rem',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          Continue with Google
        </a>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.1rem' }}>
          <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
          <span style={{ color: 'var(--muted)', fontSize: '.78rem', fontWeight: 600 }}>or</span>
          <span style={{ flex: 1, height: 1, background: 'var(--line-soft)' }} />
        </div>

        {/* Method toggle */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: 4,
            marginBottom: '1.3rem',
            background: 'var(--cream-2)',
            borderRadius: 'var(--r-chip)',
          }}
        >
          <button type="button" style={tabStyle(method === 'phone')} onClick={() => switchMethod('phone')}>
            Mobile OTP
          </button>
          <button type="button" style={tabStyle(method === 'email')} onClick={() => switchMethod('email')}>
            Email link
          </button>
        </div>

        {error && (
          <div style={noteBox('error')} role="alert">
            {error}
          </div>
        )}

        {/* ── Phone OTP ─────────────────────────────────────────────────────── */}
        {method === 'phone' &&
          (phoneStep === 'enter' ? (
            <form onSubmit={sendCode} noValidate>
              <div style={{ marginBottom: '1.1rem' }}>
                <label style={labelStyle} htmlFor="login-phone">
                  Mobile number
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '0 .8rem',
                      borderRadius: 14,
                      border: '1.5px solid var(--line)',
                      background: 'var(--cream-2)',
                      color: 'var(--muted)',
                      fontWeight: 600,
                    }}
                  >
                    +91
                  </span>
                  <input
                    id="login-phone"
                    style={inputStyle}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    autoFocus
                    placeholder="10-digit number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  />
                </div>
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy}
                style={{ width: '100%', opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'Sending…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyCode} noValidate>
              <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '1rem' }}>
                We sent a 6-digit code to <strong style={{ color: 'var(--ink)' }}>+91 {phone}</strong>.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setPhoneStep('enter')
                    setCode('')
                    setDevCode(null)
                    setError(null)
                  }}
                  style={{ color: 'var(--forest-2)', fontWeight: 600, textDecoration: 'underline' }}
                >
                  Change
                </button>
              </p>

              {devCode && (
                <div style={noteBox('dev')}>
                  Dev mode — your code is <strong style={{ letterSpacing: '.12em' }}>{devCode}</strong>
                </div>
              )}

              <div style={{ marginBottom: '1.1rem' }}>
                <label style={labelStyle} htmlFor="login-code">
                  Verification code
                </label>
                <input
                  id="login-code"
                  ref={codeRef}
                  style={{ ...inputStyle, letterSpacing: '.4em', textAlign: 'center', fontSize: '1.2rem' }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="••••••"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                />
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy}
                style={{ width: '100%', opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>
          ))}

        {/* ── Email magic link ──────────────────────────────────────────────── */}
        {method === 'email' &&
          (emailSent ? (
            <div>
              <div style={noteBox('info')}>
                If <strong>{email}</strong> has an account (or is new), a sign-in link is on its way. It expires in
                15 minutes.
              </div>
              {devLink && (
                <div style={noteBox('dev')}>
                  Dev mode — open your link:{' '}
                  <a href={devLink} style={{ color: 'var(--forest-2)', fontWeight: 600, wordBreak: 'break-all' }}>
                    {devLink}
                  </a>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setEmailSent(false)
                  setDevLink(null)
                }}
                style={{ color: 'var(--forest-2)', fontWeight: 600, fontSize: '.88rem', textDecoration: 'underline' }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={sendLink} noValidate>
              <div style={{ marginBottom: '1.1rem' }}>
                <label style={labelStyle} htmlFor="login-email">
                  Email address
                </label>
                <input
                  id="login-email"
                  style={inputStyle}
                  type="email"
                  autoComplete="email"
                  autoFocus
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={busy}
                style={{ width: '100%', opacity: busy ? 0.7 : 1 }}
              >
                {busy ? 'Sending…' : 'Email me a link'}
              </button>
            </form>
          ))}

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.82rem', marginTop: '1.4rem' }}>
          By continuing you agree to our care in handling your data.
        </p>
      </div>
    </main>
  )
}
