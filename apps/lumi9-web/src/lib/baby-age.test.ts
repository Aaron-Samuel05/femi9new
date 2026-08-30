import { describe, expect, it } from "vitest";
import {
  addDays,
  addWeeks,
  ageInDays,
  ageInMonths,
  correctedAgeInMonths,
  formatMonthYear,
  parseIsoDate,
} from "./baby-age";

describe("parseIsoDate", () => {
  it("parses a valid date", () => {
    expect(parseIsoDate("2026-03-09")).toEqual({ y: 2026, m: 3, d: 9 });
  });
  it("rejects malformed input", () => {
    expect(parseIsoDate("09-03-2026")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-02-30")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
});

describe("ageInDays", () => {
  it("counts whole days", () => {
    expect(ageInDays("2026-01-01", "2026-01-31")).toBe(30);
  });
  it("crosses a leap day", () => {
    expect(ageInDays("2028-02-28", "2028-03-01")).toBe(2);
  });
  it("is negative for a future birth date", () => {
    expect(ageInDays("2026-06-01", "2026-05-01")).toBe(-31);
  });
  it("does not drift across a DST boundary", () => {
    expect(ageInDays("2026-03-01", "2026-03-31")).toBe(30);
    expect(ageInDays("2026-10-15", "2026-11-14")).toBe(30);
  });
});

describe("ageInMonths", () => {
  it("counts completed months only", () => {
    expect(ageInMonths("2026-01-15", "2026-02-14")).toBe(0);
    expect(ageInMonths("2026-01-15", "2026-02-15")).toBe(1);
    expect(ageInMonths("2026-01-15", "2027-01-14")).toBe(11);
    expect(ageInMonths("2026-01-15", "2027-01-15")).toBe(12);
  });
  it("handles a day-of-month that does not exist in the later month", () => {
    expect(ageInMonths("2026-01-31", "2026-02-28")).toBe(0);
    expect(ageInMonths("2026-01-31", "2026-03-31")).toBe(2);
  });
});

describe("correctedAgeInMonths", () => {
  it("equals chronological age for a term baby", () => {
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", 40)).toBe(6);
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", undefined)).toBe(6);
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", 37)).toBe(6);
  });
  it("subtracts the weeks of prematurity below 37 weeks", () => {
    expect(correctedAgeInMonths("2026-01-01", "2026-07-01", 32)).toBe(4);
  });
  it("stops correcting after 24 months chronological", () => {
    expect(correctedAgeInMonths("2024-01-01", "2026-07-01", 32)).toBe(30);
  });
  it("never returns a negative age", () => {
    expect(correctedAgeInMonths("2026-01-01", "2026-01-10", 28)).toBe(0);
  });
});

describe("addDays / addWeeks", () => {
  it("adds across a month boundary", () => {
    expect(addDays("2026-01-30", 3)).toBe("2026-02-02");
  });
  it("adds across a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("adds weeks", () => {
    expect(addWeeks("2026-01-01", 6)).toBe("2026-02-12");
  });
});

describe("formatMonthYear", () => {
  it("renders a readable month", () => {
    expect(formatMonthYear("2027-03-09")).toBe("March 2027");
  });
});
