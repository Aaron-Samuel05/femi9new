/**
 * Marketing copy from the design handoff. Kept out of the page components so the
 * layout code stays readable and copy edits are a one-file change.
 */

import type { IconName } from "@/components/ui/Icon";
// `catalog.ts` imports nothing, so this cannot cycle. `inr` is here so a rupee
// amount in copy is formatted the one way the rest of the site formats one.
import { inr } from "@/lib/catalog";

export const BRAND = {
  tagline: "Happy day, every day - for every baby, in every home.",
  email: "care@lumi9.in",
  phone: "+91 90429 16499",
  addressLines: ["Thindal, Erode,", "Tamil Nadu 638012"],
  fullAddress: "222/1 Pavizham Nagar, Thindal, Erode, TN 638012",
  whatsapp: "@lumi9official · 9am-9pm",
  legalLine: "Chemical-free · Dermatologist tested · Made in India",
  copyright: "© 2026 Lumi9. All rights reserved.",
};

export const HERO_STATS = [
  { value: "5-layer", label: "protection system" },
  { value: "12 hrs", label: "of dryness" },
  { value: "0", label: "harsh chemicals" },
];

export const MARQUEE_ITEMS = [
  "Dermatologist tested",
  "Clinically proven",
  "Paediatrician tested",
  "No harmful chemicals",
  "Antibacterial protection",
  "Odor lock technology",
  "Wetness indicator",
  "360° protection",
];

export const USPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "drop",
    title: "Quick moisture absorption",
    body: "An Advanced SAP Core helps absorb moisture quickly and retain it within the diaper for comfortable everyday wear.",
  },
  {
    icon: "lock",
    title: "Wetness Lock support",
    body: "Wetness Lock Technology helps move moisture away from the surface to support a drier, more comfortable feel.",
  },
  {
    icon: "shield",
    title: "Double Leakage Barrier",
    body: "Added side protection helps manage unexpected leaks during active daytime movement and nighttime rest.",
  },
  {
    icon: "grow",
    title: "360° all-around protection",
    body: "Comfortable all-around coverage is designed to move naturally as your baby rolls, crawls, walks and explores.",
  },
  {
    icon: "wind",
    title: "Soft, breathable comfort",
    body: "A soft cotton-like touch, Aloe Vera-infused top sheet for skin smoothening and rash-free comfort, breathable backsheet and stretch waistband.",
  },
  {
    icon: "clock",
    title: "12-hour dry night protection",
    body: "The ADL Layer helps distribute liquid evenly, while a Wetness Indicator makes it easier to know when it may be time for a change.",
  },
];

export type Layer = { title: string; desc: string; benefits: string[] };

export const LAYERS: Layer[] = [
  {
    title: "Top Sheet",
    desc: "An ultra-soft cotton top sheet infused with Aloe Vera that gently touches your baby's skin.",
    benefits: ["Rash prevention", "Extremely soft texture", "Chemical-free protection"],
  },
  {
    title: "ADL Layer",
    desc: "The Acquisition Distribution Layer spreads liquid evenly throughout the diaper core.",
    benefits: ["Prevents pooling in one area", "Reduces heaviness & bulk", "Enhances smooth comfort"],
  },
  {
    title: "Absorbent Core",
    desc: "Powered by SAP, the absorbent core instantly locks moisture away from the skin.",
    benefits: ["Up to 12 hours dryness", "Fast moisture absorption", "Deep liquid locking"],
  },
  {
    title: "Breathable Backsheet",
    desc: "A biodegradable breathable layer with airflow pores that lets skin breathe.",
    benefits: ["Allows air circulation", "Prevents heat buildup", "Minimizes rash formation"],
  },
  {
    title: "Ultra-Soft Cotton Sheet",
    desc: "The layer closest to baby's skin uses pure natural cotton for softness and safety.",
    benefits: ["Gentle skin contact", "Safer than synthetics", "Buttery-soft comfort"],
  },
];

/** Card fills for the 5-layer stack, lightest (top sheet) to deepest. */
export const LAYER_COLORS = ["#fbf6d8", "#f0ead0", "#e4dcbf", "#d3caa4", "#c2b98d"];

export const VALUES = [
  {
    n: "01",
    title: "Comfort",
    body: "Cloud-soft, cotton-like surfaces, a soft stretch waistband and flexible leg areas, as your baby sleeps, stretches, crawls and plays.",
  },
  {
    n: "02",
    title: "Protection",
    body: "Advanced SAP Core, Wetness Lock Technology, Double Leakage Barrier and 360° protection, for daytime activity and nighttime rest.",
  },
  {
    n: "03",
    title: "Safety-conscious care",
    body: "Designed without harsh chemicals - no parabens, fragrance, latex or phthalates - with soft materials for delicate baby skin.",
  },
  {
    n: "04",
    title: "Thoughtful innovation",
    body: "Every feature has a purpose: the ADL Layer spreads liquid evenly, the breathable backsheet supports airflow, the indicator shows when to change.",
  },
  {
    n: "05",
    title: "Easy-to-find fit",
    body: "From NB newborn tape diapers up to 5 kg to XL baby diaper pants for 12-17 kg, clear size options for every growing stage.",
  },
];

export const TESTIMONIALS = [
  {
    quote: "“The soft cotton-like feel is what we noticed first. It feels comfortable through the night, and the fit stays secure while our little one sleeps.”",
    name: "Ananya R.",
    role: "mum of one",
    initial: "A",
  },
  {
    quote: "“We wanted a diaper that felt soft but could still keep up with active days. The flexible fit makes everyday changes feel much easier for us.”",
    name: "Priya & Karan",
    role: "parents of twins",
    initial: "P",
  },
  {
    quote: "“The wetness indicator alone is worth it. I stopped guessing at 3am.”",
    name: "Meera S.",
    role: "new mum",
    initial: "M",
  },
];

export const PDP_REVIEWS = [
  {
    quote: "“Zero leaks through my son’s 11-hour sleeps, and the cotton feel is unreal.”",
    name: "Ananya R.",
    role: "mum of one",
    initial: "A",
  },
  {
    quote: "“Switched the whole family over. No rashes since, and my budget didn’t flinch.”",
    name: "Priya & Karan",
    role: "parents of twins",
    initial: "P",
  },
  {
    quote: "“The wetness indicator alone is worth it. I stopped guessing at 3am.”",
    name: "Meera S.",
    role: "new mum",
    initial: "M",
  },
];

/**
 * Site POLICY, identical on every product and owned by no console page - so it
 * is appended to each product's own copy rather than stored per row, where five
 * sizes would mean five places to update one shipping rule.
 */
export function pdpPolicyAccordion(freeShipThreshold: number) {
  return [
    {
      q: "Shipping & returns",
      a: `Free delivery on orders over ${inr(freeShipThreshold)}, dispatched within 24 hours across India. Unopened packs can be returned within 30 days, no questions asked.`,
    },
  ];
}

/**
 * The PDP accordion's SEED INPUT, not what the page renders.
 *
 * `prisma/seed.ts` reads the Description and Materials & safety entries into
 * `Product.description` and `Product.longDescription`; `ProductBuyBox` builds the
 * panel from those columns plus the product's Key Benefits, so editing an entry
 * in the console changes the page and editing THIS changes only what a fresh
 * seed writes. The policy entry above is the one part still rendered from here.
 */
export const PDP_ACCORDION = [
  {
    q: "Description",
    a: "Cloud Soft pants combine an aloe-infused cotton top sheet, an ADL distribution layer, and a SAP absorbent core for up to 12 hours of dryness. A breathable, biodegradable backsheet keeps air moving and heat out.",
  },
  {
    q: "Materials & safety",
    a: "Free from lotions, fragrances, chlorine bleaching and harsh irritants. Dermatologist tested and clinically proven safe for sensitive newborn skin. A wetness indicator changes colour when it is time for a change.",
  },
];

export const ABOUT_STATS = [
  { value: "40k+", label: "Families served" },
  { value: "0", label: "Harsh chemicals" },
  { value: "12h", label: "Dryness, tested" },
  { value: "4.9★", label: "Average rating" },
];

export const ABOUT_VALUES = [
  { n: "01", title: "Comfort", body: "Every layer designed for ultra-soft baby comfort." },
  { n: "02", title: "Protection", body: "Advanced leak control for day and night." },
  { n: "03", title: "Safety", body: "Free from harmful chemicals and harsh irritants." },
  { n: "04", title: "Innovation", body: "Smart layer tech for absorption and airflow." },
  { n: "05", title: "Accessibility", body: "Premium quality at a genuinely affordable cost." },
];

export const SUBSCRIPTION_STEPS = [
  { n: "1", title: "Build your box", body: "Pick a size, pack and how often it should arrive." },
  { n: "2", title: "We ship on repeat", body: "Your box lands on schedule with 20% off, every time." },
  { n: "3", title: "Grows with baby", body: "Auto size-up bumps the size when your little one is ready." },
];

export const SUBSCRIPTION_BENEFITS: { icon: IconName; title: string; body: string }[] = [
  { icon: "save", title: "Save 20%", body: "Every delivery, automatically - no code needed." },
  { icon: "grow", title: "Auto size-up", body: "We move up a size when your baby is ready." },
  { icon: "pause", title: "Full control", body: "Skip, pause or cancel in a tap, anytime." },
  { icon: "truck", title: "Free delivery", body: "Always free, delivered to your door on schedule." },
];

export const SUBSCRIPTION_FREQUENCIES = ["2 weeks", "4 weeks", "6 weeks"] as const;

export const FIT_TIPS = [
  {
    n: "01",
    title: "Check the waistband",
    body: "It should sit just below the belly button with two fingers of room - no red marks.",
  },
  {
    n: "02",
    title: "Watch the leg cuffs",
    body: "Cuffs should be out, not tucked in. Gaps at the thighs are the #1 cause of leaks.",
  },
  {
    n: "03",
    title: "Size up when…",
    body: "You see marks, frequent leaks, or the tabs reach the edge. Babies often size up around 6-8kg.",
  },
];

export const FAQ_TOPICS = ["All", "Sizing", "Subscription", "Shipping", "Safety"] as const;
export type FaqTopic = (typeof FAQ_TOPICS)[number];

export type Faq = { topic: Exclude<FaqTopic, "All">; q: string; a: string };

/**
 * The site FAQ.
 *
 * A FUNCTION rather than a constant, because two of these answers quote numbers
 * the console owns — the free-shipping threshold and the subscription discount —
 * and as literals they went stale silently. `/subscription` promised 20% in the
 * copy while the box builder beside it rendered the console's 15%.
 *
 * Answers that quote nothing configurable are still plain strings; only the two
 * that make a promise interpolate.
 */
export function faqs({
  freeShipThreshold,
  subscribeSavePct,
}: {
  freeShipThreshold: number;
  subscribeSavePct: number;
}): Faq[] {
  return [
    {
      topic: "Sizing",
      q: "How do I choose the right size?",
      a: "Go by your baby’s weight, not age. NB fits up to 5kg, S 4-8kg, M 7-12kg, L 9-14kg and XL 12-17kg. If you see red marks the size is too small; gaps or sagging mean size up. Our size finder on the home page matches you in one tap.",
    },
    {
      topic: "Sizing",
      q: "My baby is between two sizes - what should I do?",
      a: "Choose the larger size for daytime movement and the snugger one for overnight leak protection. Most parents keep both on hand during a transition week.",
    },
    {
      topic: "Subscription",
      q: "How does the subscription work?",
      a: `Pick a size and pack, choose a delivery frequency, and we ship automatically while you save ${subscribeSavePct}%. Auto size-up moves your baby to the next size when the time comes. Skip, pause or cancel anytime from your account.`,
    },
    {
      topic: "Subscription",
      q: "Can I change my box before it ships?",
      a: "Yes - edit size, pack or delivery date up to 48 hours before dispatch from the Subscription tab in your account.",
    },
    {
      topic: "Shipping",
      q: "How fast is delivery and what does it cost?",
      a: `Standard delivery is free on orders over ${inr(freeShipThreshold)} and arrives in 3-5 business days across India. Orders placed before 2pm ship the same day.`,
    },
    {
      topic: "Shipping",
      q: "What is your returns policy?",
      a: "Unopened packs can be returned within 30 days for a full refund, no questions asked. If a pack arrives damaged, message our care team and we’ll replace it right away.",
    },
    {
      topic: "Safety",
      q: "Are Lumi9 diapers really chemical-free?",
      a: "They’re free from added lotions, fragrances, chlorine bleaching and common irritants. Every batch is dermatologist tested and clinically proven safe for sensitive newborn skin.",
    },
    {
      topic: "Safety",
      q: "Is the diaper biodegradable?",
      a: "The breathable backsheet is biodegradable and the packaging is recyclable. We’re steadily increasing the share of plant-based materials in every layer.",
    },
  ];
}

/* The journal now lives in `src/lib/journal.ts` - full articles with body,
   SEO metadata and FAQs, rather than the card-only stubs that used to sit
   here. Nothing else read them. */

export const LEGAL_SECTIONS = [
  {
    id: "collect",
    title: "What we collect",
    body: "We collect the details you provide when you create an account, place an order, or subscribe - your name, contact details, delivery address, and order history. We also collect basic device and usage data to keep the site secure and improve it.",
  },
  {
    id: "use",
    title: "How we use it",
    body: "Your information is used to process and deliver orders, manage subscriptions, respond to support requests, and - only if you opt in - send occasional product updates. We never sell your personal data to third parties.",
  },
  {
    id: "cookies",
    title: "Cookies",
    body: "We use essential cookies to run the cart and checkout, plus optional analytics cookies to understand what is working. You can control non-essential cookies from your browser settings at any time.",
  },
  {
    id: "rights",
    title: "Your rights",
    body: "You can access, correct, export, or delete your personal data at any time from your account or by contacting us. We retain order records only as long as required for tax and warranty purposes.",
  },
  {
    id: "terms",
    title: "Terms of sale",
    body: "Prices are listed in INR and include applicable taxes. Orders are subject to availability. Unopened packs may be returned within 30 days. Subscriptions can be skipped, paused, or cancelled anytime before the next dispatch. This is the summary; the full Terms & Conditions are at /terms.",
  },
];

export const LEGAL_UPDATED = "Last updated 17 February 2026";

/**
 * Terms & Conditions, in full.
 *
 * `LEGAL_SECTIONS` above carries a one-paragraph "Terms of sale" summary on the
 * privacy page; this is the actual document behind it, and /terms is what the
 * footer links to. Both exist on purpose - the summary is what a shopper reads
 * in passing, this is what she reads when something has gone wrong.
 *
 * Every number here is one the code actually enforces, and each is noted where
 * it comes from. A term that quotes a figure the system does not apply is worse
 * than no term at all: it is the version a customer will hold us to.
 *
 * Deliberately NOT a copy of Femi9's. Lumi9 is a separate business selling
 * different products under its own order sequence, and the footer used to hand
 * shoppers to femi9.in for this - a page that describes another company's
 * period-care returns policy to somebody who bought diapers.
 */
export const TERMS_SECTIONS = [
  {
    id: "who-we-are",
    title: "Who these terms are with",
    body: `These terms cover everything you buy from Lumi9 at lumi9.in. Lumi9 sells baby diapers and is operated from ${BRAND.fullAddress}. You can reach us at ${BRAND.email} or ${BRAND.phone}. Femi9 is a separate brand with its own storefront, its own accounts and its own terms - an order, a coupon or a creator code from one is not valid on the other.`,
  },
  {
    id: "orders",
    title: "Orders and acceptance",
    body: "Adding something to your cart does not reserve it. Your order is confirmed only once payment succeeds and you receive an order number beginning LM. Until then stock can sell out, and if it does we will tell you and refund you in full rather than substitute a size you did not choose.",
  },
  {
    id: "prices",
    title: "Prices, taxes and delivery charges",
    body: "Prices are in Indian rupees and include applicable taxes. What you pay is calculated by us, not by your browser: the cart and the checkout summary show the same figure the payment is taken for, including any delivery charge and any discount. Delivery charges depend on where the parcel is going, so the amount shown in your cart for your address is the amount that applies. Prices can change, but never after you have paid.",
  },
  {
    id: "payment",
    title: "Payment",
    body: "Payments are handled by Razorpay. We never see or store your card or UPI details. If a payment is taken but the order does not appear, it will reconcile automatically - and if it has not within a day, email us and we will resolve it.",
  },
  {
    id: "delivery",
    title: "Delivery",
    body: "We ship across India. Delivery estimates are estimates, not promises: once a parcel is with the courier its timing is theirs. Please check the packaging on arrival - if it reaches you damaged, tell us within 48 hours with a photo and we will replace it.",
  },
  {
    id: "returns",
    title: "Returns and refunds",
    body: "Unopened packs can be returned within 30 days of delivery for a full refund. Opened packs cannot be returned, because these are hygiene products - the exception is a manufacturing fault, which we will always replace or refund whether the pack is opened or not. Refunds go back to the method you paid with.",
  },
  {
    id: "subscriptions",
    title: "Subscriptions",
    body: "A subscription ships on the cadence you chose and renews at the subscription price, which is discounted against the one-off price. You can skip a delivery, pause, or cancel at any time before the next dispatch, from your account - there is no notice period and no cancellation fee. We charge each delivery as it is prepared, never in advance for the whole run.",
  },
  {
    id: "coupons",
    title: "Coupons",
    body: "A coupon works only on Lumi9, only while it is active, and only within any minimum-order, expiry or usage limit it carries. One coupon applies per order. A code is spent when the order it discounted is placed, so a cancelled order releases it back.",
  },
  {
    id: "creators",
    title: "The creator programme",
    body: "Approved creators earn 10% of the value of orders placed through their Lumi9 link, attributed for 30 days from the click. Applying does not approve you and does not issue a code - we review each application and email your code if it is approved. Codes attribute only on lumi9.in; a Lumi9 code earns nothing on Femi9, and a Femi9 code earns nothing here. We may suspend a code that is used in a way that misleads people about what Lumi9 is or does.",
  },
  {
    id: "accounts",
    title: "Your account",
    body: "You sign in with your mobile number, your email, or Google - there is no password to lose. Keep access to whichever you use, because anyone who has it can reach your order history and addresses. Tell us straight away if you think somebody else has.",
  },
  {
    id: "product-use",
    title: "Using the products",
    body: "Our diapers are dermatologist tested and made for everyday use, but every baby is different. Stop using a product and speak to your paediatrician if you see a reaction. Nothing on this site, including the parenting tools and the growth and vaccination trackers, is medical advice - they are guides, and your doctor is the authority.",
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: "We may update these terms. The version that applies to your order is the one published when you placed it, and the date above tells you when this version was published.",
  },
] as const;

export const TERMS_UPDATED = "Last updated 1 September 2026";

/* ACCOUNT_ORDERS, ACCOUNT_STATS and ACCOUNT_ADDRESSES lived here. All three were
   invented: every signed-in customer saw the same four delivered orders, was told
   they had placed 12 and saved Rs.2,940, and the sample addresses carried
   real-looking names and phone numbers. The account page reads getAccountData()
   instead - see components/account/AccountDashboard. */

export const FEATURE_IMAGES = {
  softness: { src: "/assets/features/softness-hd.webp", alt: "Softness that runs alongside every adventure" },
  gentleSteps: { src: "/assets/features/gentle-steps.webp", alt: "Gentle steps" },
  wetnessLock: { src: "/assets/features/wetness-lock.webp", alt: "Wetness lock technology" },
  happinessWrapped: { src: "/assets/features/happiness-wrapped.webp", alt: "Happiness wrapped in every big step" },
  softAsCotton: { src: "/assets/features/soft-as-cotton.webp", alt: "Soft as cotton, gentle as love" },
  soothingComfort: { src: "/assets/features/soothing-comfort.webp", alt: "Soothing comfort" },
  builtForBigStep: { src: "/assets/features/built-for-big-step.webp", alt: "Built for the big step" },
  perfectFit: { src: "/assets/features/perfect-fit.webp", alt: "Lumi9 size chart" },
};

/* ---------------------------------------------------------------------------
   Ported from the live storefront at lumi9.in - brand copy, not invented.
   --------------------------------------------------------------------------- */

/**
 * The five claims that run under the hero.
 *
 * `icon` keys into the stroke table in `components/home/FeatureStrip.tsx`
 * rather than carrying markup, so the copy stays a plain data file that a
 * non-engineer can edit without touching a component.
 */
export const FEATURE_STRIP = [
  { icon: "cloud", label: "Cloud-Soft Comfort" },
  { icon: "drop", label: "Up to 12hrs Absorption" },
  { icon: "shield", label: "Leakage Protection" },
  { icon: "air", label: "Breathable & Airy" },
  { icon: "leaf", label: "Eco Friendly Materials" },
] as const;

/**
 * Parent reviews, verbatim from lumi9.in's "Loved by Parents" grid.
 *
 * These are real submitted reviews, which is why none of them is a polished
 * marketing sentence - "doesn't feel bulky" and "perfect for active little
 * movers" are the kind of thing people actually write, and swapping them for
 * tidier copy would cost the section the only thing that makes it convincing.
 *
 * `initial` drives the avatar chip; `tone` picks its background so the grid
 * reads as a set of different people rather than one repeated swatch.
 */
export const PARENT_REVIEWS = [
  { name: "Aarthi K.", initial: "A", tone: "moss", quote: "Tried a few brands before. Lumi9 fits well and doesn’t feel bulky." },
  { name: "Lakshmi T.", initial: "L", tone: "gold", quote: "Finally found a diaper that keeps my baby happy and active." },
  { name: "Anitha R.", initial: "A", tone: "clay", quote: "As a mom, comfort matters most. Lumi9 gives my baby exactly that." },
  { name: "Deepika V.", initial: "D", tone: "sky", quote: "My baby smiles more, sleeps better, and stays comfortable longer." },
  { name: "Meera S.", initial: "M", tone: "plum", quote: "No leaks even through the night. This is the one my baby loves." },
  { name: "Sharmila N.", initial: "S", tone: "moss", quote: "Perfect for active little movers." },
  { name: "Harini V.", initial: "H", tone: "gold", quote: "My baby’s skin is quite sensitive. Lumi9 has been gentle and rash-free for us." },
  { name: "Pavithra N.", initial: "P", tone: "clay", quote: "As a first-time mom, finding the right diaper was stressful. Lumi9 made it easy." },
] as const;

/**
 * Launch offer shown on pack cards. **OFF, and it must stay off until a server
 * charges it.**
 *
 * ── Why this is null ────────────────────────────────────────────────────────
 * It was `{ percent: 10 }`, and nothing on the server had ever heard of it.
 * `getCart` prices a line with `applyZonePrice(...)` and `placeOrder` prices it
 * the same way; neither reads this module, and no console field sets it. So the
 * home page — the site's main buying surface — led every pack card with the
 * discounted number, struck the real price through beside it, and stamped a
 * "10% off" badge on it, while the drawer, /shop, the PDP, the Product JSON-LD
 * and Razorpay all used the real one.
 *
 *   home card:  ₹404   ~~₹449~~   10% off
 *   charged:    ₹449
 *
 * Every pack, ~10% below what is taken from the card, with a badge asserting the
 * difference is a discount. That is not a rendering bug to tidy up later; it is
 * a price advertised and not honoured, on all five products.
 *
 * The comment that used to sit here said the derivation guaranteed the card
 * "cannot drift out of step with what the server actually charges at checkout".
 * The reasoning was sound about the STRIKE-THROUGH — that number is derived, so
 * the two on the card agree — and it never applied to the third number, which is
 * the only one that matters: what the gateway takes.
 *
 * ── Turning it back on ──────────────────────────────────────────────────────
 * Do NOT just set a percent here. A discount has to exist where money is
 * computed, or this comes straight back. Two mechanisms already exist and both
 * are console-editable:
 *
 *   • drop `basePrice` / the variant prices in `/lumi9/products` — the storefront
 *     and the gateway both follow within the request, no rebuild;
 *   • or create a coupon in `/lumi9/coupons`, which `quoteCart` and `placeOrder`
 *     already validate and claim.
 *
 * If a badge is genuinely wanted on top of one of those, the percentage has to
 * ride on `CatalogPayload` from the server that applied it — the way
 * `subscribeSavePct` does — never from this file.
 */
export const LAUNCH_OFFER: { percent: number; label: string } | null = null;
