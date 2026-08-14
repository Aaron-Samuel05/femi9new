import { describe, it, expect, vi } from 'vitest'

/**
 * `detectGeoSignal` imports `next/headers`, which is not loadable outside a Next
 * server; the mock only has to exist for the module to import.
 */
vi.mock('next/headers', () => ({ headers: () => ({ get: () => null }) }))

import { toIndiaState } from '@/lib/geo/detect'

/**
 * The region-code map is the one piece of regional pricing that cannot be
 * exercised without a CloudFront distribution in front of the app, and it fails
 * silently: an unrecognised code just means "location unknown", which reads
 * exactly like a visitor outside India and quietly costs her the discount.
 */
describe('CloudFront region → state mapping', () => {
  it('prefers the spelled region name when CloudFront sends one', () => {
    expect(toIndiaState('TN', 'Tamil Nadu')).toBe('Tamil Nadu')
    // Case and padding vary between edge locations.
    expect(toIndiaState(null, '  tamil nadu  ')).toBe('Tamil Nadu')
  })

  it('falls back to the ISO 3166-2:IN code when only the code is sent', () => {
    expect(toIndiaState('TN')).toBe('Tamil Nadu')
    expect(toIndiaState('ka')).toBe('Karnataka')
    expect(toIndiaState('PY')).toBe('Puducherry')
    expect(toIndiaState('CT')).toBe('Chhattisgarh')
  })

  it('accepts the alternate codes geo providers disagree on', () => {
    // Odisha is OR in ISO but OD in several datasets.
    expect(toIndiaState('OD')).toBe('Odisha')
    expect(toIndiaState('OR')).toBe('Odisha')
    // The 2020 UT merger: DH now, DN/DD in older data.
    expect(toIndiaState('DN')).toBe('Dadra and Nagar Haveli and Daman and Diu')
    expect(toIndiaState('DH')).toBe('Dadra and Nagar Haveli and Daman and Diu')
    // Telangana is TG in ISO, TS in Indian government usage.
    expect(toIndiaState('TS')).toBe('Telangana')
  })

  it('maps every code it returns onto a name the admin editor can attach', async () => {
    const { INDIA_STATES } = await import('@/lib/geo/india-states')
    const canonical = new Set<string>(INDIA_STATES)
    for (const code of ['AN', 'DL', 'JK', 'LA', 'UT', 'WB', 'MH', 'UP']) {
      const state = toIndiaState(code)
      expect(state, `code ${code}`).toBeDefined()
      // A state name that is not in INDIA_STATES can never match a ZoneRegion
      // row, so a typo here would silently disable the zone for that state.
      expect(canonical.has(state!), `${code} → ${state}`).toBe(true)
    }
  })

  it('returns undefined rather than guessing on an unknown region', () => {
    expect(toIndiaState('ZZ')).toBeUndefined()
    expect(toIndiaState(null, 'Île-de-France')).toBeUndefined()
    expect(toIndiaState(undefined, undefined)).toBeUndefined()
  })
})
