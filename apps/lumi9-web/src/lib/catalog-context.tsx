'use client'

import { createContext, useContext, useMemo } from 'react'
import type { CatalogPayload, DbProductSize } from './catalog.server'
import type { SizeCode } from './catalog'
import { boundsFromCatalog, type SizeBound } from './size-projection'

/**
 * The catalogue, delivered to client components.
 *
 * Twelve client components used to import `SIZES` straight from
 * `lib/catalog.ts` - fine while the catalogue was a hardcoded module, impossible
 * once it lives in the database, because a client component cannot query one.
 *
 * The root layout is a server component: it loads the catalogue once per request
 * and hands it down through here, so the whole page still renders from a single
 * query and no component needs a prop threaded through its ancestors.
 */

export type Catalog = DbProductSize[]

const CatalogContext = createContext<CatalogPayload | null>(null)

export function CatalogProvider({
  catalog,
  children,
}: {
  catalog: CatalogPayload
  children: React.ReactNode
}) {
  return <CatalogContext.Provider value={catalog}>{children}</CatalogContext.Provider>
}

export interface CatalogData {
  /** Every size, in run order (NB → XL). */
  sizes: Catalog
  /** The weight chips on the size finder and size guide, derived from the data. */
  weightOptions: { label: string; size: SizeCode }[]
  /**
   * The same bands as NUMBERS, for the parenting tools' size maths.
   *
   * `SIZE_BOUNDS` in `size-projection.ts` used to be the only copy and carried a
   * comment saying it had to be kept in step with the catalogue by hand. It was
   * not — an admin renaming "7-12 kg" moved what a parent read and never what
   * the projector computed. This rides along on the payload for the same reason
   * `subscribeSavePct` does: the client must not hold a second copy of a number
   * the console owns.
   */
  sizeBounds: SizeBound[]
  /** One size, or undefined. Case-insensitive, so `/product/m` works. */
  getSize: (code: string | null | undefined) => DbProductSize | undefined
  /** One size with a fallback, so a view never renders empty on a bad param. */
  getSizeOrDefault: (code: string | null | undefined, fallback?: SizeCode) => DbProductSize
  /**
   * The subscription discount, as a percentage, from Settings - the SAME value
   * `generateDueOrders()` discounts a renewal by. Not a constant: the page used
   * to promise 20% from a hardcoded module while renewals applied the console's
   * 15% default.
   */
  subscribeSavePct: number
}

/**
 * The catalogue and the helpers that read it.
 *
 * Deliberately ONE hook returning plain functions rather than a hook per
 * lookup: `getSize` is called inside event handlers and `useMemo` bodies, where
 * a hook cannot go. Returning closures keeps every existing call site intact.
 *
 * Throws when the provider is missing. An empty catalogue and an unwrapped tree
 * look identical on the page - a shop with no products - and one of them is a
 * bug that should be loud.
 */
export function useCatalogData(): CatalogData {
  const payload = useContext(CatalogContext)
  if (payload === null) {
    throw new Error('useCatalogData must be used inside <CatalogProvider>')
  }
  const { sizes, subscribeSavePct } = payload

  return useMemo(() => {
    const getSize = (code: string | null | undefined) => {
      if (!code) return undefined
      const wanted = code.toUpperCase()
      return sizes.find((s) => s.size === wanted)
    }
    return {
      sizes,
      subscribeSavePct,
      weightOptions: sizes.map((s) => ({ label: s.fits, size: s.size })),
      sizeBounds: boundsFromCatalog(sizes),
      getSize,
      getSizeOrDefault: (code: string | null | undefined, fallback: SizeCode = 'M') => {
        // Falls through to the first size rather than a hardcoded 'M', which
        // would throw if that size were ever discontinued.
        const found = getSize(code) ?? sizes.find((s) => s.size === fallback) ?? sizes[0]
        if (!found) throw new Error('The catalogue is empty - nothing can be rendered.')
        return found
      },
    }
  }, [sizes, subscribeSavePct])
}
