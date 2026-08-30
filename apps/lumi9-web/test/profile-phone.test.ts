import { afterEach, describe, expect, it } from 'vitest'
import { missingProfileFields, profilePhoneRequired } from '@femi9/core/services/account'

/**
 * `/welcome` stops a freshly signed-in shopper for whatever the sign-in did not
 * supply. Google and the emailed link never carry a phone number, so with the
 * requirement ON that screen is a second step, an OTP round trip and an SMS bill
 * between somebody who has just signed in and the account she was trying to
 * reach — on a brand (Lumi9) whose task is not even given an MSG91 template, so
 * the code it asks for cannot be delivered.
 *
 * The switch is env, and it is deliberately asymmetric: UNSET means REQUIRED, and
 * only the exact string "false" turns it off. That column is where a parcel and
 * every delivery SMS are addressed, so a typo must not quietly stop collecting it
 * — the same convention `auth-methods.ts` uses for the sign-in kill switches.
 *
 * These cases are the contract. `missingProfileFields` is the ONE definition of
 * "complete" that /welcome, the /account gate, /api/auth/me and the OTP verify
 * response all read, so a regression here silently changes four surfaces at once.
 */

const SIGNED_IN_VIA_GOOGLE = { name: 'Aarthi K.', email: 'aarthi@example.com', phone: null }

afterEach(() => {
  delete process.env.REQUIRE_PROFILE_PHONE
})

describe('profilePhoneRequired', () => {
  it('is required when the variable is unset — Femi9 has always behaved this way', () => {
    expect(profilePhoneRequired()).toBe(true)
    expect(missingProfileFields(SIGNED_IN_VIA_GOOGLE)).toEqual(['phone'])
  })

  it('is off for exactly "false", which is what Lumi9 sets', () => {
    process.env.REQUIRE_PROFILE_PHONE = 'false'
    expect(profilePhoneRequired()).toBe(false)
    // Nothing missing → /welcome redirects straight through to /account.
    expect(missingProfileFields(SIGNED_IN_VIA_GOOGLE)).toEqual([])
  })

  it.each(['False', 'FALSE', '0', 'no', 'off', '', ' false '])(
    'stays required for %o — only the exact string disables it',
    (value) => {
      process.env.REQUIRE_PROFILE_PHONE = value
      expect(profilePhoneRequired()).toBe(true)
      expect(missingProfileFields(SIGNED_IN_VIA_GOOGLE)).toEqual(['phone'])
    },
  )

  it('never masks a missing name or email', () => {
    process.env.REQUIRE_PROFILE_PHONE = 'false'
    expect(missingProfileFields({ name: null, email: null, phone: null })).toEqual(['name', 'email'])
    // A whitespace-only name is not a name.
    expect(missingProfileFields({ name: '   ', email: 'a@b.co', phone: null })).toEqual(['name'])
  })

  it('reports nothing missing for a complete profile either way', () => {
    const complete = { name: 'Aarthi K.', email: 'a@b.co', phone: '9884230571' }
    expect(missingProfileFields(complete)).toEqual([])
    process.env.REQUIRE_PROFILE_PHONE = 'false'
    expect(missingProfileFields(complete)).toEqual([])
  })
})
