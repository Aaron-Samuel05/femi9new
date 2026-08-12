export interface ProductExtra {
  gallery: string[]
  rating: number
  reviews: number
  long: string
  features: { title: string; body: string }[]
  specs: { k: string; v: string }[]
}

const PAD_1 = '/assets/img/pad-detail-1.webp'
const PAD_2 = '/assets/img/pad-detail-2.webp'

const commonFeatures = [
  { title: 'Anion comfort strip', body: 'A functional strip that helps control odour and eases cramps through the day.' },
  { title: 'Certified organic cotton', body: 'A soft, breathable, plant-based top sheet that stays dry and gentle on skin.' },
  { title: '100% biodegradable', body: 'Toxin-free, chlorine-free materials that are kinder to you and the planet.' },
]

export const EXTRAS: Record<string, ProductExtra> = {
  p330dw: {
    gallery: ['/assets/img/prod-330-double.webp', PAD_1, PAD_2],
    rating: 4.8,
    reviews: 214,
    long: 'A 100% organic cotton overnight pad with extra 330mm coverage and double wings. Enriched with an active anion strip that locks in heavy flow, neutralizes odor, and soothes cramp discomfort. Chlorine-free and rash-safe for all skin types.',
    features: [
      { title: '330mm Extra-Long Coverage', body: 'Designed for heavy flow and overnight use with extra-long protection.' },
      { title: '9-Layer Leak-Lock Protection', body: 'Fast-absorbing layers help lock in flow for dependable protection and comfort.' },
      { title: 'Soft & Breathable Top Sheet', body: 'Cottony-soft surface with breathable construction—gentle comfort even for sensitive skin.' },
      { title: 'Rash-Conscious Comfort', body: 'Made without added chlorine, fragrance, or dyes for gentler period care.' },
      { title: 'Freshness & Odour Control', body: 'Maintains a fresh, confident feel through long days and overnight use.' },
      { title: 'Secure Long Wings', body: 'Designed to stay securely in place through work, travel, and sleep.' },
    ],
    specs: [
      { k: 'Length', v: '330mm (Extra Large)' },
      { k: 'Wings', v: 'Double wings' },
      { k: 'Pads per pack', v: '9 pads' },
      { k: 'Best for', v: 'Heavy flow · Night + Day' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
  p290l9: {
    gallery: ['/assets/img/prod-290-large9.webp', PAD_1, PAD_2],
    rating: 4.7,
    reviews: 168,
    long: 'A 100% certified organic cotton pad designed for active regular-to-heavy flow days. Features an active anion comfort strip and 9-layer leak-guard core that locks in moisture, eliminates odor, and prevents skin chafing. 100% toxin-free and gentle on sensitive skin.',
    features: [
      { title: '290mm Large Coverage', body: 'Thoughtfully sized for active, regular-flow days and everyday movement.' },
      { title: 'Leak-Guard Protection', body: 'Multi-layer core channels wetness away and locks it in quickly.' },
      { title: 'Soft Cottony Feel', body: 'A gentle, rash-free top sheet designed for zero skin irritation.' },
      { title: 'Highly Breathable Layers', body: 'Promotes continuous airflow to keep you fresh and dry.' },
      { title: 'Rash-Conscious Comfort', body: 'Free from chemicals, chlorine, and synthetic scents.' },
      { title: 'Freshness & Odour Control', body: 'Natural odour control that works quietly all day long.' },
      { title: 'Secure Standard Wings', body: 'Stays anchored securely to your underwear without shifting.' },
      { title: 'Ultra-Thin Profile', body: 'Feels light and discreet under any outfit.' },
    ],
    specs: [
      { k: 'Length', v: '290mm (Large)' },
      { k: 'Wings', v: 'Standard' },
      { k: 'Pads per pack', v: '9 pads' },
      { k: 'Best for', v: 'Regular flow · Everyday' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
  p330cw: {
    gallery: ['/assets/img/prod-330-centre.webp', PAD_2, PAD_1],
    rating: 4.8,
    reviews: 141,
    long: 'Extra 330mm length pad with central wing balance and a wide back panel for heavy night protection. Combines breathable organic cotton with active anion technology to prevent sleep leaks and neutralize odors naturally.',
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
    gallery: ['/assets/img/prod-290-large3.webp', PAD_1, PAD_2],
    rating: 4.6,
    reviews: 96,
    long: 'A 3-pad trial pack made with 100% certified organic cotton and active anion technology. Ideal for experiencing rash-free, leak-guard period care before switching to full monthly subscriptions.',
    features: commonFeatures,
    specs: [
      { k: 'Length', v: '290mm (Large)' },
      { k: 'Wings', v: 'Standard' },
      { k: 'Pads per pack', v: '3 pads' },
      { k: 'Best for', v: 'Trying it out · Everyday' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
  ppanty: {
    // gallery entries are PantyArt tints, rendered as illustrations (no photo)
    gallery: ['lilac', 'plum', 'gold'],
    rating: 4.7,
    reviews: 58,
    long: 'Reusable 4-layer period underwear crafted from soft organic cotton with a leak-proof breathable barrier. Holds up to 2 full pads of flow, washable up to 40+ cycles, and completely chemical-free for ultimate everyday & sleep comfort.',
    features: [
      { title: 'Four-layer leak-proof core', body: 'A cotton top, absorbent middle and leak-proof back hold up to two pads’ worth, without the bulk.' },
      { title: 'Reusable up to 40 washes', body: 'Rinse, machine-wash cold and line-dry. One pair replaces dozens of disposables.' },
      { title: 'Breathable & rash-free', body: 'Organic cotton lining stays soft and airy. No plastic-y feeling through the night.' },
    ],
    specs: [
      { k: 'Type', v: 'Reusable period underwear' },
      { k: 'Absorbency', v: 'Medium–Heavy (≈2 pads)' },
      { k: 'Sizes', v: 'S · M · L · XL' },
      { k: 'Reuse', v: 'Up to 40 washes' },
      { k: 'Lining', v: 'Organic cotton' },
      { k: 'Care', v: 'Rinse · machine-wash cold · line-dry' },
    ],
  },
  p180m9: {
    gallery: ['/assets/img/prod-180-mini.webp', PAD_1, PAD_2],
    rating: 4.5,
    reviews: 32,
    long: 'Ultra-thin 1mm organic cotton daily panty liners for light flow, spotting, and daily discharge. Features breathable micro-porous backing and a natural anion strip to maintain intimate freshness all day long.',
    features: [
      { title: 'Everyday Panty Liners', body: 'Ideal for daily freshness, light discharge, or spotting.' },
      { title: 'Daily Freshness', body: 'Keeps you feeling clean, dry, and comfortable throughout the day.' },
      { title: 'Moisture Control', body: 'Breathable back-sheet channels moisture away from your skin.' },
      { title: 'Odour Control', body: 'Natural freshness control helps neutralize odours safely.' },
      { title: 'Ultra-Thin Design', body: 'Super-slim construction that remains completely invisible.' },
      { title: 'Slim & Discreet', body: 'Designed to fit your favorite undies seamlessly.' },
    ],
    specs: [
      { k: 'Length', v: '180mm (Mini)' },
      { k: 'Pads per pack', v: '30 liners' },
      { k: 'Best for', v: 'Light Flow & Daily Freshness' },
      { k: 'Top sheet', v: 'Organic cotton' },
    ],
  },
}

export const sampleReviews = [
  { name: 'Divya R.', place: 'Coimbatore', rating: 5, date: 'Jun 2026', body: 'Finally a pad that does not feel plastic-y. The overnight one genuinely lasts till morning.' },
  { name: 'Sneha K.', place: 'Erode', rating: 5, date: 'May 2026', body: 'The anion strip actually helps with my cramps. Switched my whole family over.' },
  { name: 'Priya M.', place: 'Chennai', rating: 4, date: 'May 2026', body: 'Soft and thin, no rashes. Wish the trial pack had more counts, but love it otherwise.' },
]
