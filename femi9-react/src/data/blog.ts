export type BlogCategory =
  | 'Cycle & Hormones'
  | 'Comfort & Care'
  | 'Skin & Body'
  | 'Sustainability'
  | 'Product Guides'
  | 'Community'

export interface BlogPost {
  slug: string
  title: string
  category: BlogCategory
  excerpt: string
  author: string
  date: string
  readTime: number
  /** CSS gradient used for the poster when there is no photo. */
  tone: string
  /** Optional real photo (from /assets/img). */
  image?: string
  featured?: boolean
  /** Body lines: '## ' → heading, '> ' → pull-quote, else paragraph. */
  body: string[]
}

interface CategoryMeta {
  color: string
  tint: string
}

export const CATEGORY_META: Record<BlogCategory, CategoryMeta> = {
  'Cycle & Hormones': { color: '#7B4FA6', tint: 'linear-gradient(150deg,#F2ECF9,#D6C2EC)' },
  'Comfort & Care': { color: '#C0603F', tint: 'linear-gradient(150deg,#FBE7D6,#F0C6A6)' },
  'Skin & Body': { color: '#B07C2A', tint: 'linear-gradient(150deg,#FFF3D6,#F6DFA0)' },
  Sustainability: { color: '#2E7D5B', tint: 'linear-gradient(150deg,#E7F0EA,#B9D8C6)' },
  'Product Guides': { color: '#C98A00', tint: 'linear-gradient(150deg,#FFF6E0,#FCE3A8)' },
  Community: { color: '#3F6E86', tint: 'linear-gradient(150deg,#E6EFF3,#BAD0DC)' },
}

export const CATEGORIES: BlogCategory[] = [
  'Cycle & Hormones',
  'Comfort & Care',
  'Skin & Body',
  'Sustainability',
  'Product Guides',
  'Community',
]

export const POSTS: BlogPost[] = [
  {
    slug: 'anion-strip-explained',
    title: 'The anion strip, explained: what it actually does for your day',
    category: 'Product Guides',
    excerpt:
      'You have seen the green strip down the middle of a Femi9 pad. Here is the honest, jargon-free version of what it is for — and what it is not.',
    author: 'Dr. Gomathi',
    date: 'July 2, 2026',
    readTime: 5,
    tone: CATEGORY_META['Product Guides'].tint,
    image: '/assets/img/hero.jpg',
    featured: true,
    body: [
      'If you have ever unwrapped a Femi9 pad and wondered about the soft green strip running down the centre, you are not alone. It is our most-asked-about feature, and also our most misunderstood.',
      '## What the strip is',
      'The anion strip is a thin functional layer designed to release negative ions in the presence of moisture and warmth. In everyday terms, it is built to help keep the surface feeling fresher for longer and to gently support you through the parts of the day that can feel less comfortable.',
      'It sits underneath the soft cotton top sheet, so it never touches your skin directly. What you feel against you is always breathable organic cotton.',
      '## What it is not',
      'The strip is not a medicine and it is not a cure for cramps. We are careful never to over-promise. What many people tell us is that the overall experience — thin, breathable, low-odour — simply feels steadier, and the strip is one part of that whole design.',
      '> The goal was never a gimmick. It was a pad that quietly does its job and gets out of your way.',
      'If comfort through your cycle is what you are after, the strip works best as part of the full pad: organic cotton on top, a biodegradable core to lock moisture, and a breathable back that will not trap heat.',
    ],
  },
  {
    slug: 'cycle-syncing-101',
    title: 'Cycle syncing 101: living in rhythm with your four phases',
    category: 'Cycle & Hormones',
    excerpt:
      'Your energy is not meant to be identical every day of the month. A gentle guide to moving, eating and resting with your cycle instead of against it.',
    author: 'Aarti Menon',
    date: 'June 24, 2026',
    readTime: 7,
    tone: CATEGORY_META['Cycle & Hormones'].tint,
    featured: true,
    body: [
      'We are often taught to expect the same energy, focus and mood every single day. But a menstrual cycle moves through four distinct phases, each with its own hormonal weather. Learning the pattern can make the whole month feel less like a mystery.',
      '## Menstrual phase',
      'This is day one of your period onward. Energy is usually at its lowest, and that is by design. Rest is productive here. Gentle walks, warmth and early nights pay off.',
      '## Follicular phase',
      'As bleeding ends, estrogen rises and so does your appetite for new things. Many people feel more social, creative and open to a challenge. A good week to start something.',
      '## Ovulatory phase',
      'Energy and confidence often peak. If you have a big conversation or a hard workout in mind, this is frequently the easiest time for it.',
      '## Luteal phase',
      'In the run-up to your period, progesterone rises and things naturally slow. Cravings and sensitivity are common. Steadier routines and slightly gentler goals help you land softly into the next cycle.',
      '> Cycle syncing is not a rulebook. It is permission to stop expecting a flat, identical version of yourself every day.',
    ],
  },
  {
    slug: 'night-protection-sleep',
    title: 'Night protection that lets you actually sleep',
    category: 'Product Guides',
    excerpt:
      'Overnight leaks are usually a coverage problem, not a you problem. What to look for in a night pad, and how the 330mm and 425mm work.',
    author: 'Femi9 Team',
    date: 'June 18, 2026',
    readTime: 4,
    tone: CATEGORY_META['Product Guides'].tint,
    image: '/assets/img/prod-330-double.jpg',
    featured: true,
    body: [
      'The single most common message we get is some version of: "I wake up to check." Broken sleep on your period is exhausting, and it is almost always a coverage-and-position problem rather than anything you are doing wrong.',
      '## Length before thickness',
      'For overnight, back coverage matters more than bulk. Flow pools toward the back when you lie down, so a longer pad — 330mm or the 425mm overnight — gives your body room to move without a gap opening up.',
      '## Wings that hold position',
      'Double wings keep the pad anchored so it does not shift and bunch while you turn. A pad that stays put is a pad that keeps working.',
      '## Breathable, still',
      'Longer does not have to mean hotter. A breathable back layer means you get the coverage without the sweaty, plasticky feeling that wakes people up just as surely as a leak does.',
      '> Good night protection is the kind you forget about, because it lets you sleep straight through.',
    ],
  },
  {
    slug: 'organic-cotton-difference',
    title: 'Organic cotton vs. conventional: what your skin can feel',
    category: 'Skin & Body',
    excerpt:
      'The top sheet is the one part of a pad that touches you for hours. Here is why the material choice is not just marketing.',
    author: 'Dr. Gomathi',
    date: 'June 11, 2026',
    readTime: 6,
    tone: CATEGORY_META['Skin & Body'].tint,
    image: '/assets/img/pad-detail-2.jpg',
    featured: true,
    body: [
      'Skin on this part of the body is thin, sensitive and in contact with a pad for many hours at a time. So the top sheet — the layer against you — is worth being fussy about.',
      '## Chlorine-free matters',
      'Conventional pads are often bleached bright white with chlorine compounds. Organic cotton skips that. For people prone to irritation, removing that step can be the difference between an uneventful period and a week of itch.',
      '## Breathability',
      'Cotton breathes in a way that plastic-topped pads do not. Airflow keeps the surface drier and cooler, which is exactly the environment sensitive skin prefers.',
      '## Fewer unknowns',
      'Certified organic cotton means a shorter, more traceable list of what is actually touching you. When your skin reacts, fewer variables makes it far easier to find comfort.',
      '> If a pad is going to be against your skin for eight hours, the material is not a detail. It is the whole point.',
    ],
  },
  {
    slug: 'low-waste-period',
    title: 'Building a low-waste period, one small swap at a time',
    category: 'Sustainability',
    excerpt:
      'Zero-waste periods can feel impossible and preachy. A realistic, no-guilt look at swaps that genuinely add up over a lifetime of cycles.',
    author: 'Aarti Menon',
    date: 'June 3, 2026',
    readTime: 6,
    tone: CATEGORY_META.Sustainability.tint,
    featured: true,
    body: [
      'A person can use thousands of period products across a lifetime. That number can feel heavy — but it also means small, sustainable choices compound into something real.',
      '## Start with what you already use',
      'The most sustainable swap is the one you will actually keep. Biodegradable pads are an easy first step because nothing about your routine has to change.',
      '## Read the back layer',
      'Much of a conventional pad is plastic. Choosing pads with biodegradable cores and breathable, lower-plastic backing meaningfully cuts what ends up in landfill.',
      '## Progress, not purity',
      'You do not have to overhaul everything at once. One swap, repeated every cycle, does more good than a perfect plan you abandon by month two.',
      '> Sustainability that lasts is the unglamorous, repeatable kind.',
    ],
  },
  {
    slug: 'period-cramps-normal',
    title: 'Period cramps: what is normal, and when to check in',
    category: 'Comfort & Care',
    excerpt:
      'Most cramps are ordinary. Some are a signal. A calm, non-alarmist guide to telling the difference and finding relief that works.',
    author: 'Dr. Gomathi',
    date: 'May 27, 2026',
    readTime: 6,
    tone: CATEGORY_META['Comfort & Care'].tint,
    body: [
      'Cramping is one of the most common period experiences, and for most people it is a normal — if annoying — part of the cycle. Knowing the usual pattern helps you spot when something is worth a conversation with a doctor.',
      '## The usual pattern',
      'Typical cramps arrive shortly before or as bleeding begins and ease over the first day or two. Heat, movement and rest genuinely help for many people.',
      '## When to check in',
      'Pain that stops you doing normal things, that keeps getting worse, or that shows up at unusual times in your cycle is worth raising with a professional. Trust your own baseline — you know your body better than any chart.',
      '## Everyday relief',
      'A warm compress, gentle movement, hydration and staying comfortable and dry all help. A breathable pad will not cure a cramp, but staying un-irritated means one less thing adding to the discomfort.',
      '> Normal does not mean you have to grit your teeth through it. Comfort is allowed.',
    ],
  },
  {
    slug: 'ultra-thin-protection',
    title: 'Why ultra-thin does not mean less protection',
    category: 'Product Guides',
    excerpt:
      'Thinness used to mean a compromise. Modern cores have quietly rewritten that rule — here is the engineering in plain language.',
    author: 'Femi9 Team',
    date: 'May 19, 2026',
    readTime: 4,
    tone: CATEGORY_META['Product Guides'].tint,
    image: '/assets/img/pad-detail-1.jpg',
    body: [
      'For a long time, more protection meant more bulk. That trade-off is largely gone, and it comes down to what the absorbent core is made of.',
      '## It is about the core, not the thickness',
      'Modern absorbent materials lock in far more liquid per millimetre than old fluff-based padding. A thin core can hold a heavy day comfortably while feeling like almost nothing.',
      '## Comfort you keep wearing',
      'Thin, breathable pads are the ones people actually keep on all day, which in practice means better real-world protection than a bulky pad you are constantly adjusting.',
      '> The best pad is the one you forget you are wearing — and it still has your back.',
    ],
  },
  {
    slug: 'spotting-between-periods',
    title: 'Spotting between periods: six calm explanations',
    category: 'Cycle & Hormones',
    excerpt:
      'Unexpected spotting is startling, but it is often ordinary. The common, non-scary reasons — and the ones worth a doctor visit.',
    author: 'Dr. Gomathi',
    date: 'May 12, 2026',
    readTime: 5,
    tone: CATEGORY_META['Cycle & Hormones'].tint,
    body: [
      'Seeing a little blood when you are not expecting your period can be unsettling. In many cases it is harmless, and understanding the usual causes takes a lot of the fear out of it.',
      '## Common, ordinary reasons',
      'Ovulation, starting or changing a hormonal contraceptive, stress, and the first months of a new cycle pattern can all cause light spotting. A liner is usually all you need.',
      '## Worth a conversation',
      'Spotting that is heavy, persistent, painful, or happens after intimacy is worth raising with a professional — not to panic, but to rule things out and get peace of mind.',
      '> A small liner and a calm head handle most of it. A doctor handles the rest.',
    ],
  },
  {
    slug: 'first-pad-teen-guide',
    title: 'Choosing a first pad: a gentle guide for new periods',
    category: 'Comfort & Care',
    excerpt:
      'A first period is a big day. A simple, reassuring guide for teens and parents on picking something comfortable and fuss-free.',
    author: 'Aarti Menon',
    date: 'May 4, 2026',
    readTime: 5,
    tone: CATEGORY_META['Comfort & Care'].tint,
    image: '/assets/img/prod-290-large9.jpg',
    body: [
      'A first period can feel like a lot at once. The good news is that choosing a pad does not have to be complicated, and the right first pad is simply one that feels comfortable and easy.',
      '## Start regular, start soft',
      'A regular-length pad with a soft cotton top is the friendliest starting point — enough coverage for confidence without feeling bulky.',
      '## Change often, worry less',
      'Changing every few hours keeps things fresh and comfortable, and takes the guesswork out of "is it time yet?" A small pouch in a bag makes it easy at school.',
      '## For parents',
      'A calm, matter-of-fact tone does more than any pep talk. Keeping a starter pack handy at home says, gently, that this is normal and you are ready.',
      '> The first pad only needs to do one thing: make the day feel manageable.',
    ],
  },
  {
    slug: 'irritation-sensitive-skin',
    title: 'Keeping sensitive skin happy on your period',
    category: 'Skin & Body',
    excerpt:
      'Itch, rash and chafing are common and fixable. A practical routine for calmer, happier skin through every cycle.',
    author: 'Dr. Gomathi',
    date: 'April 26, 2026',
    readTime: 5,
    tone: CATEGORY_META['Skin & Body'].tint,
    body: [
      'Irritation during a period is common enough that many people assume it is just part of the deal. It usually is not — and a few adjustments make a real difference.',
      '## Reduce the triggers',
      'Fragranced and heavily bleached products are frequent culprits. Switching to fragrance-free, chlorine-free organic cotton removes two of the biggest irritants at once.',
      '## Keep it dry and breathable',
      'Moisture and heat are what turn a mild irritation into a rash. Breathable pads and regular changes keep the environment calm.',
      '## Be kind after',
      'Loose, breathable underwear and gentle, unscented washing help skin recover between cycles so you are not starting each period already irritated.',
      '> Sensitive skin is not high-maintenance. It is just honest about what is bothering it.',
    ],
  },
  {
    slug: 'pms-moods-science',
    title: 'PMS mood shifts are real — the science and what helps',
    category: 'Cycle & Hormones',
    excerpt:
      'No, it is not "all in your head." A clear look at why mood changes before your period, and gentle things that genuinely help.',
    author: 'Aarti Menon',
    date: 'April 18, 2026',
    readTime: 6,
    tone: CATEGORY_META['Cycle & Hormones'].tint,
    body: [
      'Being told your feelings are just hormones is dismissive and, frankly, wrong. Premenstrual mood changes are a real, physiological phenomenon — and understanding them is the opposite of dismissing them.',
      '## What is happening',
      'In the luteal phase, shifting levels of estrogen and progesterone interact with brain chemistry linked to mood and sleep. For some people that means irritability, low mood or anxiety in the days before bleeding.',
      '## What tends to help',
      'Steady sleep, movement, and going gentle on caffeine and sugar all soften the edges for many people. Tracking your cycle helps too — simply knowing "this is my luteal week" reframes the feeling.',
      '## When to seek support',
      'If low mood before your period is severe or disruptive, that is worth talking to a professional about. It is common, it is real, and it is treatable.',
      '> Naming the pattern is powerful. It turns "what is wrong with me" into "ah, it is that week."',
    ],
  },
  {
    slug: 'women-entrepreneurs',
    title: 'Better periods, real livelihoods: 5,000+ women and counting',
    category: 'Community',
    excerpt:
      'Femi9 is more than a pad. A look at the network of women entrepreneurs turning better period care into economic independence.',
    author: 'Femi9 Team',
    date: 'April 9, 2026',
    readTime: 5,
    tone: CATEGORY_META.Community.tint,
    image: '/assets/img/prod-290-large3.jpg',
    featured: true,
    body: [
      'Femi9 began with a simple belief: period care should be safe, honest and genuinely comfortable. Somewhere along the way it also became a livelihood for thousands of women.',
      '## The model',
      'Across Tamil Nadu and beyond, a growing network of women entrepreneurs distribute Femi9 in their own communities — earning an income while making better period care reachable where it is needed most.',
      '## Why it matters',
      'Access and dignity travel together. When the person selling you a pad is your neighbour, the conversation around periods opens up, and the stigma quietly loses its grip.',
      '## The number that keeps growing',
      'More than 5,000 women entrepreneurs are part of the network today. Every pack sold helps it grow.',
      '> Turning better periods into economic independence was never a side project. It is the point.',
    ],
  },
]

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug)
}

export function relatedPosts(post: BlogPost, n = 3): BlogPost[] {
  const sameCat = POSTS.filter((p) => p.slug !== post.slug && p.category === post.category)
  const others = POSTS.filter((p) => p.slug !== post.slug && p.category !== post.category)
  return [...sameCat, ...others].slice(0, n)
}
