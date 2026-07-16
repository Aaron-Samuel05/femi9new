export const user = {
  name: 'Aishwarya Menon',
  initials: 'AM',
  email: 'aishwarya.menon@gmail.com',
  phone: '+91 98842 30571',
  since: 'March 2025',
  points: 1240,
  tier: 'Bloom member',
}

export const addresses = [
  { label: 'Home', name: 'Aishwarya Menon', line: '14, Kongu Nagar, 2nd Street', city: 'Erode, Tamil Nadu 638011', phone: '+91 98842 30571', primary: true },
  { label: 'Work', name: 'Aishwarya Menon', line: 'Zoho Corp, Estancia IT Park', city: 'Chennai, Tamil Nadu 603202', phone: '+91 98842 30571', primary: false },
]

export type OrderStatus = 'Delivered' | 'Shipped' | 'Processing'

export const orders: {
  id: string
  date: string
  items: { name: string; qty: number }[]
  total: number
  status: OrderStatus
}[] = [
  { id: 'FM-20614', date: '18 Jun 2026', items: [{ name: '330mm Double Wings', qty: 2 }, { name: '290mm Large', qty: 1 }], total: 648, status: 'Delivered' },
  { id: 'FM-19822', date: '21 May 2026', items: [{ name: '330mm Double Wings', qty: 2 }], total: 450, status: 'Delivered' },
  { id: 'FM-19035', date: '24 Apr 2026', items: [{ name: '330mm Centre Wings', qty: 1 }, { name: '290mm Starter', qty: 2 }], total: 369, status: 'Delivered' },
  { id: 'FM-21440', date: '06 Jul 2026', items: [{ name: '330mm Double Wings', qty: 2 }], total: 450, status: 'Shipped' },
]

export const subscription = {
  active: true,
  product: '330mm Double Wings',
  qty: 2,
  frequency: 'Every 4 weeks',
  nextDelivery: '13 Jul 2026',
  saved: 540,
}

/* spend over recent months, for a small profile chart */
export const spendTrend = {
  labels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
  values: [225, 369, 369, 450, 648, 450],
}
