# femi9 — Complete Mobile App Design Prompt

_Paste this whole file into Pencil (pencil.dev). It is fully self-contained:
brand system, navigation, components, every screen, and real mock content._

---
1q1₹
## 0. WHAT TO BUILD

Design a premium, mobile-native app for **femi9** — an organic period-care pad
brand from India (femi9.in). The app is a **product-led fusion** of four things,
in the spirit of the Flo app but warmer, India-first, and shame-free:

1. **Cycle tracker & predictions** — the daily habit
2. **Wellness & awareness programs** — guided, multi-day journeys
3. **Community** — a moderated, safe topic feed
4. **Shop & subscribe** — femi9 pads, delivered synced to your predicted period

The difference from Flo: Flo is a tracker that shows ads. **femi9 is a product
brand whose tracker makes sure your pads arrive before your period.** Do NOT copy
Flo's fertility / conception / partner / sexual-pleasure framing. This app is
about period *care, awareness, and confidence*.

Design **one screen at a time, fully finished**, no placeholders, using the real
mock content in this brief.

## 1. PLATFORM & FRAME

- **iPhone, 390 × 844 pt** artboards, Dynamic-Island status bar.
- Each screen = a full 390×844 frame with: status bar zone (time 9:41, signal,
  battery), the screen content, and — where applicable — the bottom tab bar.
- Respect safe areas: ~44px top inset, ~34px bottom home-indicator inset.

## 2. BRAND SYSTEM — inherit exactly, do not invent a new look

**Typeface:** Kanit. Weights: 300 (body), 500 (medium/labels), 600 (headings).
Headings tight tracking (-0.02em), line-height ~1.05. Body line-height ~1.5.

**Color tokens (exact hex):**
- Surfaces: cream `#FFFCF4` (app base), cream-2 `#FBF3DF`, butter `#FFF1C6`,
  butter-soft `#FFF8E1`, sage-tint `#EAF3EE`, lilac-tint `#F2ECF9`
- **Accent — LOCKED. Every primary CTA is this yellow:** `#FDB817`, pressed
  `#EBA200`. CTA text sits in navy `#0B2A5B`. Never use a second color for CTAs.
- Dark panel: forest `#013F2D` / `#015E43`, text on it `#FFF9EA`
- Ink: headings navy `#0B2A5B`, body `#23324c`, muted `#5c6a83`
- Hairlines: `rgba(11,42,91,.12)`
- Support tints: sage `#7FB69B`, lilac `#C9AEE4`

**Cycle-phase colors (always paired with a text label, never color-only):**
- Period `#C85C79` · Predicted period `#E4A9B8` · Fertile window `#7FD0C8`
  · Ovulation `#0E9E94` · PMS/luteal `#E7B85C`

**Shape:** card radius 26px · image radius 20px · pills/chips 999px.
**Shadow:** soft & layered only, e.g. `0 26px 60px -30px rgba(11,42,91,.42)`.
Yellow CTA glow: `0 20px 44px -20px rgba(237,162,0,.55)`. Never hard/black shadows.
**Spacing:** 20px side gutters, 16–24px vertical rhythm, generous whitespace.

**Mobile rules:** min 44px touch targets · base type 16–17px · full-width cards ·
primary action thumb-reachable · use bottom sheets for logging & detail · one
dominant element per screen (don't compete).

## 3. GLOBAL CHROME

**Status bar:** 9:41 left, signal/wifi/battery right, tinted to match the screen's
background.

**Bottom tab bar** (on Today, Learn, Circle, Shop, Me — NOT on onboarding, logging,
or detail screens): cream background, hairline top border, 5 items:
`Today · Learn · Circle · Shop · Me`, each an outline icon + tiny label.
Active item = navy filled icon + navy label; inactive = muted `#8592a8`.
- Today = calendar/drop icon · Learn = book/sparkle · Circle = chat/people ·
  Shop = bag · Me = person.

## 4. NAVIGATION / IA

5-tab bottom bar (above). The **product-led spine** shows up in two places:
(a) the **Today** screen has a card tying the prediction to a shipment
("your femi9 pack ships in 2 days"); (b) **onboarding** ends on a pad match +
subscription offer. Learn & Circle can contextually surface the right pad.

## 5. VOICE & CONTENT — India-first

Warm, plain-spoken, encouraging, shame-free. Awareness-led (myths, hygiene, PCOS,
first period). No clinical coldness, no fertility/partner framing. ₹ pricing shown
as `Rs.` (e.g. `Rs.225`). Indian names & context in all mock content.

**Sample name bank:** Aisha, Priya, Ananya, Meera, Sneha, Diya, Kavya, Riya,
Fatima, Zoya, Ishita, Nandini. Community handles are gentle anon aliases:
`quiet_lotus`, `moonchild`, `peony23`, `sunflower_s`, `anon rose`.

**Cycle sample data (use consistently across all tracker screens):**
- 28-day average cycle, 5-day period, **prediction confidence 94%**
- Today = cycle day 10 · **next period in 6 days** · **ovulation in 13 days**
- Fertile window and PMS/luteal shown as colored ranges on the calendar
- Symptoms to offer: cramps, headache, bloating, acne, tender breasts, fatigue,
  backache, cravings. Moods: calm, happy, sensitive, irritable, low, anxious,
  energetic. Flow levels: light · medium · heavy.

**Real femi9 products (use these exact items & prices):**
- **330mm Double Wings** — Rs.225 — 9 pads · 330mm — Heavy · Night + Day —
  tag *Bestseller*
- **290mm Large** — Rs.198 — 9 pads · 290mm — Regular · Everyday
- **330mm Centre Wings** — Rs.225 — 9 pads · 330mm — Heavy · Night
- **290mm Starter** — Rs.72 — 3 pads · 290mm — tag *Trial pack*
- Free shipping over Rs.999. Organic cotton, rash-free, biodegradable messaging.

**Programs (for Learn):** "First Period 101", "21-Day Cycle Sync",
"PCOS Basics", "Bust the Period Myths", "Pain-Free Periods", "Iron & You".

**Community topics/tags:** Cramps · PCOS · First Period · Irregular Cycles ·
Hygiene · Mood · Products · Nutrition.

## 6. REUSABLE COMPONENTS (build once, reuse identically everywhere)

1. **Week strip** — 7 day-circles (S M T W T F S), period days filled in period
   pink, today ringed, phase dots under fertile/ovulation/PMS days.
2. **Prediction hero** — one big headline ("Next period in 6 days") + a soft
   sub-line + a subtle organic blob/gradient background in cream/butter.
3. **Quick-log row** — 3 circular buttons: Log period (pink), Symptoms (+), Mood.
4. **Insight card carousel** — swipeable tinted cards (butter, sage-tint,
   lilac-tint, forest) each with a title + one line.
5. **Spine card** — prediction→product: "Next period in 6 days · your femi9 pack
   ships in 2 days" with a yellow "Track order / Reorder" CTA.
6. **Program card** — thumbnail, title, "Day 3 of 21", circular progress ring.
7. **Community post card** — anon avatar + handle + time, body text, topic chip,
   like / reply / share row.
8. **Product card** — pad image, name, meta (9 pads · 330mm), flow line, price,
   tag pill (Bestseller/Trial), yellow "Add" button.
9. **Subscription cadence selector** — segmented control (Every cycle / 4 weeks /
   6 weeks), next-delivery date tied to the prediction.
10. **Bottom sheet** — rounded-top sheet for logging & day-detail.

## 7. SCREENS — full set (★ = build these 8 first)

### Onboarding (product-led)
- **O1 Welcome** — femi9 wordmark, warm hero line ("Period care that actually
  cares."), 1-line promise, yellow "Get started", text "I already have an account".
- **O2 Cycle setup** — "When did your last period start?" mini month picker +
  "How long is your cycle usually?" stepper (default 28). Progress dots 1/4.
- **O3 About you** — age band chips, goals multi-select (Track my cycle · Learn
  about my body · Fewer leaks/rashes · Manage PCOS), symptom chips.
- **★O4 Pad match + subscription** — "Based on your flow, we recommend **330mm
  Double Wings**." Product hero, cadence selector defaulting to "Every cycle —
  arrives 3 days before your period," price Rs.225, yellow "Start subscription",
  muted "Maybe later".
- **O5 Notifications + done** — friendly ask to enable reminders; "You're all set,
  Priya" success state → enters Today.

### Today (tracker)  — active tab: Today
- **★T1 Home** — status bar; greeting "Hi Priya"; **week strip**; **prediction
  hero** "Next period in 6 days" with sub "Cycle day 10 · 94% confident";
  **quick-log row**; **spine card**; "My daily insights" **carousel** (e.g.
  "You're in your follicular phase", "Cramps? Try a warm compress", "Cycle: 28
  days"); bottom tab bar.
- **T2 Calendar** — month grid with phase-colored days (period, predicted,
  fertile, ovulation, PMS), today ringed, legend, "Edit period dates" pill; tap a
  day opens **T3**.
- **T3 Day detail (bottom sheet)** — "Jul 11 · Cycle day 10", logged symptoms &
  mood summary, "+ Add" to log.
- **★T4 Log flow (bottom sheet/full)** — segmented Flow (light/medium/heavy),
  Symptoms grid (chips), Mood chips, optional note, yellow "Save".
- **T5 Cycle & prediction detail** — avg cycle 28d, avg period 5d, confidence
  94%, a simple ring/timeline of the current cycle's phases, "why predictions can
  shift" note.

### Learn (awareness programs) — active tab: Learn
- **★L1 Programs hub** — "Continue" row (enrolled program with progress ring, e.g.
  "21-Day Cycle Sync · Day 3"); "Explore" grid of program cards (First Period 101,
  PCOS Basics, Bust the Period Myths, Pain-Free Periods, Iron & You); a small
  "myth of the day" card.
- **★L2 Program detail** — hero image + title + "21 days · 5 min a day",
  enroll/continue yellow CTA, day-list with completed checks + progress ring, a
  contextual pad tie-in card ("heavy nights this week? 330mm Double Wings").
- **L3 Lesson / day** — day title, readable content block (short paragraphs +
  image), key takeaway callout, "Mark as done" yellow CTA, next-day preview.

### Circle (community) — active tab: Circle
- **★C1 Feed** — search + notification bell; topic tabs (Popular · Following ·
  For you) + scrollable topic chips (Cramps, PCOS, First Period…); moderated
  **post cards** with realistic supportive posts (e.g. "First period at 11 for my
  little sister — how do I explain it kindly?" · topic *First Period*); floating
  "+ New post" pill; a subtle "Be kind — this space is moderated 💛" banner.
- **C2 Post detail** — full post, reactions, threaded supportive replies, reply
  composer, report/■ menu.
- **C3 Compose post** — topic picker, text area, "Post anonymously" toggle (on by
  default), yellow "Post".

### Shop (pads) — active tab: Shop
- **★S1 Shop home** — subscription banner ("Never run out — subscribe & save"),
  product grid using the 4 real products with prices & tags, "Free shipping over
  Rs.999" strip, organic-cotton trust row (rash-free · biodegradable · pH-safe).
- **S2 Product detail** — image gallery, name, price, meta/flow, benefits,
  quantity, "Add to cart" (yellow) + "Subscribe" secondary, reviews snippet.
- **S3 Cart → checkout** — line items, subtotal, free-ship progress, address,
  pay, place order.
- **★S4 Subscription management** — active plan "330mm Double Wings · every cycle",
  **next delivery date tied to the prediction** ("ships Jul 12, before your Jul 15
  period"), cadence selector, skip / pause / reorder, delivery history.

### Me — active tab: Me
- **M1 Profile** — avatar + name, cycle stats (avg 28d, tracked 6 cycles),
  streak, earned program badges, quick links.
- **M2 Orders & subscription** — order history, active subscription card.
- **M3 Settings** — account, reminders, privacy, help, log out.

## 8. BUILD ORDER

**Phase 1 — the clickable spine (8 screens):** O4 · T1 · T4 · L1 · L2 · C1 · S1 ·
S4. One flagship per pillar + the product moment; a coherent walkthrough of the
whole idea. **Phase 2 — depth:** everything else above.

## 9. CONSISTENCY RULES

- Identical tab bar, card radii, and yellow CTA on every screen — the set must
  read as ONE app.
- One dominant element per screen. Generous whitespace. Kanit everywhere.
- Yellow is ONLY for primary CTAs. Phase colors ONLY for cycle states, always
  labeled. Forest panels used sparingly for emphasis.
- Realistic India-first mock content throughout — never lorem ipsum, never
  "Product 1".
