'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRAND_CONFIG, type Brand } from '@femi9/core/brands'

/**
 * The form on /<brand>/change-password. Reuses the exact `.adm-auth-*` shell
 * the login card draws on so a forced-change lands on a screen that feels
 * like the sign-in — not a jarring drop into console chrome. Passes the
 * brand's accent via `--accent` on the container the same way LoginCard
 * does, so the F/L badge and the submit button carry brand colour.
 */

const MIN_LENGTH = 12

export function ChangePasswordCard({
  brand,
  email,
  forced,
}: {
  brand: Brand
  email: string
  forced: boolean
}) {
  const router = useRouter()
  const config = BRAND_CONFIG[brand]
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`)
      return
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    if (next === current) {
      setError('New password must differ from the current one.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/${brand}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setError(body.error || 'Could not change the password.')
        setBusy(false)
        return
      }
      router.replace(`/${brand}`)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setBusy(false)
    }
  }

  return (
    <main
      className="adm-auth"
      data-brand={brand}
      style={{ ['--accent' as string]: config.accent }}
    >
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

        <h1 className="adm-auth-title">
          {forced ? 'Set your password' : 'Change password'}
        </h1>
        <p className="adm-auth-sub">
          {forced ? (
            <>
              Welcome, {email}. Please set a new password to finish activating
              your account — the temporary one from the invite email stops
              working after this.
            </>
          ) : (
            <>Signed in as {email}. Choose a new password below.</>
          )}
        </p>

        <label className="adm-field">
          <span className="adm-label">
            {forced ? 'Temporary password' : 'Current password'}
          </span>
          <div className="adm-auth-password">
            <input
              className="adm-input adm-auth-password-input"
              type={showCurrent ? 'text' : 'password'}
              name="current"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              disabled={busy}
            />
            <button
              type="button"
              className="adm-auth-password-toggle"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
              aria-pressed={showCurrent}
              tabIndex={-1}
              disabled={busy}
            >
              {eye(showCurrent)}
            </button>
          </div>
        </label>

        <label className="adm-field">
          <span className="adm-label">New password (min {MIN_LENGTH} chars)</span>
          <div className="adm-auth-password">
            <input
              className="adm-input adm-auth-password-input"
              type={showNext ? 'text' : 'password'}
              name="new"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={MIN_LENGTH}
              disabled={busy}
            />
            <button
              type="button"
              className="adm-auth-password-toggle"
              onClick={() => setShowNext((v) => !v)}
              aria-label={showNext ? 'Hide password' : 'Show password'}
              aria-pressed={showNext}
              tabIndex={-1}
              disabled={busy}
            >
              {eye(showNext)}
            </button>
          </div>
        </label>

        <label className="adm-field">
          <span className="adm-label">Confirm new password</span>
          <input
            className="adm-input"
            type={showNext ? 'text' : 'password'}
            name="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_LENGTH}
            disabled={busy}
          />
        </label>

        {error && (
          <div className="adm-auth-error">
            <span className="adm-error">{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="adm-btn adm-btn--primary adm-auth-submit"
          disabled={busy || !current || !next || !confirm}
        >
          {busy ? 'Saving…' : forced ? 'Set password & continue' : 'Save new password'}
        </button>
      </form>
    </main>
  )
}

/** eye / eye-off SVGs — same shapes the login toggle uses so the two screens
 *  read as one. */
function eye(shown: boolean) {
  return shown ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}
