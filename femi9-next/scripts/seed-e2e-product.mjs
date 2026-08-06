#!/usr/bin/env node

/**
 * Idempotently create/update one active product through the real admin API.
 *
 * Local:
 *   E2E_BASE_URL=http://127.0.0.1:3000 npm run e2e:seed-product
 *
 * Production requires an explicit safety opt-in:
 *   ALLOW_PRODUCTION_SEED=true \
 *   E2E_BASE_URL=https://example.com \
 *   npm run e2e:seed-product
 *
 * ADMIN_EMAIL and ADMIN_PASSWORD are read from the environment. They are never
 * printed. The product slug and SKUs are stable, so reruns update instead of
 * creating duplicates.
 */

const baseUrl = (process.env.E2E_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '')
const adminEmail = process.env.ADMIN_EMAIL
const adminPassword = process.env.ADMIN_PASSWORD
const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl)

if (!isLocal && process.env.ALLOW_PRODUCTION_SEED !== 'true') {
  throw new Error(
    `Refusing to write to non-local URL ${baseUrl}. Set ALLOW_PRODUCTION_SEED=true to confirm.`,
  )
}
if (!adminEmail || !adminPassword) {
  throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.')
}

const PRODUCT_SLUG = 'e2e-test-pad'
const PRODUCT_NAME = 'Femi9 E2E Test Pad'

const desiredProduct = {
  name: PRODUCT_NAME,
  slug: PRODUCT_SLUG,
  type: 'pad',
  basePrice: 199,
  meta: '6 pads · 290mm',
  flow: 'Regular · Test',
  description: 'A clearly labelled test product for storefront, cart, and checkout verification.',
  longDescription:
    'This product is created by the Femi9 end-to-end seed script. It can be updated safely by rerunning the script.',
  tag: 'E2E Test',
  status: 'active',
  images: ['/assets/img/prod-290-large9.webp'],
  variants: [
    {
      kind: 'pack',
      label: '3 pcs',
      packCount: 3,
      size: null,
      price: 109,
      sku: 'E2E-PAD-3',
      stock: 100,
      active: true,
    },
    {
      kind: 'pack',
      label: '6 pcs',
      packCount: 6,
      size: null,
      price: 199,
      sku: 'E2E-PAD-6',
      stock: 100,
      active: true,
    },
  ],
}

class CookieJar {
  constructor() {
    this.cookies = new Map()
  }

  absorb(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';')
      const index = pair.indexOf('=')
      if (index < 1) continue
      const name = pair.slice(0, index).trim()
      const value = pair.slice(index + 1).trim()
      const expired = attrs.some((attr) => /^\s*max-age=0\s*$/i.test(attr))
      if (expired || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }

  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
  }
}

const jar = new CookieJar()

async function request(path, init = {}) {
  const headers = new Headers(init.headers)
  const cookie = jar.header()
  if (cookie) headers.set('cookie', cookie)
  const response = await fetch(baseUrl + path, { ...init, headers, redirect: 'manual' })
  jar.absorb(response)
  const text = await response.text()
  let body = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }
  return { response, body }
}

function assertStatus(actual, expected, label, body) {
  if (actual !== expected) {
    const detail = typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body)
    throw new Error(`${label}: expected HTTP ${expected}, got ${actual}. ${detail}`)
  }
}

async function main() {
  const login = await request('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  })
  assertStatus(login.response.status, 200, 'Admin login', login.body)

  const list = await request('/api/admin/products')
  assertStatus(list.response.status, 200, 'Admin product list', list.body)
  if (!Array.isArray(list.body)) throw new Error('Admin product list returned a non-array response.')

  const existing = list.body.find((product) => product.slug === PRODUCT_SLUG)
  let action
  let id

  if (existing) {
    const detail = await request(`/api/admin/products/${existing.id}`)
    assertStatus(detail.response.status, 200, 'Existing product detail', detail.body)

    const existingBySku = new Map(
      (detail.body.variants || []).filter((variant) => variant.sku).map((variant) => [variant.sku, variant]),
    )
    const payload = {
      ...desiredProduct,
      variants: desiredProduct.variants.map((variant) => ({
        ...variant,
        id: existingBySku.get(variant.sku)?.id,
      })),
    }
    const update = await request(`/api/admin/products/${existing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    assertStatus(update.response.status, 200, 'Product update', update.body)
    action = 'updated'
    id = existing.id
  } else {
    const create = await request('/api/admin/products', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(desiredProduct),
    })
    assertStatus(create.response.status, 201, 'Product create', create.body)
    action = 'created'
    id = create.body?.id
  }

  const publicCatalog = await request('/api/products')
  assertStatus(publicCatalog.response.status, 200, 'Public product list', publicCatalog.body)
  const publicProduct = Array.isArray(publicCatalog.body)
    ? publicCatalog.body.find((product) => product.id === PRODUCT_SLUG)
    : null
  if (!publicProduct) throw new Error('The active test product is missing from /api/products.')
  if (!publicProduct.variants?.length) throw new Error('The test product has no purchasable variants.')

  const home = await request('/')
  assertStatus(home.response.status, 200, 'Storefront homepage', home.body)
  if (typeof home.body !== 'string' || !home.body.includes(PRODUCT_NAME)) {
    throw new Error('The test product is in the API but missing from the server-rendered homepage.')
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        action,
        id,
        slug: PRODUCT_SLUG,
        storefront: `${baseUrl}/#products`,
        productPage: `${baseUrl}/product/${PRODUCT_SLUG}`,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
