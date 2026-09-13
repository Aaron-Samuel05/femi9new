export interface Product {
  id: string
  name: string
  price: number
  img: string
  fallbackImg?: string
  meta: string
  flow: string
  desc: string
  tag?: string
  tagClass?: 'pink'
}

export const PRODUCTS: Product[] = [
  {
    id: 'p330dw',
    name: '330mm Double Wings',
    price: 225,
    img: '/assets/img/prod-330-double.jpg',
    fallbackImg: 'https://femi9.in/uploads/Product/1773300828_jFWVIMppz1.webp',
    meta: '9 pads · 330mm',
    flow: 'Heavy · Night + Day',
    desc: 'Extra-length with double wings for overnight security.',
    tag: 'Bestseller',
  },
  {
    id: 'p290l9',
    name: '290mm Large',
    price: 198,
    img: '/assets/img/prod-290-large9.jpg',
    fallbackImg: 'https://femi9.in/uploads/Product/1773133252_Z8x7rRTQcf.webp',
    meta: '9 pads · 290mm',
    flow: 'Regular · Everyday',
    desc: 'The everyday large. Nine pads for a full, comfy cycle.',
  },
  {
    id: 'p330cw',
    name: '330mm Centre Wings',
    price: 225,
    img: '/assets/img/prod-330-centre.jpg',
    fallbackImg: 'https://femi9.in/uploads/Product/1773300799_8RwUly1byg.webp',
    meta: '9 pads · 330mm',
    flow: 'Heavy · Night',
    desc: 'Extra-length with centre wings and a wider back.',
  },
  {
    id: 'p290l3',
    name: '290mm Starter',
    price: 72,
    img: '/assets/img/prod-290-large3.jpg',
    fallbackImg: 'https://femi9.in/uploads/Product/1773132065_WZLOmMA0v1.webp',
    meta: '3 pads · 290mm',
    flow: 'Try it · Everyday',
    desc: 'A three-pad starter to feel the Femi9 difference.',
    tag: 'Trial pack',
    tagClass: 'pink',
  },
]

export const FREE_SHIP = 999
export const WA_NUMBER = '919042916499'

export const rupees = (n: number): string => 'Rs.' + n.toLocaleString('en-IN')
