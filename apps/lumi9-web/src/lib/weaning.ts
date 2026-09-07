/**
 * Starting solids, in the foods an Indian kitchen already cooks.
 *
 * Every global baby app answers this question with oatmeal, sweet potato and
 * jarred purée. A mother in Erode is making ragi kanji and pasi paruppu, and
 * being told to introduce "baby cereal" is being told nothing. So the stages
 * here are the WHO/IAP ones and the FOODS in them are what is actually in the
 * house — named the way she would say them, with the Tamil name beside the
 * English where the Tamil is the one she knows.
 *
 * Two things this module is careful about.
 *
 * **The AVOID list is not advice, it is safety**, and it is separated from the
 * stages for that reason. Honey before twelve months is infant botulism; a
 * whole grape is a choking death. Those do not belong in the same visual weight
 * as "try chikoo this month", and they are never hidden behind a stage a parent
 * has to be on to see.
 *
 * **Nothing here is a schedule.** Solids at six months is the recommendation;
 * everything after it is a range a baby moves through at their own pace, and
 * the copy says so. A tool that told a parent their eight-month-old was behind
 * on finger foods would do more harm than the tool does good.
 */

export type Food = {
  name: string;
  /** The Tamil name, where that is the one a parent would use. */
  local?: string;
  /** How it is given at this stage — the part that actually changes. */
  form: string;
  note?: string;
};

export type WeaningStage = {
  /** Inclusive lower bound in months. */
  fromMonth: number;
  label: string;
  /** The one thing that changes between stages. */
  texture: string;
  meals: string;
  /** What this stage is FOR, in a sentence. */
  intro: string;
  newFoods: Food[];
  tip: string;
};

export const WEANING_STAGES: WeaningStage[] = [
  {
    fromMonth: 0,
    label: "Before 6 months",
    texture: "Milk only",
    meals: "On demand",
    intro:
      "Nothing but breastmilk or formula - not water, not juice, not a taste of rice. A baby's gut and kidneys are not ready, and solids before six months displace the milk that is still doing all the work.",
    newFoods: [],
    tip: "Readiness is sitting with support, holding the head steady, and reaching for food. Age is the guide; those three are the signal.",
  },
  {
    fromMonth: 6,
    label: "6 months - first tastes",
    texture: "Smooth, thin - it should pour off the spoon",
    meals: "1-2 a day, starting at 2-3 spoons",
    intro:
      "The first month is practice, not nutrition. Milk is still the main food and will be for months; what is being learned here is the spoon, the sitting, and the swallowing.",
    newFoods: [
      { name: "Ragi", local: "kezhvaragu", form: "kanji, thin", note: "Sprouted and roasted digests easiest. The classic first food, and high in calcium and iron." },
      { name: "Rice", local: "arisi", form: "kanji, well cooked and mashed" },
      { name: "Moong dal", local: "pasi paruppu", form: "boiled soft, mashed with its water" },
      { name: "Banana", local: "vazhaipazham", form: "mashed ripe, nothing added" },
      { name: "Apple", form: "steamed, then mashed", note: "Raw apple is too hard at this stage." },
      { name: "Carrot", form: "steamed and puréed" },
      { name: "Pumpkin", local: "parangikai", form: "steamed and mashed" },
      { name: "Potato / sweet potato", form: "boiled and mashed" },
    ],
    tip: "One new food at a time, then the same food for 3 days before the next. If something disagrees you will know which thing it was.",
  },
  {
    fromMonth: 7,
    label: "7-8 months - thicker, and more of it",
    texture: "Mashed with lumps - not smooth any more",
    meals: "2-3 a day",
    intro:
      "Lumps matter. A baby kept on smooth purée past eight months often refuses texture later, and this is the window where chewing is learned - with or without teeth.",
    newFoods: [
      { name: "Kambu", local: "pearl millet", form: "porridge, well cooked", note: "Warming and iron-rich. Traditionally given from around now." },
      { name: "Thinai", local: "foxtail millet", form: "kanji or soft upma" },
      { name: "Samai", local: "little millet", form: "cooked soft like rice" },
      { name: "Khichdi", form: "rice and moong dal cooked together, mashed", note: "The whole meal in one pot - grain and dal together make a complete protein." },
      { name: "Curd", local: "thayir", form: "plain, unsweetened", note: "Yoghurt is fine well before cow's milk as a drink is." },
      { name: "Ghee", form: "a few drops stirred in", note: "Calories a small stomach needs, and it carries the fat-soluble vitamins." },
      { name: "Idli", form: "steamed soft, mashed in milk or dal water" },
      { name: "Egg yolk", form: "hard boiled, mashed", note: "An allergen - give it on its own on a day you are not trying anything else new." },
      { name: "Groundnut", local: "verkadalai", form: "thin smooth paste stirred into food", note: "NEVER whole or halved. Introducing it early lowers the chance of a peanut allergy; the whole nut is the choking risk." },
      { name: "Papaya, chikoo, avocado", form: "ripe, mashed" },
    ],
    tip: "Iron matters most from about six months, when what the baby was born with runs down. Millets, dal, egg yolk and meat are where it comes from.",
  },
  {
    fromMonth: 9,
    label: "9-11 months - feeding themselves",
    texture: "Soft finger foods and minced - things they can pick up",
    meals: "3 meals and 1-2 snacks",
    intro:
      "The point of this stage is the hands. Food that can be gripped, dropped, squashed and eventually eaten teaches more than a spoon does, and the mess is the lesson.",
    newFoods: [
      { name: "Idli / dosa", form: "cut into strips they can hold" },
      { name: "Chapati", form: "soaked soft in dal or milk" },
      { name: "Steamed vegetable sticks", form: "carrot, beans, cooked until they squash between your fingers" },
      { name: "Paneer", form: "small soft cubes" },
      { name: "Fish", local: "meen", form: "well cooked, flaked, every bone checked twice" },
      { name: "Chicken", form: "minced or shredded fine, cooked into dal or khichdi" },
      { name: "Whole egg", form: "well cooked", note: "Yolk and white now, once the yolk alone has gone fine." },
      { name: "Ragi laddu", form: "soft, no sugar or jaggery yet", note: "Sweeten with mashed banana or dates instead." },
    ],
    tip: "Gagging is loud and looks alarming; it is the reflex working. Choking is silent. Stay within reach, keep them sitting upright, and never feed a baby who is lying down or in a moving car.",
  },
  {
    fromMonth: 12,
    label: "12 months and on - family food",
    texture: "What the family eats, chopped small and going easy on chilli",
    meals: "3 meals and 2 snacks",
    intro:
      "They eat what you eat now. Take their portion out before the chilli goes in, keep salt light for the whole family rather than cooking twice, and let milk become a drink alongside food rather than the meal itself.",
    newFoods: [
      { name: "Cow's milk", form: "as a drink now, about 400-500 ml a day", note: "More than that fills them up and displaces the iron-rich food they need." },
      { name: "Sambar rice, curd rice", form: "mild, mashed lightly" },
      { name: "All the millets", form: "as roti, dosa, upma, porridge" },
      { name: "Honey", form: "now safe", note: "Not one drop before twelve months." },
      { name: "Jaggery", local: "vellam", form: "sparingly", note: "Better than white sugar, still sugar." },
    ],
    tip: "Appetite falls off in the second year and it is meant to. Growth slows, and a toddler who eats well one day and almost nothing the next is a normal toddler.",
  },
];

export type Avoid = {
  what: string;
  /**
   * The COMPLETE phrase, not a fragment the view prefixes with "until".
   *
   * It was `until: string`, rendered as `until {until}` — which worked for
   * "12 months" and produced "until As long as you can manage" for the one
   * entry that is not a deadline. A field that only reads correctly for some of
   * its values is the view's grammar leaking into the data.
   */
  when: string;
  why: string;
  /** Choking risks read differently from allergy or organ-maturity ones. */
  severity: "danger" | "caution";
};

/**
 * Never behind a stage. A parent who opens this page on the wrong month still
 * has to see the honey line.
 */
export const AVOID: Avoid[] = [
  {
    what: "Honey",
    when: "until 12 months",
    why: "It can carry the spores that cause infant botulism. Cooking does not destroy them.",
    severity: "danger",
  },
  {
    what: "Whole nuts, whole grapes, popcorn, raw carrot rounds",
    when: "until 4-5 years",
    why: "Exactly the size and shape of a small airway. Nuts as a smooth paste and grapes quartered lengthways are fine.",
    severity: "danger",
  },
  {
    what: "Cow's milk as a drink",
    when: "until 12 months",
    why: "It is low in iron and makes it harder to absorb what else they eat. In cooking, and as curd, it is fine from 7-8 months.",
    severity: "caution",
  },
  {
    what: "Added salt",
    when: "until 12 months",
    why: "Their kidneys cannot clear it. Food tastes bland to you long before it does to them.",
    severity: "caution",
  },
  {
    what: "Added sugar, including in juice",
    when: "for as long as you can",
    why: "It sets a preference early and does nothing for them. Whole fruit instead of juice.",
    severity: "caution",
  },
];

/** The stage an age falls in. Ages past the last stage get the last stage. */
export function stageForAge(ageMonths: number): WeaningStage {
  let found = WEANING_STAGES[0];
  for (const stage of WEANING_STAGES) {
    if (ageMonths >= stage.fromMonth) found = stage;
  }
  return found;
}

/**
 * Everything safe at this age, not just what is new this month.
 *
 * A nine-month-old still eats ragi kanji. Showing only the current stage's new
 * foods made the list look like the older foods had been withdrawn, which is
 * the opposite of how weaning works - it accumulates.
 */
export function foodsUpTo(ageMonths: number): Food[] {
  return WEANING_STAGES.filter((s) => ageMonths >= s.fromMonth).flatMap((s) => s.newFoods);
}

/** The next stage, for the "coming up" line. Null at the last one. */
export function nextStage(stage: WeaningStage): WeaningStage | null {
  const i = WEANING_STAGES.indexOf(stage);
  return i >= 0 && i < WEANING_STAGES.length - 1 ? WEANING_STAGES[i + 1] : null;
}
