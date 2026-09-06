'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRAND_CONFIG, BRANDS, type Brand } from '@femi9/core/brands'
import { safeNext } from '@/lib/safe-next'

/**
 * The sign-in card.
 *
 * Brand is a segmented toggle at the top of the form, above the fields, so
 * staff can see which console they are entering before they type. The card
 * re-themes on selection — `data-brand` on `.adm-auth` re-points the sheet's
 * accent ramp, so the whole screen follows, not just one button.
 *
 * The toggle is a convenience, never an authorisation — the server checks the
 * admin's membership in the chosen brand and answers identically whichever way
 * it fails.
 */

const REMEMBER_KEY = 'f9-admin-brand'

export function LoginCard({
  initialBrand,
  next,
  lockBrand = false,
}: {
  initialBrand: Brand
  next: string | null
  /** When true, hide the brand toggle — the invitee arrived from an invite
   *  email that already named the brand, and a toggle to another one just
   *  confuses (or fails silently). */
  lockBrand?: boolean
}) {
  const router = useRouter()
  const [brand, setBrand] = useState<Brand>(initialBrand)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const config = BRAND_CONFIG[brand]

  function chooseBrand(next: Brand) {
    setBrand(next)
    setError(null)
    // Remembered so whoever only ever uses one console never touches the toggle.
    try {
      window.localStorage.setItem(REMEMBER_KEY, next)
    } catch {
      // Private mode, or storage disabled. The toggle still works.
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand, email, password }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setError(body?.error ?? 'Invalid email or password')
        setPassword('')
        return
      }
      // `safeNext`, not `next`. This is the ONE place the destination is known
      // to be safe to use: the brand is decided (the toggle is client state, so
      // the server rendering this page could not know it), and the sign-in has
      // succeeded.
      //
      // It was written, unit-tested, and then imported by nothing. The page
      // upstream only checked `startsWith('/')`, which `//evil.example` passes —
      // and a protocol-relative path in `router.push` is an off-site navigation.
      // So `/login?brand=lumi9&next=//evil.example` signed an admin in and landed
      // them on somebody else's page: the exact setup for a "your session
      // expired, sign in again" phish, arriving from a real console link, after a
      // real successful login.
      router.push(safeNext(next, brand))
      router.refresh()
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="adm-auth" data-brand={brand} style={{ ['--accent' as string]: config.accent }}>
      {/* `method="post"` matters even though `submit` preventDefaults every
          time it runs. Between first paint and hydration the handler is not
          attached yet, and a form with no method is a GET — so an admin who
          types fast, or whose password manager autofills and presses Enter, or
          whose bundle fails to load at all, submits to this same URL with
          `?email=…&password=…` in the query string. That lands in the browser
          history, the Referer of every subsequent request, and every access log
          in front of this service. POST puts it in a body that goes nowhere
          instead: the page route has no POST handler, so the pre-hydration
          submit fails visibly rather than leaking silently. */}
      <form className="adm-auth-card" method="post" onSubmit={submit}>
        <div className="adm-auth-brand">
          <svg
            className="adm-auth-mark"
            viewBox="0 0 24 24"
            width="24"
            height="24"
            aria-hidden="true"
          >
            <rect width="24" height="24" rx="7" fill={config.accent} />
            <text
              x="12"
              y="12"
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="12"
              fontWeight="700"
              fill="#fff"
              fontFamily="inherit"
            >
              {config.name.charAt(0)}
            </text>
          </svg>
          <span className="adm-auth-eyebrow">Ops</span>
        </div>

        {!lockBrand && (
          <div className="adm-chip-group" role="group" aria-label="Choose a brand">
            {BRANDS.map((key) => {
              const selected = key === brand
              return (
                <button
                  key={key}
                  type="button"
                  className={selected ? 'adm-chip is-active' : 'adm-chip'}
                  aria-pressed={selected}
                  onClick={() => chooseBrand(key)}
                >
                  {BRAND_CONFIG[key].shortName}
                </button>
              )
            })}
          </div>
        )}

        <h1 className="adm-auth-title">{config.name} admin</h1>
        <p className="adm-auth-sub">Sign in to continue.</p>

        <label className="adm-field">
          <span className="adm-label">Email</span>
          <input
            className="adm-input"
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>

        <label className="adm-field">
          <span className="adm-label">Password</span>
          <div className="adm-auth-password">
            <input
              className="adm-input adm-auth-password-input"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              className="adm-auth-password-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              tabIndex={-1}
              disabled={busy}
            >
              {showPassword ? (
                // eye-off
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a19.77 19.77 0 0 1 4.06-5.09M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a19.65 19.65 0 0 1-3.17 4.19M14.12 14.12A3 3 0 1 1 9.88 9.88"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              ) : (
                // eye
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              )}
            </button>
          </div>
        </label>

        {/* aria-live so the failure is announced, not just drawn. The wrapper is
            always in the tree — only its painted shell is conditional — so the
            live region exists before the message arrives. */}
        <div aria-live="polite" role="alert">
          {error && (
            <div className="adm-auth-error">
              <span className="adm-error">{error}</span>
            </div>
          )}
        </div>

        <button className="adm-btn adm-btn--primary adm-auth-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : `Sign in to ${config.shortName}`}
        </button>
      </form>
    </main>
  )
}
