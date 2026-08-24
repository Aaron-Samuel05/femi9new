'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BRAND_CONFIG, BRANDS, type Brand } from '@femi9/core/brands'

/**
 * The sign-in card.
 *
 * Brand is a segmented toggle at the top of the form, above the fields, so
 * staff can see which console they are entering before they type. The card
 * re-themes on selection.
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
    <form className="card" onSubmit={submit} style={{ ['--accent' as string]: config.accent }}>
      <div className="brandRow" role="group" aria-label="Choose a brand">
        {BRANDS.map((key) => {
          const selected = key === brand
          return (
            <button
              key={key}
              type="button"
              className={selected ? 'brandBtn isOn' : 'brandBtn'}
              aria-pressed={selected}
              onClick={() => chooseBrand(key)}
              style={selected ? { background: BRAND_CONFIG[key].accent } : undefined}
            >
              {BRAND_CONFIG[key].shortName}
            </button>
          )
        })}
      </div>

      <h1 className="title">{config.name} admin</h1>
      <p className="sub">Sign in to continue.</p>

      <label className="field">
        <span>Email</span>
        <input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </label>

      <label className="field">
        <span>Password</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </label>

      {/* aria-live so the failure is announced, not just drawn. */}
      <p className="error" role="alert" aria-live="polite">
        {error ?? ' '}
      </p>

      <button className="submit" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : `Sign in to ${config.shortName}`}
      </button>
    </form>
  )
}
