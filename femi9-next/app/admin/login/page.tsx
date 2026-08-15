'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import '@/styles/admin.css'

/**
 * Admin sign-in. Standalone (not wrapped by the (panel) shell) so no sidebar
 * renders. On success the cookie is set by the API, then we navigate to /admin
 * and refresh so the guarded server layout re-reads the fresh session.
 */
export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Sign in failed. Please try again.')
        return
      }
      router.push('/admin')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-auth">
      <form className="adm-auth-card" onSubmit={onSubmit} noValidate>
        <div className="adm-auth-brand">
          <img className="adm-auth-mark" src="/assets/img/logo-mark.svg" alt="Femi9" />
          <span className="adm-auth-eyebrow">Ops console</span>
        </div>

        <h1 className="adm-auth-title">Sign in</h1>
        <p className="adm-auth-sub">Welcome back. Enter your admin credentials to continue.</p>

        {error && (
          <div className="adm-error adm-auth-error" role="alert">
            {error}
          </div>
        )}

        <div className="adm-field">
          <label className="adm-label" htmlFor="adm-email">
            Email
          </label>
          <input
            id="adm-email"
            className="adm-input"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="adm-field">
          <label className="adm-label" htmlFor="adm-password">
            Password
          </label>
          <input
            id="adm-password"
            className="adm-input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="adm-btn adm-btn--primary adm-auth-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
