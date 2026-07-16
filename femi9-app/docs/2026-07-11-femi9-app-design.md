# femi9 App — Design Spec (v1)

_Date: 2026-07-11 · Owner: femi9.in · Format: native mobile app (designed in Pencil)_

## 1. What we're building

A mobile companion app for **femi9**, an organic period-care pad brand. It is a
**product-led fusion** of four pillars, in the spirit of Flo but re-shaped for a
product brand and an India-first, shame-free audience:

1. **Cycle tracker & predictions** — the daily habit / hook
2. **Wellness & awareness programs** — guided multi-day journeys (the mission)
3. **Community** — a moderated, safe topic feed (the retention loop)
4. **Shop & subscribe (pads)** — femi9 pads, cycle-synced subscription (the spine)

**North star:** all three non-commerce pillars exist to feed a product-led spine.
The tracker predicts your period; the app makes sure femi9 pads arrive before it.

**Audience (confirmed):** India-first young women & girls. Indian names in mock
content, ₹ pricing, India-relevant awareness topics (PCOS, first-period stigma,
hygiene). Warm, supportive, awareness-forward. Explicitly NOT Flo's
fertility/partner/NSFW framing.

**Design frame (confirmed):** iPhone 390×844 (Dynamic-Island status bar). Android
adaptation is a later pass.

## 2. Navigation & the product-led spine

Bottom tab bar, 5 tabs:

| Today | Learn | Circle | Shop | Me |
|-------|-------|--------|------|-----|
| tracker home | awareness programs | community | pads | profile |

Tab labels are placeholders (Learn/Circle can change).

The "product-led" spine is woven in, not bolted on:
- **Today** shows a spine card under the prediction: _"Next period in 6 days —
  your femi9 pack ships in 2 days · Reorder"_. Prediction literally drives product.
- **Onboarding** ends on a pad match + cycle-synced subscription offer.
- **Learn** & **Circle** contextually surface the right pad (heavy nights → Overnight).

## 3. Design system — inherited from the femi9 web app

Do not invent a new look. Inherit the locked web system and make it mobile-native.

**Type:** Kanit (300 body / 500 medium / 600 headings). Tight tracking (-.02em heads).

**Palette (tokens):**
- Surfaces: cream `#FFFCF4`, cream-2 `#FBF3DF`, butter `#FFF1C6`, butter-soft `#FFF8E1`,
  sage-tint `#EAF3EE`, lilac-tint `#F2ECF9`
- **Accent (locked — every CTA):** Solar Harvest yellow `#FDB817`, deep `#EBA200`
- Dark panel: forest `#013F2D`, forest-2 `#015E43`
- Ink: navy `#0B2A5B` (headings), ink `#23324c` (body), muted `#5c6a83`
- Support tints: sage `#7FB69B`, lilac `#C9AEE4`

**Cycle-phase colors (semantic, always labelled):**
- period `#C85C79` · predicted `#E4A9B8` · fertile `#7FD0C8` · ovulation `#0E9E94` · PMS `#E7B85C`

**Shape:** cards 26px radius, images 20px, pills 999px. Soft layered shadows.

**Mobile adaptations:** min 44px touch targets; larger base type (16–17px);
bottom-nav + safe-area padding; full-width cards with 18–20px side gutters;
bottom sheets for logging & day detail; thumb-reachable primary actions.

## 4. Screen map (v1)

**Onboarding (product-led)**
1. Welcome / value promise
2. Cycle setup — last period date + typical length
3. About you — age/stage, goals, main symptoms
4. **Pad match + subscription offer** ★
5. Notifications + done

**Today (tracker)**
6. Home — week strip, prediction hero, quick-log, phase insight cards, spine card ★
7. Calendar (month) + day-detail bottom sheet
8. Log flow — flow / symptoms / mood ★
9. Cycle & prediction detail

**Learn (awareness programs)**
10. Programs hub — enrolled + browse ★
11. Program detail — multi-day journey + progress ring ★
12. Lesson / day screen — content + mark done

**Circle (community)**
13. Feed — topic tabs, moderated ★
14. Post detail + replies
15. Compose post

**Shop (pads)**
16. Shop home — femi9 range ★
17. Product detail (mirrors web PDP)
18. Cart → checkout
19. Subscription management — cycle-synced cadence ★

**Me**
20. Profile — cycle stats, streaks, program badges
21. Orders & subscription
22. Settings

★ = Phase 1 spine screen.

## 5. Build phases

- **Phase 1 — clickable spine (8 screens):** 4, 6, 8, 10, 11, 13, 16, 19.
  One flagship per pillar + the product moment. A coherent end-to-end walkthrough.
- **Phase 2 — depth:** remaining onboarding, calendar, cycle detail, post detail,
  compose, PDP, checkout, lesson, profile, orders, settings.

## 6. Core component patterns (mobile)

- Bottom tab bar (5, active = navy icon + label, inactive muted)
- Week strip with phase-colored day dots + TODAY marker
- Prediction hero (one dominant headline, e.g. "Ovulation in 13 days")
- Quick-log row: 3 circular actions (Log period / Symptoms / Mood)
- Insight card carousel (swipeable, tinted cards)
- Spine card (prediction → product nudge, yellow CTA)
- Program card + circular progress ring
- Community post card (anon handle, topic tag, like/reply)
- Product card + subscription cadence selector
- Bottom sheets (log, day detail)

## 7. Content & tone

Warm, plain-spoken, shame-free, India-aware. Awareness-led (myths, hygiene, PCOS,
first period). Avoid clinical coldness and avoid Flo's sexual-pleasure/conception
emphasis. Community is moderated and supportive by design.

## 8. Out of scope (v1)

Partner linking; AI "assistant" message threads (consider v2); real backend/auth
(this is a design prototype in Pencil, using realistic mock content).

## 9. Reusable assets from the web app

- Real cycle-prediction math (avg cycle, confidence %, fertile/PMS windows) — mirror the outputs
- `CycleCalendar` phase logic + phase color set
- Existing PDP structure, product catalog, and brand copy/voice
