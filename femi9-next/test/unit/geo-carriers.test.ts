import { describe, it, expect, afterEach } from 'vitest'
import { classifyCarrier } from '@/lib/geo/carriers'

/**
 * The carrier gate is the piece that decides whether a viewer's region answer is
 * used or thrown away, so both directions are load-bearing: a false negative
 * prices a Coimbatore shopper as if she were in Mumbai, while a false positive
 * silently costs a broadband shopper her zone discount.
 */
describe('classifyCarrier', () => {
  const original = process.env.GEOIP_MOBILE_ASNS
  afterEach(() => {
    if (original === undefined) delete process.env.GEOIP_MOBILE_ASNS
    else process.env.GEOIP_MOBILE_ASNS = original
  })

  it('recognises the known mobile ASNs', () => {
    expect(classifyCarrier(55836, 'Reliance Jio Infocomm Limited')).toMatchObject({
      kind: 'mobile',
      via: 'asn',
    })
    expect(classifyCarrier(45609)).toMatchObject({ kind: 'mobile', via: 'asn' })
  })

  it('treats carriers that run fixed AND mobile on one ASN as untrusted', () => {
    // Airtel's AS24560 fronts Xstream broadband alongside mobile and nothing in
    // GeoLite2 separates them. Distrusting costs a discount; trusting can charge
    // the wrong price — so it is tagged, not exempted.
    expect(classifyCarrier(24560, 'Bharti Airtel Ltd')).toMatchObject({ kind: 'mixed', via: 'asn' })
    expect(classifyCarrier(9829, 'National Internet Backbone')).toMatchObject({ kind: 'mixed' })
  })

  it('falls back to the organisation name when the ASN is unlisted', () => {
    // The safety net for reassigned or never-enumerated ASNs. It reports `mixed`
    // rather than `mobile`: we know it is a telco, not that this ASN is mobile.
    expect(classifyCarrier(999999, 'Reliance Jio Infocomm Limited')).toMatchObject({
      kind: 'mixed',
      via: 'organization',
    })
    expect(classifyCarrier(undefined, 'Vodafone Idea Limited')).toMatchObject({
      via: 'organization',
    })
  })

  it('leaves ordinary fixed-line access alone', () => {
    expect(classifyCarrier(133694, 'Atria Convergence Technologies')).toBeNull()
    expect(classifyCarrier(17488, 'Hathway IP Over Cable')).toBeNull()
    expect(classifyCarrier(24309, 'Atria Convergence Technologies Pvt Ltd')).toBeNull()
    // Nothing known at all must not read as "carrier" — with no ASN database and
    // no CloudFront ASN header the gate has to stay open, or every viewer would
    // be gated and regional pricing would stop working entirely.
    expect(classifyCarrier(undefined, undefined)).toBeNull()
    expect(classifyCarrier(null, null)).toBeNull()
  })

  it('honours the GEOIP_MOBILE_ASNS override so ops can gate without a deploy', () => {
    expect(classifyCarrier(64049, 'Some Newly Split Jio AS')).toMatchObject({ kind: 'mixed' })
    process.env.GEOIP_MOBILE_ASNS = '64049, 12345'
    expect(classifyCarrier(64049, 'Some Newly Split Jio AS')).toMatchObject({
      kind: 'mobile',
      via: 'env',
    })
    expect(classifyCarrier(12345, 'Anything')).toMatchObject({ kind: 'mobile', via: 'env' })
  })
})
