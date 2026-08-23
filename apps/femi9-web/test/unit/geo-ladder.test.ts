import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The resolution ladder in `detectGeoReading` — the part that decides whether a
 * viewer's location is trusted enough to set a price.
 *
 * This is the whole point of the exercise: regional pricing worked over WiFi and
 * misfired on Jio/Airtel, because a CGNAT'd IPv4 address resolves to the
 * carrier's gateway rather than to the shopper. None of these paths are
 * reachable without a CloudFront distribution, a GeoLite2 database and a mobile
 * viewer at once, so the tiers and the gate between them are only ever exercised
 * here.
 *
 * Every collaborator is mocked: the databases are optional at runtime by design,
 * and the tests must pin the ladder's *decisions*, not MaxMind's data.
 */

const headerBag = { current: new Headers() }

vi.mock('next/headers', () => ({ headers: async () => headerBag.current }))

const lookupAsn = vi.fn()
const lookupCity = vi.fn()
const lookupCircle = vi.fn()

vi.mock('@femi9/core/geo/mmdb', () => ({
  lookupAsn: (...args: unknown[]) => lookupAsn(...args),
  lookupCity: (...args: unknown[]) => lookupCity(...args),
}))
// Mocked so the circle table never reaches Prisma from a unit test.
vi.mock('@femi9/core/geo/circles', () => ({
  lookupCircle: (...args: unknown[]) => lookupCircle(...args),
}))

const { detectGeoReading, detectGeoSignal } = await import('@femi9/core/geo/detect')

/** A Jio-shaped viewer: mobile ASN, CGNAT'd IPv4, placed in the wrong state. */
const JIO = { number: 55836, organization: 'Reliance Jio Infocomm Limited' }

function request(headers: Record<string, string>) {
  headerBag.current = new Headers(headers)
}

beforeEach(() => {
  lookupAsn.mockReset().mockResolvedValue(null)
  lookupCity.mockReset().mockResolvedValue(null)
  lookupCircle.mockReset().mockResolvedValue(null)
  headerBag.current = new Headers()
})

describe('the mobile-carrier gate', () => {
  it('discards the edge answer for a CGNAT-ed IPv4 viewer', async () => {
    // The exact production bug: CloudFront resolves Jio's Mumbai gateway and
    // reports Maharashtra for a shopper who is in Coimbatore.
    lookupAsn.mockResolvedValue(JIO)
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '49.207.200.10:52001',
      'cloudfront-viewer-country-region': 'MH',
      'cloudfront-viewer-country-region-name': 'Maharashtra',
    })

    const reading = await detectGeoReading('femi9')
    expect(reading.signal).toEqual({})
    expect(reading.detail.rejected).toBe('mobile-carrier-cgnat')
    expect(reading.detail.carrier).toBe('mobile')
    // Not usable ⇒ the price resolver falls back to the default zone, i.e. the
    // standard price. Being wrong here can now OVERCHARGE, since a zone may set
    // an exact price above standard.
    expect(await detectGeoSignal('femi9')).toEqual({})
  })

  it('leaves fixed-line viewers exactly as they were before', async () => {
    // Regression guard: broadband is the population regional pricing already
    // worked for, and none of this may disturb it.
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '49.205.1.1',
      'cloudfront-viewer-country-region': 'TN',
      'cloudfront-viewer-country-region-name': 'Tamil Nadu',
      'cloudfront-viewer-postal-code': '641001',
    })

    const reading = await detectGeoReading('femi9')
    expect(reading.source).toBe('edge-header')
    expect(reading.signal).toEqual({ state: 'Tamil Nadu', pincode: '641001' })
    expect(await detectGeoSignal('femi9')).toEqual({ state: 'Tamil Nadu', pincode: '641001' })
  })

  it('stays open when nothing identifies the network', async () => {
    // With no GeoLite2 database and no CloudFront ASN header there is no gate to
    // apply. Failing closed here would gate every viewer and switch regional
    // pricing off entirely.
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-country-region': 'KL',
    })
    expect((await detectGeoReading('femi9')).signal).toEqual({ state: 'Kerala', pincode: undefined })
  })

  it('reads the ASN from the CloudFront header when the database is absent', async () => {
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-asn': '55836',
      'cloudfront-viewer-address': '49.207.200.10',
      'cloudfront-viewer-country-region': 'MH',
    })
    const reading = await detectGeoReading('femi9')
    expect(reading.detail.asn).toBe(55836)
    expect(reading.detail.rejected).toBe('mobile-carrier-cgnat')
  })
})

describe('the IPv6 tiers — what actually fixes mobile data', () => {
  it('trusts a learned circle prefix even on a mobile carrier', async () => {
    // Carriers do not NAT IPv6, and its prefixes are allocated per telecom
    // circle. Same Jio subscriber as the first test, arriving over IPv6.
    lookupAsn.mockResolvedValue(JIO)
    lookupCircle.mockResolvedValue({
      circle: 'karnataka',
      state: 'Karnataka',
      prefix: '24050201/32',
      observations: 240,
    })
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '[2405:201:1234:5678::1]:52001',
      'cloudfront-viewer-country-region': 'MH', // the CGNAT lie, outranked
    })

    const reading = await detectGeoReading('femi9')
    expect(reading.source).toBe('ipv6-circle')
    expect(reading.confidence).toBe('high')
    expect(reading.signal).toEqual({ state: 'Karnataka' })
    expect(reading.detail.circle).toBe('karnataka')
  })

  it('falls through a circle that spans several states rather than picking one', async () => {
    lookupAsn.mockResolvedValue(JIO)
    // The Andhra Pradesh circle still covers Telangana; `state` is undefined.
    lookupCircle.mockResolvedValue({
      circle: 'andhra-pradesh',
      state: undefined,
      prefix: '24050201/32',
      observations: 300,
    })
    lookupCity.mockResolvedValue({
      country: 'IN',
      regionCode: 'TG',
      accuracyRadiusKm: 50,
    })
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '2405:201:1234::1',
    })

    const reading = await detectGeoReading('femi9')
    expect(reading.source).toBe('ipv6-city')
    expect(reading.signal.state).toBe('Telangana')
    expect(reading.detail.circle).toBe('andhra-pradesh')
  })

  it('gates a v6 city record the database itself calls coarse', async () => {
    lookupAsn.mockResolvedValue(JIO)
    // GeoLite2 routinely returns a 1000km radius for Indian mobile — that record
    // means "somewhere in India", and its centroid sits near Nagpur. Reading a
    // state off it would price the whole unplaceable population as Maharashtra.
    lookupCity.mockResolvedValue({ country: 'IN', regionCode: 'MH', accuracyRadiusKm: 1000 })
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '2405:201:1234::1',
      'cloudfront-viewer-country-region': 'MH',
    })

    const reading = await detectGeoReading('femi9')
    expect(reading.signal).toEqual({})
    // The v6 tier is refused for being coarse, then the gate rejects the v4
    // fallback — the carrier reason is the one that ends the ladder.
    expect(reading.detail.rejected).toBe('mobile-carrier-cgnat')
    expect(reading.detail.accuracyRadiusKm).toBe(1000)
  })

  it('ignores a private v6 address', async () => {
    request({ 'cloudfront-viewer-country': 'IN', 'cloudfront-viewer-address': '[fd00::1]:443' })
    await detectGeoReading('femi9')
    expect(lookupCircle).not.toHaveBeenCalled()
    expect(lookupAsn).not.toHaveBeenCalled()
  })
})

describe('the language veto', () => {
  it('drops a medium-confidence state the browser contradicts', async () => {
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '49.205.1.1',
      'cloudfront-viewer-country-region': 'MH',
      'accept-language': 'en-IN,ta;q=0.9,en;q=0.8',
    })

    const reading = await detectGeoReading('femi9')
    expect(reading.signal).toEqual({})
    expect(reading.detail.rejected).toBe('language-contradiction')
    expect(reading.detail.language).toBe('ta')
  })

  it('does not overturn a high-confidence circle match', async () => {
    // A Tamil-speaking family in Pune must not lose a zone backed by hundreds of
    // confirmed deliveries because of their browser locale.
    lookupCircle.mockResolvedValue({
      circle: 'mumbai',
      state: 'Maharashtra',
      prefix: '24050201/32',
      observations: 500,
    })
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '2405:201:1::1',
      'accept-language': 'ta-IN,ta;q=0.9',
    })
    expect((await detectGeoReading('femi9')).signal).toEqual({ state: 'Maharashtra' })
  })

  it('stays quiet for a language that spans many states', async () => {
    request({
      'cloudfront-viewer-country': 'IN',
      'cloudfront-viewer-address': '49.205.1.1',
      'cloudfront-viewer-country-region': 'MH',
      'accept-language': 'hi-IN,hi;q=0.9,en;q=0.8',
    })
    expect((await detectGeoReading('femi9')).signal).toEqual({ state: 'Maharashtra', pincode: undefined })
  })
})

describe('country scoping and overrides', () => {
  it('refuses a viewer the edge places outside India', async () => {
    request({ 'cloudfront-viewer-country': 'US', 'cloudfront-viewer-country-region': 'CA' })
    expect((await detectGeoReading('femi9')).detail.rejected).toBe('outside-india')
  })

  it('lets the offline database veto the country when the CDN header is missing', async () => {
    // A direct-to-ALB hit, or a distribution whose origin request policy has
    // drifted. Without this the region below would be read as an Indian state.
    lookupCity.mockResolvedValue({ country: 'SG', regionCode: 'TN', accuracyRadiusKm: 10 })
    request({ 'cloudfront-viewer-address': '203.0.113.9', 'cloudfront-viewer-country-region': 'TN' })
    expect((await detectGeoReading('femi9')).detail.rejected).toBe('outside-india')
  })

  it('honours the dev override outside production', async () => {
    request({ 'x-femi9-geo-state': 'Kerala', 'x-femi9-geo-pincode': '682001' })
    const reading = await detectGeoReading('femi9')
    expect(reading.source).toBe('dev-header')
    expect(reading.signal).toEqual({ state: 'Kerala', pincode: '682001' })
  })
})
