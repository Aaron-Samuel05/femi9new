'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRAND_CONFIG, BRANDS, type Brand } from '@femi9/core/brands'

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

export function LoginCard({ initialBrand, next }: { initialBrand: Brand; next: string | null }) {
  const router = useRouter()
  const [brand, setBrand] = useState<Brand>(initialBrand)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      router.push(next ?? `/${brand}`)
      router.refresh()
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="adm-auth" data-brand={brand} style={{ ['--accent' as string]: config.accent }}>
      <form className="adm-auth-card" onSubmit={submit}>
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
          <input
            className="adm-input"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
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
