'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
// Type-only import: erased at compile time, so this client bundle never pulls in
// the `server-only` inventory service at runtime.
import type { InventoryRow } from '@/lib/services/admin/inventory'

/**
 * Inventory — stock management per variant.
 *
 * This page is a client component (not a server component that calls the service
 * directly) because the whole surface is interactive: stock is edited inline
 * with optimistic updates. It loads the list from GET /api/admin/inventory on
 * mount and PATCHes individual variants as they're edited.
 */

// Mirrors LOW_STOCK_THRESHOLD in the service. Duplicated here rather than
// imported because the service is `server-only`; the row's own `lowStock` flag
// is authoritative for display, this is only for the client-side summary math.
const LOW_STOCK = 40

const rupees = (n: number): string => 'Rs.' + n.toLocaleString('en-IN')

interface ProductGroup {
  productId: string
  name: string
  slug: string
  type: 'pad' | 'panty'
  rows: InventoryRow[]
}

export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  // Latest rows without re-binding callbacks — used to compute `delta` optimism
  // and per-row revert snapshots without stale closures.
  const rowsRef = useRef(rows)
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const res = await fetch('/api/admin/inventory', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { rows: InventoryRow[] }
      setRows(data.rows)
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3800)
    return () => clearTimeout(t)
  }, [toast])

  const setPendingFor = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  /**
   * Commit a stock change with optimistic UI: update the row immediately, PATCH,
   * then reconcile with the server's authoritative row — or revert just that row
   * (not the whole table) and surface a toast on failure.
   */
  const commit = useCallback(
    async (variantId: string, body: { stock: number } | { delta: number }) => {
      const snapshot = rowsRef.current.find((r) => r.variantId === variantId)
      if (!snapshot) return

      const optimisticStock =
        'stock' in body ? body.stock : Math.max(0, snapshot.stock + body.delta)

      // No-op guard: absolute set to the same value skips the round-trip.
      if ('stock' in body && optimisticStock === snapshot.stock) return

      setRows((rs) =>
        rs.map((r) =>
          r.variantId === variantId
            ? { ...r, stock: optimisticStock, lowStock: optimisticStock < LOW_STOCK }
            : r,
        ),
      )
      setPendingFor(variantId, true)

      try {
        const res = await fetch(`/api/admin/inventory/${variantId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const msg = (await res.json().catch(() => null))?.error as string | undefined
          throw new Error(msg || 'Update failed')
        }
        const { row } = (await res.json()) as { row: InventoryRow }
        setRows((rs) => rs.map((r) => (r.variantId === variantId ? row : r)))
      } catch (err) {
        // Revert only this row to its pre-edit value.
        setRows((rs) => rs.map((r) => (r.variantId === variantId ? snapshot : r)))
        setToast(
          `Couldn't update ${snapshot.productName} · ${snapshot.label} - ${
            err instanceof Error ? err.message : 'try again'
          }`,
        )
      } finally {
        setPendingFor(variantId, false)
      }
    },
    [setPendingFor],
  )

  // Group by product, preserving the service's (product name, price) ordering.
  const groups = useMemo<ProductGroup[]>(() => {
    const map = new Map<string, ProductGroup>()
    for (const r of rows) {
      let g = map.get(r.productId)
      if (!g) {
        g = { productId: r.productId, name: r.productName, slug: r.productSlug, type: r.productType, rows: [] }
        map.set(r.productId, g)
      }
      g.rows.push(r)
    }
    return [...map.values()]
  }, [rows])

  const totalSkus = rows.length
  const lowCount = rows.filter((r) => r.lowStock).length
  const outCount = rows.filter((r) => r.stock === 0).length

  return (
    <>
      <div className="adm-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2
            style={{
              fontFamily: 'var(--serif)',
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Inventory
          </h2>
          {!loading && !loadError && (
            <>
              <span className="adm-chip">{totalSkus} SKUs</span>
              <span className={'adm-badge' + (lowCount ? ' adm-badge--amber' : ' adm-badge--gray')}>
                {lowCount} low stock
              </span>
              <span className={'adm-badge' + (outCount ? ' adm-badge--red' : ' adm-badge--gray')}>
                {outCount} out of stock
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          className="adm-btn adm-btn--secondary adm-btn--sm"
          onClick={load}
          disabled={loading}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Loading inventory…</div>
        </div>
      ) : loadError ? (
        <div className="adm-empty">
          <div className="adm-empty-title">Couldn&rsquo;t load inventory</div>
          <p>The stock list failed to load.</p>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--sm" onClick={load}>
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="adm-empty">
          <div className="adm-empty-title">No variants yet</div>
          <p>Add products with variants to start tracking stock.</p>
        </div>
      ) : (
        <div className="adm-table-wrap">
          {/* --stack: below 900px each variant becomes a labelled block, so the
              Stock stepper is not 420px off-screen inside the scroller. */}
          <table className="adm-table adm-table--stack">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Product / Variant</th>
                <th>SKU</th>
                <th className="adm-td-num">Price</th>
                <th style={{ width: 200, textAlign: 'right' }}>Stock</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const onHand = g.rows.reduce((n, r) => n + r.stock, 0)
                return (
                  <GroupRows
                    key={g.productId}
                    group={g}
                    onHand={onHand}
                    pending={pending}
                    onSet={(id, stock) => commit(id, { stock })}
                    onAdjust={(id, delta) => commit(id, { delta })}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {toast && (
        <div className="adm-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  )
}

/** A product's header row followed by one editable row per variant. */
function GroupRows({
  group,
  onHand,
  pending,
  onSet,
  onAdjust,
}: {
  group: ProductGroup
  onHand: number
  pending: Set<string>
  onSet: (variantId: string, stock: number) => void
  onAdjust: (variantId: string, delta: number) => void
}) {
  return (
    <>
      <tr>
        <td
          colSpan={5}
          style={{ background: 'var(--plum-tint)', padding: '9px 16px' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontWeight: 600 }}>{group.name}</strong>
            <span className="adm-badge adm-badge--plum">{group.type}</span>
            <span className="adm-cell-muted" style={{ fontSize: 12 }}>
              {group.rows.length} {group.rows.length === 1 ? 'variant' : 'variants'} ·{' '}
              {onHand.toLocaleString('en-IN')} on hand
            </span>
          </span>
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.variantId}>
          <td data-label="Variant" style={{ paddingLeft: 28 }}>{r.label}</td>
          <td data-label="SKU" className="adm-cell-muted">{r.sku ?? '-'}</td>
          <td data-label="Price" className="adm-td-num">{rupees(r.price)}</td>
          <td data-label="Stock" className="adm-td-num">
            <StockEditor
              row={r}
              busy={pending.has(r.variantId)}
              onSet={(stock) => onSet(r.variantId, stock)}
              onAdjust={(delta) => onAdjust(r.variantId, delta)}
            />
          </td>
          <td data-label="Status">
            <StatusBadge row={r} />
          </td>
        </tr>
      ))}
    </>
  )
}

/** Inline stepper + editable number, right-aligned in the numeric cell. */
function StockEditor({
  row,
  busy,
  onSet,
  onAdjust,
}: {
  row: InventoryRow
  busy: boolean
  onSet: (stock: number) => void
  onAdjust: (delta: number) => void
}) {
  const [draft, setDraft] = useState(String(row.stock))
  const [editing, setEditing] = useState(false)

  // Keep the field in sync with server-reconciled values, but don't clobber what
  // the user is actively typing.
  useEffect(() => {
    if (!editing) setDraft(String(row.stock))
  }, [row.stock, editing])

  const commitDraft = () => {
    setEditing(false)
    const parsed = Math.max(0, Math.trunc(Number(draft)))
    if (!Number.isFinite(parsed)) {
      setDraft(String(row.stock))
      return
    }
    if (parsed !== row.stock) onSet(parsed)
    else setDraft(String(row.stock))
  }

  return (
    <span className="adm-stock-editor" aria-busy={busy}>
      <button
        type="button"
        className="adm-btn adm-btn--secondary adm-btn--sm adm-stepper-btn"
        style={{ opacity: busy ? 0.6 : 1 }}
        aria-label={`Decrease ${row.label} stock`}
        onClick={() => onAdjust(-1)}
        disabled={busy || row.stock <= 0}
      >
        −
      </button>
      <input
        className="adm-input adm-stepper-input"
        style={{ textAlign: 'right' }}
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        aria-label={`${row.productName} ${row.label} stock`}
        onFocus={(e) => {
          setEditing(true)
          e.currentTarget.select()
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commitDraft}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          else if (e.key === 'Escape') {
            setDraft(String(row.stock))
            setEditing(false)
            e.currentTarget.blur()
          }
        }}
      />
      <button
        type="button"
        className="adm-btn adm-btn--secondary adm-btn--sm adm-stepper-btn"
        style={{ opacity: busy ? 0.6 : 1 }}
        aria-label={`Increase ${row.label} stock`}
        onClick={() => onAdjust(1)}
        disabled={busy}
      >
        +
      </button>
    </span>
  )
}

/** Derives a status pill from stock + active. */
function StatusBadge({ row }: { row: InventoryRow }) {
  if (!row.active) return <span className="adm-badge adm-badge--gray">Inactive</span>
  if (row.stock === 0) return <span className="adm-badge adm-badge--red">Out of stock</span>
  if (row.lowStock) return <span className="adm-badge adm-badge--amber">Low stock</span>
  return <span className="adm-badge adm-badge--green">In stock</span>
}
