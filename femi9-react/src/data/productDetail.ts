export interface ProductExtra {
  gallery: string[]
  rating: number
  reviews: number
  long: string
  features: { title: string; body: string }[]
  specs: { k: string; v: string }[]
}

const PAD_1 = '/assets/img/pad-detail-1.jpg'
const PAD_2 = '/assets/img/pad-detail-2.jpg'

const commonFeatures = [
  { title: 'Anion comfort strip', body: 'A functional strip that helps control odour and eases cramps through the day.' },
  { title: 'Certified organic cotton', body: 'A soft, breathable, plant-based top sheet that stays dry and gentle on skin.' },
  { title: '100% biodegradable', body: 'Toxin-free, chlorine-free materials that are kinder to you and the planet.' },
]

export const EXTRAS: Record<string, ProductExtra> = {
  p330dw: {
    gallery: ['/assets/img/prod-330-double.jpg', PAD_1, PAD_2],
    rating: 4.8,
    reviews: 214,
    long: 'Our overnight hero. Extra 330mm length with double wings locks everything in place while you sleep, so you wake up fresh and worry-free. Ultra-thin, breathable, and made for the heaviest nights.',
    features: commonFeatures,
    specs: [
      { k: 'Length', v: '330mm (Extra Large)' },
      { k: 'Wings', v: 'Double wings' },
      { k: 'Pads per pack', v: '9 pads' },
      { k: 'Best for', v: 'Heavy flow · Night + Day' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
  p290l9: {
    gallery: ['/assets/img/prod-290-large9.jpg', PAD_1, PAD_2],
    rating: 4.7,
    reviews: 168,
    long: 'The everyday large. Nine soft, breathable pads that carry you comfortably through a full, regular-flow day without the bulk.',
    features: commonFeatures,
    specs: [
      { k: 'Length', v: '290mm (Large)' },
      { k: 'Wings', v: 'Standard' },
      { k: 'Pads per pack', v: '9 pads' },
      { k: 'Best for', v: 'Regular flow · Everyday' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
  p330cw: {
    gallery: ['/assets/img/prod-330-centre.jpg', PAD_2, PAD_1],
    rating: 4.8,
    reviews: 141,
    long: 'Extra 330mm length with centre wings and a wider back panel for confident, leak-free heavier nights. Soft, thin, and reassuringly secure.',
    features: commonFeatures,
    specs: [
      { k: 'Length', v: '330mm (Extra Large)' },
      { k: 'Wings', v: 'Centre wings, wide back' },
      { k: 'Pads per pack', v: '9 pads' },
      { k: 'Best for', v: 'Heavy flow · Night' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
  p290l3: {
    gallery: ['/assets/img/prod-290-large3.jpg', PAD_1, PAD_2],
    rating: 4.6,
    reviews: 96,
    long: 'A three-pad starter so you can feel the Femi9 difference before you switch fully. Same organic cotton, same anion strip, no commitment.',
    features: commonFeatures,
    specs: [
      { k: 'Length', v: '290mm (Large)' },
      { k: 'Wings', v: 'Standard' },
      { k: 'Pads per pack', v: '3 pads' },
      { k: 'Best for', v: 'Trying it out · Everyday' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
}

export const sampleReviews = [
  { name: 'Divya R.', place: 'Coimbatore', rating: 5, date: 'Jun 2026', body: 'Finally a pad that does not feel plastic-y. The overnight one genuinely lasts till morning.' },
  { name: 'Sneha K.', place: 'Erode', rating: 5, date: 'May 2026', body: 'The anion strip actually helps with my cramps. Switched my whole family over.' },
  { name: 'Priya M.', place: 'Chennai', rating: 4, date: 'May 2026', body: 'Soft and thin, no rashes. Wish the trial pack had more counts, but love it otherwise.' },
]
