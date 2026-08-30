import { describe, expect, it } from "vitest";
import { nextSize, projectSizeUp, sizeForWeight } from "./size-projection";

describe("sizeForWeight", () => {
  it("maps a weight to the size whose band it falls in", () => {
    expect(sizeForWeight(3.2)).toBe("NB");
    expect(sizeForWeight(6)).toBe("S");
    expect(sizeForWeight(10)).toBe("M");
    expect(sizeForWeight(13)).toBe("L");
    expect(sizeForWeight(16)).toBe("XL");
  });
  it("resolves overlaps to the smaller size", () => {
    // S is 4-8 and M is 7-12; 7.5 sits in both. The smaller size still fits, so
    // recommending it avoids sending a parent up a size early.
    expect(sizeForWeight(7.5)).toBe("S");
    expect(sizeForWeight(9.5)).toBe("M");
  });
  it("returns null outside every band", () => {
    expect(sizeForWeight(0)).toBeNull();
    expect(sizeForWeight(25)).toBeNull();
  });
});

describe("nextSize", () => {
  it("walks up the ladder", () => {
    expect(nextSize("NB")).toBe("S");
    expect(nextSize("L")).toBe("XL");
  });
  it("has nothing above XL", () => {
    expect(nextSize("XL")).toBeNull();
  });
});

describe("projectSizeUp", () => {
  it("projects a month for a baby mid-band", () => {
    const result = projectSizeUp({
      dob: "2026-01-01",
      sex: "male",
      weightKg: 6,
      today: "2026-04-01",
    });
    expect("whenMonth" in result).toBe(true);
    if ("whenMonth" in result) {
      expect(result.current).toBe("S");
      expect(result.next).toBe("M");
      expect(result.whenMonth).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    }
  });
  it("declines when the weight is outside every band", () => {
    expect(
      projectSizeUp({ dob: "2026-01-01", sex: "male", weightKg: 25, today: "2026-04-01" }),
    ).toEqual({ unavailable: "out-of-range" });
  });
  it("declines when already in the largest size", () => {
    expect(
      projectSizeUp({ dob: "2024-01-01", sex: "male", weightKg: 16, today: "2026-04-01" }),
    ).toEqual({ unavailable: "largest-size" });
  });
  it("projects sooner for a heavier baby than a lighter one of the same age", () => {
    // The whole reason this holds the child's own z-score instead of applying
    // the population median velocity.
    const heavy = projectSizeUp({
      dob: "2026-01-01",
      sex: "male",
      weightKg: 7.6,
      today: "2026-06-01",
    });
    const light = projectSizeUp({
      dob: "2026-01-01",
      sex: "male",
      weightKg: 6.2,
      today: "2026-06-01",
    });
    if ("whenMonth" in heavy && "whenMonth" in light) {
      expect(new Date(`${heavy.whenMonth} 1`).getTime()).toBeLessThanOrEqual(
        new Date(`${light.whenMonth} 1`).getTime(),
      );
    } else {
      // A heavier baby must at least not be the one that fails to project.
      expect("whenMonth" in heavy).toBe(true);
    }
  });
});
