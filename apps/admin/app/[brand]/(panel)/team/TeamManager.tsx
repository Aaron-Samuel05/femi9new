'use client'

import { useState } from 'react'

/**
 * Cross-brand team management. Super admins can grant any of the eight roles
 * to any admin on either brand, one brand, both brands, or neither.
 *
 * Every mutation replaces the full membership set for the target user via
 * `PATCH /admin-users/[id] { memberships: [...] }`. The service is
 * additive+destructive: brands not in the array lose access, brands in the
 * array get upserted at the given role.
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

type Brand = 'femi9' | 'lumi9'

interface Membership {
  brand: Brand
  role: Role
}

interface Row {
  id: string
  email: string
  name: string
  active: boolean
  createdAt: string
  memberships: Membership[]
}

const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: 'super_admin', label: 'Super Admin', hint: 'Full access; can manage other admins' },
  { value: 'finance', label: 'Finance', hint: 'Orders (view) · Subs (view) · Pricing · Coupons · Affiliates' },
  { value: 'orders_manager', label: 'Orders & Inventory', hint: 'Orders · Subs · Inventory · Products (view)' },
  { value: 'content_manager', label: 'SEO / Blog / Reviews', hint: 'Blog · Reviews · Community · Parenting · Settings (view)' },
  { value: 'owner', label: 'Owner (legacy)', hint: 'Same as Super Admin; kept for old accounts' },
  { value: 'manager', label: 'Manager (legacy)', hint: 'Write access to every module' },
  { value: 'support', label: 'Support (legacy)', hint: 'Ordinary writes; no destructive ops' },
  { value: 'readonly', label: 'Read-only (legacy)', hint: 'Reads everywhere; no writes' },
]

function roleLabel(r: Role) {
  return ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r
}

const BRAND_META: Record<Brand, { label: string; color: string; tint: string }> = {
  femi9: { label: 'Femi9', color: '#5B3FDA', tint: '#EFEBFF' },
  lumi9: { label: 'Lumi9', color: '#4F6F52', tint: '#EAF3EC' },
}

export function TeamManager({
  viewingBrand,
  currentUserId,
  initialRows,
}: {
  viewingBrand: Brand
  currentUserId: string
  initialRows: Row[]
}) {
  const [rows, setRows] = useState<Row[]>(initialRows)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<Row | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const res = await fetch(`/${viewingBrand}/api/admin-users`, { cache: 'no-store' })
    const body = await res.json().catch(() => ({}))
    if (Array.isArray(body?.rows)) {
      setRows(
        body.rows.map((r: Row) => ({
          id: r.id,
          email: r.email,
          name: r.name,
          active: r.active,
          createdAt: r.createdAt,
          memberships: r.memberships,
        })),
      )
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
      const res = await fetch(`/${viewingBrand}/api/admin-users/${id}`, {
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
            Admins across Femi9 and Lumi9. Only Super Admins see this page.
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
              <th style={{ width: '22%' }}>Person</th>
              <th style={{ width: '22%' }}>Email</th>
              <th>Access</th>
              <th style={{ width: 90 }}>Status</th>
              <th style={{ width: 110 }}>Since</th>
              <th style={{ width: 180, textAlign: 'right' }}>Actions</th>
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
                <td className="adm-mono">{r.email}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {r.memberships.length === 0 ? (
                      <span className="adm-help" style={{ fontSize: 12 }}>
                        No access
                      </span>
                    ) : (
                      r.memberships.map((m) => (
                        <BrandChip key={m.brand} brand={m.brand} role={m.role} />
                      ))
                    )}
                  </div>
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
                  <button
                    className="adm-btn adm-btn--ghost"
                    onClick={() => setEditingUser(r)}
                    style={{ marginRight: 6 }}
                  >
                    Edit access
                  </button>
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
          viewingBrand={viewingBrand}
          onClose={() => setInviteOpen(false)}
          onSaved={async () => {
            setInviteOpen(false)
            await refresh()
          }}
        />
      )}

      {editingUser && (
        <EditAccessModal
          viewingBrand={viewingBrand}
          user={editingUser}
          isSelf={editingUser.id === currentUserId}
          onClose={() => setEditingUser(null)}
          onSaved={async () => {
            setEditingUser(null)
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
        .adm-team .adm-mono { font-family: var(--mono, ui-monospace); font-size: 12px; }
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

function BrandChip({ brand, role }: { brand: Brand; role: Role }) {
  const meta = BRAND_META[brand]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        background: meta.tint,
        color: meta.color,
        fontSize: 11.5,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
      {meta.label} · {roleLabel(role)}
    </span>
  )
}

// ─────────────────────────────── Invite modal ──────────────────────────────

function InviteModal({
  viewingBrand,
  onClose,
  onSaved,
}: {
  viewingBrand: Brand
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [femi9Enabled, setFemi9Enabled] = useState(true)
  const [femi9Role, setFemi9Role] = useState<Role>('content_manager')
  const [lumi9Enabled, setLumi9Enabled] = useState(false)
  const [lumi9Role, setLumi9Role] = useState<Role>('content_manager')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit =
    email.trim() && name.trim() && password.length >= 12 && (femi9Enabled || lumi9Enabled)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    const memberships: Membership[] = []
    if (femi9Enabled) memberships.push({ brand: 'femi9', role: femi9Role })
    if (lumi9Enabled) memberships.push({ brand: 'lumi9', role: lumi9Role })
    try {
      const res = await fetch(`/${viewingBrand}/api/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, memberships }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(body.error || 'Could not invite.')
        return
      }
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Invite admin" onClose={onClose}>
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

        <div className="adm-field">
          <span className="adm-label">Access</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
            <BrandRolePicker
              brand="femi9"
              enabled={femi9Enabled}
              role={femi9Role}
              onEnabledChange={setFemi9Enabled}
              onRoleChange={setFemi9Role}
              disabled={busy}
            />
            <BrandRolePicker
              brand="lumi9"
              enabled={lumi9Enabled}
              role={lumi9Role}
              onEnabledChange={setLumi9Enabled}
              onRoleChange={setLumi9Role}
              disabled={busy}
            />
          </div>
          {!femi9Enabled && !lumi9Enabled && (
            <span className="adm-help" style={{ color: '#B23D3D' }}>
              Select at least one brand.
            </span>
          )}
        </div>

        {err && (
          <div className="adm-auth-error"><span className="adm-error">{err}</span></div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={busy || !canSubmit}>
            {busy ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─────────────────────────────── Edit access modal ─────────────────────────

function EditAccessModal({
  viewingBrand,
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  viewingBrand: Brand
  user: Row
  isSelf: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const initialFemi9 = user.memberships.find((m) => m.brand === 'femi9')
  const initialLumi9 = user.memberships.find((m) => m.brand === 'lumi9')
  const [femi9Enabled, setFemi9Enabled] = useState(Boolean(initialFemi9))
  const [femi9Role, setFemi9Role] = useState<Role>(initialFemi9?.role ?? 'content_manager')
  const [lumi9Enabled, setLumi9Enabled] = useState(Boolean(initialLumi9))
  const [lumi9Role, setLumi9Role] = useState<Role>(initialLumi9?.role ?? 'content_manager')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const memberships: Membership[] = []
    if (femi9Enabled) memberships.push({ brand: 'femi9', role: femi9Role })
    if (lumi9Enabled) memberships.push({ brand: 'lumi9', role: lumi9Role })
    if (memberships.length === 0) {
      setErr('Select at least one brand. To remove all access, deactivate the account instead.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/${viewingBrand}/api/admin-users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberships }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErr(body.error || 'Could not update.')
        return
      }
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Edit access — ${user.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        {isSelf && (
          <p className="adm-help" style={{ marginBottom: 12 }}>
            This is your own account. You cannot remove Super Admin from every
            brand — the system will refuse it.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <BrandRolePicker
            brand="femi9"
            enabled={femi9Enabled}
            role={femi9Role}
            onEnabledChange={setFemi9Enabled}
            onRoleChange={setFemi9Role}
            disabled={busy}
          />
          <BrandRolePicker
            brand="lumi9"
            enabled={lumi9Enabled}
            role={lumi9Role}
            onEnabledChange={setLumi9Enabled}
            onRoleChange={setLumi9Role}
            disabled={busy}
          />
        </div>
        {err && (
          <div className="adm-auth-error" style={{ marginTop: 12 }}>
            <span className="adm-error">{err}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save access'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─────────────────────────────── Building blocks ───────────────────────────

function BrandRolePicker({
  brand,
  enabled,
  role,
  onEnabledChange,
  onRoleChange,
  disabled,
}: {
  brand: Brand
  enabled: boolean
  role: Role
  onEnabledChange: (v: boolean) => void
  onRoleChange: (v: Role) => void
  disabled?: boolean
}) {
  const meta = BRAND_META[brand]
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: '10px 14px',
        background: enabled ? meta.tint : 'var(--surface)',
        transition: 'background 0.15s ease',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          fontWeight: 600,
          color: enabled ? meta.color : 'var(--ink)',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
          disabled={disabled}
        />
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color }} />
        {meta.label}
      </label>
      {enabled && (
        <div style={{ marginTop: 8 }}>
          <select
            className="adm-select"
            value={role}
            onChange={(e) => onRoleChange(e.target.value as Role)}
            disabled={disabled}
            style={{ width: '100%' }}
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} title={o.hint}>
                {o.label}
              </option>
            ))}
          </select>
          <div className="adm-help" style={{ fontSize: 11.5, marginTop: 4 }}>
            {ROLE_OPTIONS.find((o) => o.value === role)?.hint}
          </div>
        </div>
      )}
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(30, 22, 48, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 12,
          padding: '24px 28px',
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(30,22,48,0.3)',
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--serif)',
            fontWeight: 500,
            fontSize: 22,
            margin: '0 0 16px',
          }}
        >
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
