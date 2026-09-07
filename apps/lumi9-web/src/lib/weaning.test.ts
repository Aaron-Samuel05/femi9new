import { describe, expect, it } from "vitest";
import { AVOID, WEANING_STAGES, foodsUpTo, nextStage, stageForAge } from "./weaning";

describe("WEANING_STAGES", () => {
  it("is ordered and has no gaps", () => {
    for (let i = 1; i < WEANING_STAGES.length; i++) {
      expect(WEANING_STAGES[i].fromMonth).toBeGreaterThan(WEANING_STAGES[i - 1].fromMonth);
    }
  });

  it("starts solids at 6 months and offers nothing before", () => {
    // The WHO recommendation, and the one place this tool must not be flexible.
    expect(WEANING_STAGES[0].fromMonth).toBe(0);
    expect(WEANING_STAGES[0].newFoods).toHaveLength(0);
    expect(WEANING_STAGES[1].fromMonth).toBe(6);
    expect(WEANING_STAGES[1].newFoods.length).toBeGreaterThan(0);
  });

  it("gives every food a form, because the form is what changes by stage", () => {
    for (const stage of WEANING_STAGES) {
      for (const food of stage.newFoods) {
        expect(food.name.length).toBeGreaterThan(0);
        expect(food.form.length).toBeGreaterThan(0);
      }
    }
  });

  it("never repeats a food across stages", () => {
    const seen = new Set<string>();
    for (const stage of WEANING_STAGES) {
      for (const food of stage.newFoods) {
        expect(seen.has(food.name)).toBe(false);
        seen.add(food.name);
      }
    }
  });
});

describe("stageForAge", () => {
  it("picks the stage an age falls in", () => {
    expect(stageForAge(0).label).toBe("Before 6 months");
    expect(stageForAge(5).label).toBe("Before 6 months");
    expect(stageForAge(6).label).toContain("6 months");
    expect(stageForAge(8).label).toContain("7-8 months");
    expect(stageForAge(10).label).toContain("9-11 months");
    expect(stageForAge(12).label).toContain("12 months");
  });

  it("holds at the last stage rather than falling off the end", () => {
    expect(stageForAge(48).label).toContain("12 months");
  });
});

describe("foodsUpTo", () => {
  it("accumulates rather than replacing — a 9-month-old still eats ragi", () => {
    const nine = foodsUpTo(9).map((f) => f.name);
    expect(nine).toContain("Ragi");
    expect(nine).toContain("Kambu");
    expect(nine).toContain("Idli / dosa");
  });

  it("offers nothing before six months", () => {
    expect(foodsUpTo(4)).toHaveLength(0);
    expect(foodsUpTo(5)).toHaveLength(0);
  });

  it("never offers a later stage's food early", () => {
    const six = foodsUpTo(6).map((f) => f.name);
    expect(six).not.toContain("Honey");
    expect(six).not.toContain("Cow's milk");
    expect(six).not.toContain("Whole egg");
  });
});

describe("AVOID", () => {
  it("carries the two that are safety, not preference", () => {
    const danger = AVOID.filter((a) => a.severity === "danger").map((a) => a.what);
    expect(danger.some((w) => w.includes("Honey"))).toBe(true);
    expect(danger.some((w) => w.includes("nuts"))).toBe(true);
  });

  it("carries a complete phrase, not a fragment the view has to glue", () => {
    // "until As long as you can manage" was the bug this guards.
    for (const a of AVOID) {
      expect(a.when).not.toMatch(/^[A-Z]/);
    }
  });

  it("says when and why for every entry", () => {
    for (const a of AVOID) {
      expect(a.when.length).toBeGreaterThan(0);
      expect(a.why.length).toBeGreaterThan(0);
    }
  });

  it("keeps honey off the menu until the stage that says it is safe", () => {
    // The one contradiction that would matter: honey listed as a 12-month food
    // while the avoid list still says 12 months. They must agree.
    const honeyStage = WEANING_STAGES.find((s) => s.newFoods.some((f) => f.name === "Honey"));
    expect(honeyStage?.fromMonth).toBe(12);
    expect(AVOID.find((a) => a.what === "Honey")?.when).toBe("until 12 months");
  });
});

describe("nextStage", () => {
  it("walks forward and stops", () => {
    expect(nextStage(WEANING_STAGES[0])?.fromMonth).toBe(6);
    expect(nextStage(WEANING_STAGES[WEANING_STAGES.length - 1])).toBeNull();
  });
});
