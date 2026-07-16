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
  },
  {
    id: 'p290l9',
    name: '290mm Large',
    price: 198,
    img: '/assets/img/prod-290-large9.jpg',
    meta: '9 pads · 290mm',
    flow: 'Regular · Everyday',
    desc: 'The everyday large. Nine pads for a full, comfy cycle.',
  },
  {
    id: 'p330cw',
    name: '330mm Centre Wings',
    price: 225,
    img: '/assets/img/prod-330-centre.jpg',
    meta: '9 pads · 330mm',
    flow: 'Heavy · Night',
    desc: 'Extra-length with centre wings and a wider back.',
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
  },
]

export const FREE_SHIP = 999
export const WA_NUMBER = '919042916499'

export const rupees = (n: number): string => 'Rs.' + n.toLocaleString('en-IN')
