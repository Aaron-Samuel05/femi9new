import { describe, expect, it } from "vitest";
import {
  SLEEP_BANDS,
  bandForAge,
  formatClock,
  formatDuration,
  parseClock,
  planDay,
} from "./sleep-guide";

describe("SLEEP_BANDS", () => {
  it("is ordered and has no gaps", () => {
    for (let i = 1; i < SLEEP_BANDS.length; i++) {
      expect(SLEEP_BANDS[i].fromMonth).toBeGreaterThan(SLEEP_BANDS[i - 1].fromMonth);
    }
  });

  it("states every range low-to-high", () => {
    for (const b of SLEEP_BANDS) {
      expect(b.wakeWindowMax).toBeGreaterThanOrEqual(b.wakeWindowMin);
      expect(b.napsMax).toBeGreaterThanOrEqual(b.napsMin);
      expect(b.totalMax).toBeGreaterThan(b.totalMin);
    }
  });

  it("has wake windows that only ever grow with age", () => {
    for (let i = 1; i < SLEEP_BANDS.length; i++) {
      expect(SLEEP_BANDS[i].wakeWindowMax).toBeGreaterThan(SLEEP_BANDS[i - 1].wakeWindowMax);
    }
  });
});

describe("bandForAge", () => {
  it("picks the band an age falls in", () => {
    expect(bandForAge(0).label).toBe("Newborn");
    expect(bandForAge(1).label).toBe("Newborn");
    expect(bandForAge(2).label).toBe("2-3 months");
    expect(bandForAge(7).label).toBe("6-8 months");
    expect(bandForAge(14).label).toBe("13-18 months");
  });

  it("holds at the last band rather than falling off the end", () => {
    expect(bandForAge(60).label).toBe("2-3 years");
    expect(bandForAge(200).label).toBe("2-3 years");
  });
});

describe("planDay", () => {
  const band = bandForAge(9); // 2 naps, 150-210 min windows, 75 min naps

  it("puts the first nap one wake window after waking", () => {
    // 150-210 min band -> 180 min chained. 6:30 + 3h = 9:30.
    const day = planDay({ wakeAtMinutes: 6 * 60 + 30, band });
    expect(day[0].label).toBe("Nap 1");
    expect(formatClock(day[0].at)).toBe("9:30 am");
  });

  it("never places a sleep before the one it follows", () => {
    // The compounding-range version overlapped nap 5 with bedtime.
    for (const months of [0, 2, 4, 6, 9, 13, 19, 25]) {
      const day = planDay({ wakeAtMinutes: 6 * 60 + 30, band: bandForAge(months) });
      for (let i = 1; i < day.length; i++) {
        expect(day[i].at).toBeGreaterThan(day[i - 1].at);
      }
    }
  });

  it("ends with a bedtime after the last nap", () => {
    const day = planDay({ wakeAtMinutes: 6 * 60 + 30, band });
    expect(day[day.length - 1].kind).toBe("bedtime");
    expect(day.filter((e) => e.kind === "nap")).toHaveLength(2);
  });

  it("moves bedtime earlier for an early waking rather than pinning it", () => {
    // A 4am start genuinely needs an earlier night. Clamping it to a plausible
    // bedtime would be the calculator protecting its own credibility.
    const early = planDay({ wakeAtMinutes: 4 * 60, band });
    const normal = planDay({ wakeAtMinutes: 7 * 60, band });
    const bed = (d: ReturnType<typeof planDay>) => d[d.length - 1].at;
    expect(bed(early)).toBeLessThan(bed(normal));
  });

  it("stops rather than spilling past midnight", () => {
    const day = planDay({ wakeAtMinutes: 22 * 60, band });
    for (const e of day) expect(e.at).toBeLessThan(24 * 60);
  });
});

describe("clock helpers", () => {
  it("formats a 12-hour clock", () => {
    expect(formatClock(0)).toBe("12:00 am");
    expect(formatClock(12 * 60)).toBe("12:00 pm");
    expect(formatClock(13 * 60 + 5)).toBe("1:05 pm");
    expect(formatClock(6 * 60 + 30)).toBe("6:30 am");
  });

  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(135)).toBe("2 hr 15 min");
  });

  it("parses a time input and rejects nonsense", () => {
    expect(parseClock("06:30")).toBe(390);
    expect(parseClock("23:59")).toBe(1439);
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("half six")).toBeNull();
  });
});
