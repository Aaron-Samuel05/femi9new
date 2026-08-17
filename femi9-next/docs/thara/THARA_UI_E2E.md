# Femi9 Thara — end-to-end UI design brief

> **Purpose:** a complete brief for designing the Thara interface.
> **Scope:** the Thara programme and its UI only.
>
> **This document is the whole input.** Nothing is attached — no code, no screenshots, no stylesheet. Every colour, value, rule, screen, state and copy string you need is written out below. If something is not in here, it is not a constraint.

---

## 0. How to use this document

This is a **redesign brief**. The current Thara page works and its structure is sound, but it was built before the Femi9 visual system settled and it does not match the rest of the storefront. You are expected to change how it looks. You are **not** free to change:

- any number, rule, threshold or state (§3, §4)
- the brand palette or typefaces (§7, §8)
- the copy principles (§10)

**The single most important rule here:** every rupee figure, percentage and slab boundary shown to the customer is supplied by the server at runtime. Never bake "₹3,000" or "10%" into a component as a literal. The programme is tunable by the business team, and copy that hardcodes a slab will start lying to customers the day it is retuned. Design every number as a slot to be filled.

---

## 1. What Thara is, in one paragraph

Thara is Femi9's opt-in **customer referral and loyalty club**. A registered customer joins for free, places one qualifying order, and from then on earns three stacked benefits: a standing discount on her own orders, store credit every time a friend buys through her link, and a quarterly Amazon voucher on top. Her friends do not need to join — they just shop normally. It is deliberately **single-level**: she earns on the people she refers, and on nobody beneath them. There is no cascade, no downline-of-a-downline, no MLM.

The name to use in the interface is **Thara**, or **Femi9 Thara**. Never "the Thara Model" — that is the internal project name.

---

## 2. The shape of it — three steps

The whole programme reduces to three steps, and the UI's primary job is to teach them in this order. This ordering is the spine of the page.

```
  1. JOIN                    2. UNLOCK                     3. SHARE & EARN
  ─────────                  ──────────                    ────────────────
  Free, one tap.             Place ONE order of            Send your link.
  You get your own           ₹3,000 or more.               Every friend who buys
  referral link              That single order             earns you money and
  immediately.               switches earning on.          points.
```

Step two is where every support question comes from, so it carries the most design weight. Two things must be impossible to miss:

- **It is one single order, not a running total.** Two ₹1,500 orders never unlock the programme. One ₹3,000 order does.
- **The qualifying order itself pays full price.** It is what unlocks you; the discount starts on the order *after* it.

---

## 3. The rules, complete

Defaults are shown so you can design against realistic values. Treat each as a slot, not a literal.

### 3.1 Unlocking

| Rule | Default |
|---|---|
| Minimum qualifying order | ₹3,000 |
| Measured on | the **biggest single paid order**, never the sum |
| Does the qualifying order get a discount? | **No.** It pays full price. |
| Backdated? | **Yes.** If she already had a qualifying order before joining, she unlocks the moment she joins. |

### 3.2 Benefit 1 — her own discount

Applies to the member's own orders once she is unlocked. Slab-based on order **subtotal** (before shipping).

| Order subtotal | Discount |
|---|---:|
| under ₹3,000 | none |
| ₹3,000 – ₹5,999 | **10%** |
| ₹6,000 – ₹8,999 | **15%** |
| ₹9,000 and above | **20%** |

The slab list arrives as an **array of unknown length**. Design it as a repeating row, not as a fixed set of three. The final slab has no upper bound and reads "and above".

**No stacking with coupons.** At checkout the system applies whichever saves her more — the Thara discount *or* the promo code, never both. State this plainly wherever the discount is explained.

### 3.3 Benefit 2 — referral commission

| Rule | Default |
|---|---|
| Rate | **10%** of the friend's order subtotal |
| Paid as | **Femi9 store credit** — not cash |
| Minimum friend order | **none.** A ₹500 order earns ₹50. |
| How it is spent | applied automatically at her next checkout |
| Expiry | none |
| Withdrawable to bank / UPI? | **No.** Store credit only. |

The UI must never imply this is withdrawable money. Call it **"Femi9 money"** or **"store credit"**, and say it comes off her next order.

### 3.4 Benefit 3 — points into an Amazon voucher

| Rule | Default |
|---|---|
| Points rate | **1%** of the friend's order subtotal |
| Voucher value | points **× 3** rupees |
| Cycle | fixed calendar quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec) |
| Claim window | **30 days** from issue, then it expires |
| Voucher type | a real Amazon gift code |

Points are **not spendable**. They only become value at cycle close. That distinction confuses people, and the UI has to carry it.

### 3.5 The worked example

The page must include a live worked example. It is the single most effective explainer available:

```
Your friend spends              ₹3,000
You get Femi9 money             ₹300
You also collect points         30 points
Those points become a voucher   ₹90 Amazon
```

Follow it with the scaling line: *"That is one friend, one order. Ten friends doing the same is ten times as much."*

### 3.6 Refunds

If a friend returns an order, the money earned on it is taken back — a full refund reverses fully, a partial refund reverses proportionally. The balance can go negative if she already spent it. The FAQ must cover this; do not bury it.

---

## 4. Membership states — the five faces of the page

Design **all five**. The customer-facing labels below are good; keep their spirit.

| State | Customer-facing label | What the page must convey |
|---|---|---|
| *not joined* | — | Teach the programme, end in a **Join** button. |
| *joined, not unlocked* | "Joined - not unlocked yet" | You're in. One ₹3,000 order switches earning on. **Show the unlock meter.** |
| *unlocked* | "Unlocked - you are earning" | Link is live. Show earnings, points, vouchers. |
| *paused by staff* | "Paused by our team" | Earning paused during review. **Anything already earned is safe.** |
| *left the programme* | "You left the programme" | Terminal. Credit already earned stays. **No rejoining.** Hide the leave block entirely. |

**Never render an internal status token.** The system's word for "joined but not unlocked" is a database term; a customer must never see it.

### 4.1 The unlock meter

Shown only while she is joined-but-not-unlocked (never after she has left). It answers "I ordered twice, why is nothing unlocked?" — so it plots her **biggest single order** against the bar, and says so in words. Available values:

| Value | Meaning |
|---|---|
| required amount | the bar (₹3,000) |
| best order amount | her biggest single **paid** order |
| best order number | for "your order F9-1234 already qualifies" |
| paid order count | how many paid orders she has |
| qualified | yes / no |
| shortfall | how much more, **in a single order** |

Three distinct copy states, all required:

- **no orders yet** — "You have not placed an order yet."
- **qualified** — "Your order F9-1234 of ₹4,000 already qualifies. You are unlocked."
- **short** — "You have placed 2 orders. Your biggest one is ₹1,800, so you need **₹1,200 more in a single order**."

Always follow with the emphasis note: *orders are not added together.*

The meter fill needs a **visible minimum width** (around 3%) even at zero, so an empty track never reads as broken.

### 4.2 The join screen also shows progress

A shopper who has *already* placed a qualifying order but hasn't joined must be told so on the join screen: *"Good news - your ₹4,000 order already meets the ₹3,000 rule. Join now and you are unlocked immediately."* This is a real conversion moment and deserves prominence.

---

## 5. Screen inventory

### 5.1 The Thara page

Section order. The explainer is shown to **everyone** — a member who has forgotten how it works needs it as much as a newcomer.

**Not joined:**
1. Hero — eyebrow "Femi9 Thara", headline "Shop. Share. Earn.", lede, optional already-qualified note, **Join button**
2. How Thara works — three steps
3. What you get — three benefits + worked example
4. Your own discount — slab table
5. Questions people ask — FAQ
6. Closing "Ready?" block with a second **Join button**

**Joined:**
1. Hero — status label, contextual lede, **Femi9 money balance** metric
2. Three steps, with her current position marked
3. Unlock meter *(only while not yet unlocked)*
4. **Your link** — code, copy button, full URL, friend count
5. Email the link to a friend — one email field + send
6. What you get / slab table
7. Points this cycle — points so far + estimated voucher value
8. Amazon vouchers table *(only if any exist)*
9. Femi9 money history *(only if any rows)*
10. FAQ
11. Leaving the programme *(hidden once she has left)*

### 5.2 Entry points from the rest of the store

Three links lead here. They appear and disappear together, since the whole programme can be switched off per store.

| Surface | Label |
|---|---|
| Main navigation, secondary menu | "Thara" |
| Footer, EXPLORE column | "Thara programme" |
| Rewards panel | **"Refer a friend"** |

The "Refer a friend" control must carry **no points claim** — nothing awards loyalty points for a referral. Thara pays store credit, and the button must not promise otherwise.

### 5.3 The referral link

Format: **4 uppercase letters + 4 digits** — e.g. `TARA5578`. The alphabet deliberately excludes `I`, `L`, `O`, `0` and `1`, because these codes get read aloud and typed by hand. Design for that: **tabular or monospace, generously letter-spaced, large enough to read off a phone across a table.**

The full link looks like `https://femi9.in/r/TARA5578`.

The share block needs three things: the code itself, a **copy button** with a confirmed state, and the full URL as selectable text. Copying can fail — the browser clipboard is permission-gated and unavailable on insecure connections — so design a visible failure state: *"Copying is blocked in this browser - select the link below instead."* Never leave the button stuck on its idle label.

### 5.4 Admin

Staff need: headline metrics (members, referrals total and locked), a member table searchable by referral code or email, suspend / unsuspend controls, and a voucher list with manual Amazon-code entry. Same palette and type as the customer page, but denser and more utilitarian — this is a working tool, not a persuasion surface. Secondary to the customer work.

---

## 6. States the design must cover

The page loads its data in one request. Design for each outcome:

| Outcome | UI |
|---|---|
| loading | a calm loading state, not a layout jump |
| programme switched off for this store | *"The Thara Model isn't switched on for this store yet. Check back soon."* |
| not signed in | send her to sign-in, returning to Thara afterwards |
| signed in, not a member | join screen |
| member | dashboard |
| network failure | *"Could not load your Thara page. Please check your connection and try again."* |

Actions available: **join**, **invite a friend by email**, **claim a voucher**, **leave the programme**.

**Every action can fail with a real reason, and that reason must be shown.** Joining legitimately refuses a stale terms version and a previously-left account. A button that silently does nothing is the worst possible outcome. Give every action an inline error slot next to it.

Design four states for every async control: **idle → busy → success → error**. Labels like "Joining…", "Sending…", "Claiming…", "Copied ✓" are the right instinct.

---

## 7. Colour — the exact Femi9 palette

**These are the canonical brand values used across the Femi9 landing page and storefront.** The Thara UI must be built from these and nothing else. Token names are given so naming stays consistent.

### 7.1 Ink and text

| Token | Hex | Use |
|---|---|---|
| `--navy` | **`#34204E`** | deep plum. Headings, primary text, the darkest ink |
| `--ink` | **`#4B3E63`** | body copy |
| `--muted` | **`#877D9E`** | secondary and hint text, labels |
| `--line` | **`rgba(52, 32, 78, 0.13)`** | standard borders |
| `--line-soft` | **`rgba(52, 32, 78, 0.07)`** | subtle dividers |

### 7.2 Surfaces

| Token | Hex | Use |
|---|---|---|
| `--cream` | **`#FBF9FF`** | page background |
| `--cream-2` | **`#F2ECFB`** | secondary background band |
| `--surface` | **`#FDFCFA`** | card / panel surface — warm off-white, deliberately **not** pure white |
| `--butter` | **`#FBEFC8`** | warm highlight fill |
| `--butter-soft` | **`#FCF6E1`** | softest gold tint |
| `--sage-tint` | **`#EDE7F9`** | lavender tint *(the name is legacy; the colour is lavender)* |
| `--lilac-tint` | **`#F2ECF9`** | pale lilac tint |

### 7.3 Brand accent — the CTA colour

| Token | Hex | Use |
|---|---|---|
| `--yellow` | **`#F0C14E`** | **locked: every primary call to action is this golden yellow** |
| `--yellow-deep` | **`#D8A22F`** | hover / pressed / deep gold |

Primary buttons are gold `#F0C14E` with deep-plum `#3A2158` text, fully pill-shaped (`border-radius: 999px`), and carry a gold-tinted glow:

```css
background: #F0C14E;
color: #3A2158;
border: none;
border-radius: 999px;
box-shadow: 0 14px 30px -16px rgba(240, 193, 78, 0.72);
```

This button is site-wide. **Do not invent a different primary button for Thara.**

**One gold CTA per view.** On the join screen that is "Join Thara - free". On the member dashboard it is "Copy my link". Everything else is secondary or ghost.

### 7.4 Supporting brand colours

| Token | Hex | Use |
|---|---|---|
| `--forest` | **`#3A2158`** | deep plum — dark panels, navigation, gold-button text |
| `--forest-2` | **`#563184`** | plum-2, avatars |
| `--sage` | **`#B79BD8`** | soft lavender-purple *(legacy name)* |
| `--lilac` | **`#C9AEE4`** | lilac |
| brand green | **`#3F6B4F`** | success only |
| `--cr-focus` | **`#7A5BBF`** | focus ring |

### 7.5 Elevation and washes

Shadows are **multi-layer, low-opacity and tinted to the brand plum** — never a single hard drop shadow.

```css
--cr-shadow-xs:    0 1px 2px rgba(52,32,78,.05), 0 1px 3px rgba(52,32,78,.04);
--cr-shadow-sm:    0 2px 6px rgba(52,32,78,.06), 0 6px 14px rgba(52,32,78,.06);
--cr-shadow-md:    0 4px 12px rgba(52,32,78,.07), 0 14px 30px rgba(52,32,78,.09);
--cr-shadow-lg:    0 8px 20px rgba(52,32,78,.08), 0 26px 56px rgba(52,32,78,.13);
--cr-shadow-float: 0 34px 60px -24px rgba(52,32,78,.30);
```

Large surfaces take a **gradient wash**, not a flat fill:

```css
--cr-wash-lav:   linear-gradient(158deg, #F4ECFC 0%, #EFE6F9 55%, #F7F2FB 100%);
--cr-wash-cream: linear-gradient(160deg, #FDFAF4 0%, #FBF5EC 100%);
--cr-wash-navy:  linear-gradient(162deg, #3D2858 0%, #311F4B 62%, #34204E 100%);
--cr-hairline:   rgba(52, 32, 78, 0.09);
```

The hero should use the lavender wash; a dark feature panel uses the navy wash. Prefer the hairline over a hard 1px section rule.

### 7.6 Radius and motion

```css
--cr-r-xs: 10px;   --cr-r-sm: 14px;   --cr-r-md: 20px;
--cr-r-lg: 28px;   --cr-r-xl: 36px;   --cr-r-2xl: 44px;

--cr-ease:     cubic-bezier(0.22, 0.8, 0.28, 1);
--cr-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--cr-dur: 0.24s;   --cr-dur-lg: 0.5s;
```

Buttons are pills (`999px`). Cards sit at 28px. Hover lift is `translateY(-3px)`. One easing family throughout.

### 7.7 Semantic colours

The palette has no dedicated status ramp, so derive them and use them **sparingly** — status is the only place a non-brand hue is permitted.

| Meaning | Colour | Use |
|---|---|---|
| Success / unlocked / claimed | brand green **`#3F6B4F`** | completed step ticks, "you are unlocked" |
| Attention / pending | gold **`#F0C14E`** | current step, "awaiting code" |
| Error / expired / cancelled | a plum-leaning red, never a fire-engine red | error text, expired voucher pill |
| Neutral / later | muted **`#877D9E`** | future steps, inactive pills |

**Do not introduce a saturated indigo, a pure `#FF0000`, or any hue outside this system.**

---

## 8. Typography

| Surface | Family |
|---|---|
| Interface, body, forms | **Urbanist** |
| Display and section headings | **Instrument Sans** |
| Buttons | **Hanken Grotesk**, weight 700 |

Headings render at **weight 400, not bold** — the display face carries emphasis through size and letterform, not weight. Keep that restraint.

**All monetary values and point counts use tabular figures** (`font-variant-numeric: tabular-nums`). These sit in tables and update live; they must not jitter.

The Thara page must use Urbanist. It currently uses a generic system font stack, which is one of the defects to fix (§11).

---

## 9. Layout, responsive, accessibility

- Content column: keep it narrow — between **900px and 1080px** centred. Thara is a reading surface, not a wide marketing page.
- Breakpoints: **1180px, 900px, 620px**, and a narrow-phone range below 620px.
- **No horizontal page overflow at any viewport.** The page clips horizontal overflow, which means anything wider than the screen becomes *unreachable* rather than scrollable. The voucher and money-history tables each have five unwrappable column headers and will exceed a 360px phone — each **must** sit in its own horizontally scrollable container. Without that, the Status and Action columns are impossible to reach on a phone.
- The progress meter needs a proper progressbar role with min / max / current values and a label.
- Error messages need an assertive live-region role so they are announced.
- The email field should specify email type and input mode, autocomplete for email, autocapitalise off, autocorrect off, spellcheck off.
- Decorative icons are hidden from assistive technology.
- Focus ring uses **`#7A5BBF`** and must be visible on every interactive element.
- Respect reduced-motion preferences.
- Contrast: muted `#877D9E` on cream `#FBF9FF` is the weakest pairing in the system. Do not use it below 14px or for anything essential.

### 9.1 The destructive action

Leaving the programme is **terminal — rejoining is not possible**. It must:

- be a **ghost** button, never gold
- confirm with a **two-button inline step inside the card** — never a blocking browser dialog
- state the consequence *before* the click: leaving is permanent, earned credit stays, issued vouchers stay claimable until their deadline
- disappear entirely once she has already left

---

## 10. Copy rules

Every customer-facing string quoted in this document is production copy, written to fix real confusion from real support tickets. Use those strings as written, and match their voice for anything new.

- **Plain English, no jargon.** "Femi9 money", not "store credit ledger balance". Never an internal status token.
- **Teach before you report.** The explainer comes before the status line. The page previously opened straight into a ledger and taught nothing.
- **Real rupees everywhere.** Abstract percentages don't land; "your friend spends ₹3,000, you get ₹300" does.
- **Answer the objection in the copy**, not in a support ticket. The two big ones: *orders are not added together*, and *your first big order pays full price*.
- **Use hyphens, not em dashes, in customer-facing text.** This is an enforced house convention.
- Currency: `₹` with Indian digit grouping and no decimals — `₹1,20,000`, never `₹120,000.00`.
- Dates: `3 Sep 2026`.

### 10.1 The FAQ is required

Six questions, all driven by the live values:

1. **Do my friends have to join Thara too?** — No. They just shop with your link.
2. **Is the money real?** — Femi9 money comes off your next order; it cannot go to a bank or UPI. The Amazon voucher is a real gift code.
3. **I placed two orders. Why am I still locked?** — Orders are not added together.
4. **Does my first big order get the discount?** — No. That order is what unlocks you.
5. **When does my Amazon voucher arrive?** — At the end of each three-month cycle; then you have 30 days to claim it.
6. **What if my friend returns their order?** — The money earned on it is taken back.

---

## 11. Known defects the redesign must fix

The page that exists today drifted away from the brand system listed above. You are not expected to have seen it — each defect below names the exact wrong value and the correct one, so this reads as a to-do list on its own.

| # | Problem | Fix |
|---|---|---|
| 1 | **Wrong typeface.** The page falls back to a generic system stack, so it renders in a different font from the entire rest of the site. | Urbanist for interface, Instrument Sans for display. |
| 2 | **Off-palette purple.** `#7F6EB9` is used throughout for hint text. It is not a brand colour. | Use muted `#877D9E`. |
| 3 | **Foreign indigo.** `#5B3FDA` appears in several places. Saturated indigo exists nowhere else in the system. | Use plum-2 `#563184` or focus `#7A5BBF`. |
| 4 | **Ad-hoc greys.** `#E4DFEE`, `#EDE9F4`, `#DDD5EE`, `#FCFBFE`, `#EFEBFF` are one-off lavender greys. | Use the line, surface and lilac-tint tokens. |
| 5 | **Off-brand green.** `#3D8B5C` and `#2F6E48` instead of the brand green. | Use `#3F6B4F`. |
| 6 | **Hard-edged slabs.** Cards use a flat fill, a 12px radius and a hard border — exactly the depthless look the design system exists to remove. | 28px radius, multi-layer plum-tinted shadow, lavender wash. |
| 7 | **No gold CTA treatment.** Buttons don't wear the site's pill shape and gold glow. | Adopt the standard gold primary button. |

Everything the page does *structurally* — the teaching order, the unlock meter, the three copy states, the table scrollers, the inline confirm — is correct and must survive the redesign.

---

## 12. Acceptance checklist

**Correctness**
- [ ] Every number on screen is a slot fed at runtime. No hardcoded rupee or percentage literals.
- [ ] The slab list repeats over an array of unknown length, not a fixed three rows.
- [ ] All five membership states are designed, including paused and left.
- [ ] No internal status token is ever rendered.
- [ ] The unlock meter shows the **biggest single order** and says orders don't add up.
- [ ] The join screen tells an already-qualified shopper she'll unlock immediately.

**States**
- [ ] Loading, programme-off, signed-out and network-error states all exist.
- [ ] Every action has idle / busy / success / error, with the real reason surfaced.
- [ ] Copy-link has a visible failure state.

**Brand**
- [ ] Urbanist for interface, Instrument Sans for display. No system font stack.
- [ ] Every colour comes from §7. No `#7F6EB9`, no `#5B3FDA`.
- [ ] Exactly one gold `#F0C14E` primary CTA per view; leaving is a ghost button.
- [ ] Cards use a 28px radius and a multi-layer plum-tinted shadow, not a hard border.
- [ ] Monetary figures use tabular numerals.

**Responsive & accessibility**
- [ ] No horizontal page overflow at 1180 / 900 / 620 / 360px.
- [ ] Both tables sit in their own horizontal scroller; Status and Action reachable at 360px.
- [ ] Progressbar and alert roles present; decorative icons hidden; `#7A5BBF` focus ring visible.
- [ ] Leaving confirms inline with two buttons; no blocking browser dialog.

**Copy**
- [ ] Hyphens, not em dashes, in customer-facing text.
- [ ] `₹` with Indian grouping and no decimals; dates as `3 Sep 2026`.
- [ ] All six FAQ answers present and value-driven.
