'use client'

import { useState } from 'react'

/**
 * Team management for this brand — invite, change role, deactivate/re-activate.
 * All actions go through /[brand]/api/admin-users; the service checks
 * canManageAdmins on the caller's role before every mutation.
 */

type Role =
  | 'super_admin'
  | 'owner'
  | 'finance'
  | 'orders_manager'
  | 'content_manager'
  | 'manager'
  | 'support'
  | 'readonly'

interface Row {
  id: string
  email: string
  name: string
  active: boolean
  role: Role
  createdAt: string
}

/** Business-role names first (what we want people to pick going forward),
 *  legacy tiered roles at the bottom for backward compatibility. */
const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'super_admin', label: 'Super Admin', hint: 'Full access; can manage other admins' },
  { value: 'finance', label: 'Finance', hint: 'Orders (view) · Subs (view) · Pricing · Coupons · Affiliates' },
  { value: 'orders_manager', label: 'Orders & Inventory', hint: 'Orders · Subs · Inventory · Products (view)' },
  { value: 'content_manager', label: 'SEO / Blog / Reviews', hint: 'Blog · Reviews · Community · Parenting · Settings (view)' },
  { value: 'owner', label: 'Owner (legacy)', hint: 'Same as Super Admin; kept for old accounts' },
  { value: 'manager', label: 'Manager (legacy)', hint: 'Write access to every module' },
  { value: 'support', label: 'Support (legacy)', hint: 'Ordinary writes on every module; no destructive ops' },
  { value: 'readonly', label: 'Read-only (legacy)', hint: 'Reads everywhere; no writes' },
]

function roleLabel(r: Role) {
  return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r
}

export function TeamManager({
  brand,
  currentUserId,
  initialRows,
}: {
  brand: 'femi9' | 'lumi9'
  currentUserId: string
  initialRows: Row[]
}) {
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch(`/${brand}/api/admin-users`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (Array.isArray(body?.rows)) {
      setRows(
        body.rows.map((r: {
          id: string; email: string; name: string; active: boolean; createdAt: string;
          brandRoles: { brand: string; role: Role }[];
        }) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          active: r.active,
          createdAt: r.createdAt,
          role: r.brandRoles.find((br) => br.brand === brand)?.role ?? 'readonly',
        })),
      )
    }
  }

  async function changeRole(id: string, role: Role) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/admin-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Could not update role.')
      } else {
        await refresh()
      }
    } finally {
      setBusyId(null)
    }
  }

  async function toggleActive(id: string, next: boolean) {
    if (id === currentUserId && !next) {
      setError('You cannot deactivate your own account.')
      return
    }
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/${brand}/api/admin-users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Could not update.')
      } else {
        await refresh()
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="adm-team">
      <div className="adm-toolbar">
        <div>
          <h1 className="adm-page-title">Team</h1>
          <p className="adm-help">
            Admins for {brand === 'femi9' ? 'Femi9' : 'Lumi9'}. Only Super Admins see this page.
          </p>
        </div>
        <div>
          <button className="adm-btn adm-btn--primary" onClick={() => setInviteOpen(true)}>
            Invite admin
          </button>
        </div>
      </div>

      {error && (
        <div className="adm-auth-error" style={{ marginBottom: 12 }}>
          <span className="adm-error">{error}</span>
        </div>
      )}

      <div className="adm-card">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Since</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.active ? '' : 'is-inactive'}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  {r.id === currentUserId && (
                    <span className="adm-chip" style={{ marginTop: 4, fontSize: 11 }}>
                      you
                    </span>
                  )}
                </td>
                <td style={{ fontFamily: 'var(--mono, ui-monospace)', fontSize: 12 }}>
                  {r.email}
                </td>
                <td>
                  <select
                    className="adm-select"
                    value={r.role}
                    disabled={busyId === r.id}
                    onChange={(e) => changeRole(r.id, e.target.value as Role)}
                  >
                    {ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} title={o.hint}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={'adm-status adm-status--' + (r.active ? 'ok' : 'off')}>
                    {r.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(r.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {r.id !== currentUserId && (
                    <button
                      className="adm-btn adm-btn--ghost"
                      disabled={busyId === r.id}
                      onClick={() => toggleActive(r.id, !r.active)}
                    >
                      {r.active ? 'Deactivate' : 'Re-activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
                  No other admins yet. Invite your first teammate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {inviteOpen && (
        <InviteModal
          brand={brand}
          onClose={() => setInviteOpen(false)}
          onCreated={async () => {
            setInviteOpen(false)
            await refresh()
          }}
        />
      )}

      <style jsx>{`
        .adm-team { padding: 24px 28px; }
        .adm-team .adm-page-title {
          font-family: var(--serif); font-weight: 500; font-size: 24px; margin: 0 0 4px;
        }
        .adm-team .adm-toolbar {
          display: flex; justify-content: space-between; align-items: end;
          margin-bottom: 20px; gap: 16px; flex-wrap: wrap;
        }
        .adm-team .adm-table { width: 100%; }
        .adm-team .adm-status {
          display: inline-block; padding: 2px 10px; border-radius: 999px;
          font-size: 11.5px; font-weight: 600;
        }
        .adm-team .adm-status--ok { background: #E1F0E7; color: #3D8B5C; }
        .adm-team .adm-status--off { background: #F4EDE3; color: #7A6250; }
        .adm-team tr.is-inactive td { opacity: 0.55; }
      `}</style>
    </div>
  )
}

function InviteModal({
  brand,
  onClose,
  onCreated,
}: {
  brand: 'femi9' | 'lumi9'
  onClose: () => void
  onCreated: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('content_manager')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/${brand}/api/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role, password }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(body.error || 'Could not invite.')
        return
      }
      await onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-modal-scrim" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Invite admin</h2>
        <form onSubmit={submit}>
          <label className="adm-field">
            <span className="adm-label">Email</span>
            <input
              className="adm-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="adm-field">
            <span className="adm-label">Name</span>
            <input
              className="adm-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="adm-field">
            <span className="adm-label">Role</span>
            <select
              className="adm-select"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={busy}
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <span className="adm-help">
              {ROLE_OPTIONS.find((o) => o.value === role)?.hint}
            </span>
          </label>
          <label className="adm-field">
            <span className="adm-label">Temporary password (12+ chars)</span>
            <input
              className="adm-input"
              type="text"
              minLength={12}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              placeholder="They should change this after first sign-in"
            />
          </label>
          {err && (
            <div className="adm-auth-error"><span className="adm-error">{err}</span></div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
              {busy ? 'Inviting…' : `Invite as ${roleLabel(role)}`}
            </button>
          </div>
        </form>

        <style jsx>{`
          .adm-modal-scrim {
            position: fixed; inset: 0; background: rgba(30, 22, 48, 0.55);
            display: flex; align-items: center; justify-content: center; z-index: 100;
            padding: 16px;
          }
          .adm-modal {
            background: white; border-radius: 12px; padding: 24px 28px;
            width: 100%; max-width: 460px; box-shadow: 0 20px 60px rgba(30,22,48,0.3);
          }
          .adm-modal h2 {
            font-family: var(--serif); font-weight: 500; font-size: 22px; margin: 0 0 16px;
          }
        `}</style>
      </div>
    </div>
  )
}
