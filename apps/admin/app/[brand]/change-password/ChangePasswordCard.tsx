'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Brand } from '@femi9/core/brands'

/**
 * The form on /<brand>/change-password. Uses the same `.adm-auth` sheet the
 * login page draws on, so a forced-change lands on a screen that FEELS like
 * the sign-in — not a jarring drop into console chrome. On success we
 * refresh the session (POST returns a fresh cookie with mustChangePassword
 * cleared) and push the invited admin into their dashboard.
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
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
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
      // Session cookie was rewritten server-side without mustChangePassword.
      router.replace(`/${brand}`)
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
      setBusy(false)
    }
  }

  return (
    <main className="adm-auth" data-brand={brand}>
      <form className="adm-auth-card" onSubmit={submit}>
        <div className="adm-auth-head">
          <div className="adm-auth-badge" aria-hidden="true">
            {brand === 'femi9' ? 'F' : 'L'}
          </div>
          <span className="adm-auth-eyebrow">Ops</span>
        </div>

        <h1 className="adm-auth-title">
          {forced ? 'Set your password' : 'Change password'}
        </h1>
        <p className="adm-auth-sub">
          {forced ? (
            <>
              Welcome, {email}. Please set a new password to finish activating your
              account — the temporary one from the invite email stops working after this.
            </>
          ) : (
            <>Signed in as {email}. Choose a new password below.</>
          )}
        </p>

        <label className="adm-auth-field">
          <span className="adm-auth-label">
            {forced ? 'Temporary password' : 'Current password'}
          </span>
          <div style={{ position: 'relative' }}>
            <input
              className="adm-auth-input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              disabled={busy}
            />
          </div>
        </label>

        <label className="adm-auth-field">
          <span className="adm-auth-label">New password (min {MIN_LENGTH} chars)</span>
          <input
            className="adm-auth-input"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={MIN_LENGTH}
            disabled={busy}
          />
        </label>

        <label className="adm-auth-field">
          <span className="adm-auth-label">Confirm new password</span>
          <input
            className="adm-auth-input"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={MIN_LENGTH}
            disabled={busy}
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 4,
            fontSize: 13,
            color: 'var(--muted)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={show}
            onChange={(e) => setShow(e.target.checked)}
            disabled={busy}
          />
          Show passwords
        </label>

        {error && (
          <div className="adm-auth-error" style={{ marginTop: 12 }}>
            <span className="adm-error">{error}</span>
          </div>
        )}

        <button
          type="submit"
          className="adm-auth-submit"
          disabled={busy || !current || !next || !confirm}
        >
          {busy ? 'Saving…' : forced ? 'Set password & continue' : 'Save new password'}
        </button>
      </form>
    </main>
  )
}
