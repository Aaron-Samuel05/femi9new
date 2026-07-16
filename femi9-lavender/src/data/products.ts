export type ProductType = 'pad' | 'panty'

export interface PackOption {
  count: number
  price: number
}

export interface Product {
  id: string
  name: string
  price: number
  img: string
  meta: string
  flow: string
  desc: string
  tag?: string
  tagClass?: 'pink'
  /** 'pad' (default) sells by pack count; 'panty' sells by body size. */
  type?: ProductType
  /** Pads: available pack sizes (3 / 6 / 9 pcs). Default price matches the last pack. */
  packs?: PackOption[]
  /** Panties: available body sizes. */
  sizes?: string[]
}

export const PRODUCTS: Product[] = [
  {
    id: 'p330dw',
    name: '330mm Double Wings',
    price: 225,
    img: '/assets/img/prod-330-double.jpg',
    meta: '9 pads · 330mm',
    flow: 'Heavy · Night + Day',
    desc: 'Extra-length with double wings for overnight security.',
    tag: 'Bestseller',
    type: 'pad',
    packs: [
      { count: 3, price: 79 },
      { count: 6, price: 149 },
      { count: 9, price: 225 },
    ],
  },
  {
    id: 'p290l9',
    name: '290mm Large',
    price: 198,
    img: '/assets/img/prod-290-large9.jpg',
    meta: '9 pads · 290mm',
    flow: 'Regular · Everyday',
    desc: 'The everyday large. Nine pads for a full, comfy cycle.',
    type: 'pad',
    packs: [
      { count: 3, price: 69 },
      { count: 6, price: 129 },
      { count: 9, price: 198 },
    ],
  },
  {
    id: 'p330cw',
    name: '330mm Centre Wings',
    price: 225,
    img: '/assets/img/prod-330-centre.jpg',
    meta: '9 pads · 330mm',
    flow: 'Heavy · Night',
    desc: 'Extra-length with centre wings and a wider back.',
    type: 'pad',
    packs: [
      { count: 3, price: 79 },
      { count: 6, price: 149 },
      { count: 9, price: 225 },
    ],
  },
  {
    id: 'p290l3',
    name: '290mm Starter',
    price: 72,
    img: '/assets/img/prod-290-large3.jpg',
    meta: '3 pads · 290mm',
    flow: 'Try it · Everyday',
    desc: 'A three-pad starter to feel the Femi9 difference.',
    tag: 'Trial pack',
    tagClass: 'pink',
    type: 'pad',
  },
  {
    id: 'ppanty',
    name: 'Period Panties',
    price: 649,
    img: '',
    meta: 'Reusable · up to 40 washes',
    flow: 'Leak-proof · Medium–Heavy',
    desc: 'Soft, breathable and reusable. A full night of protection you can wash and wear again.',
    tag: 'New',
    type: 'panty',
    sizes: ['S', 'M', 'L', 'XL'],
  },
]

/** Subscribe & save — applied on every product page. */
export const SUBSCRIBE_PCT = 15
export interface Cadence {
  id: string
  label: string
  sub: string
  /** approximate days until first delivery, for the "next delivery" hint */
  days: number
}
export const CADENCES: Cadence[] = [
  { id: 'cycle', label: 'Every cycle', sub: 'Arrives ~3 days before your period', days: 25 },
  { id: '4w', label: 'Every 4 weeks', sub: 'A steady four-week refill', days: 28 },
  { id: '6w', label: 'Every 6 weeks', sub: 'For lighter or shorter cycles', days: 42 },
]

export const FREE_SHIP = 999
export const WA_NUMBER = '919042916499'

export const rupees = (n: number): string => 'Rs.' + n.toLocaleString('en-IN')

/** discounted subscription price, rounded to the rupee */
export const subPrice = (price: number): number => Math.round((price * (100 - SUBSCRIBE_PCT)) / 100)
