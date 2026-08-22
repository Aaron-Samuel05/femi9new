import { describe, it, expect } from 'vitest'
import { TELECOM_CIRCLES, circleState, isTelecomCircle } from '@/lib/geo/circles'
import { INDIA_STATES } from '@/lib/geo/india-states'

/**
 * The circle map is public fact, but it is fact with sharp edges: several
 * circles predate state reorganisations and still span two states. Resolving one
 * of those to "the bigger half" would price a Telangana shopper as if she were in
 * Andhra Pradesh, so the ambiguity has to survive into the type rather than be
 * papered over.
 */
describe('telecom circles', () => {
  it('covers all 22 licensed service areas', () => {
    expect(Object.keys(TELECOM_CIRCLES)).toHaveLength(22)
  })

  it('names only states the pricing zones can actually match', () => {
    // A name that is not in INDIA_STATES can never match a ZoneRegion row, so a
    // typo here would silently disable the circle tier for that state.
    const canonical = new Set<string>(INDIA_STATES)
    for (const [circle, states] of Object.entries(TELECOM_CIRCLES)) {
      expect(states.length, `${circle} has no states`).toBeGreaterThan(0)
      for (const state of states) {
        expect(canonical.has(state), `${circle} → ${state}`).toBe(true)
      }
    }
  })

  it('resolves a state only from a circle that covers exactly one', () => {
    expect(circleState('tamil-nadu')).toBeUndefined() // spans Puducherry too
    expect(circleState('karnataka')).toBe('Karnataka')
    expect(circleState('kolkata')).toBe('West Bengal')
    expect(circleState('delhi')).toBe('Delhi')
    expect(circleState('rajasthan')).toBe('Rajasthan')
    expect(circleState('up-east')).toBe('Uttar Pradesh')
  })

  it('refuses to guess on the circles that straddle a state boundary', () => {
    // Each of these is a real historical artefact, not an oversight: the AP
    // circle predates the 2014 Telangana split, Maharashtra circle includes Goa
    // but not Mumbai, UP-West includes Uttarakhand, and North-East covers six
    // states at once. Half the map being unusable is the honest outcome.
    for (const circle of [
      'andhra-pradesh',
      'maharashtra',
      'up-west',
      'bihar',
      'madhya-pradesh',
      'west-bengal',
      'north-east',
    ]) {
      expect(circleState(circle), circle).toBeUndefined()
      expect(TELECOM_CIRCLES[circle]!.length, circle).toBeGreaterThan(1)
    }
  })

  it('rejects a circle name that is not one of the 22', () => {
    expect(isTelecomCircle('tamil-nadu')).toBe(true)
    expect(isTelecomCircle('chennai')).toBe(false) // merged into Tamil Nadu
    expect(isTelecomCircle('toString')).toBe(false) // prototype keys are not circles
    expect(circleState('nowhere')).toBeUndefined()
  })
})
