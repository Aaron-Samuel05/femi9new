import { describe, expect, it } from "vitest";
import { DOSES, SCHEDULE_REVISED_ON } from "./immunisation-schedule.data";
import { scheduleFor, type VaccineDose } from "./immunisation-schedule";

/**
 * A stand-in schedule. The dating logic must be provably right BEFORE any real
 * medical data goes near it, so these tests never depend on the sourced table.
 */
const FIXTURE: VaccineDose[] = [
  { id: "a-birth", vaccine: "A", dose: "Birth", atWeeks: 0, track: ["UIP", "IAP"] },
  { id: "b-6w", vaccine: "B", dose: "1st", atWeeks: 6, track: ["UIP", "IAP"] },
  { id: "c-6w-iap", vaccine: "C", dose: "1st", atWeeks: 6, track: ["IAP"] },
  { id: "d-14w", vaccine: "D", dose: "3rd", atWeeks: 14, track: ["UIP", "IAP"] },
  { id: "e-52w", vaccine: "E", dose: "Booster", atWeeks: 52, track: ["IAP"] },
];

describe("scheduleFor", () => {
  const dob = "2026-01-01";

  it("dates every dose from the birth date", () => {
    const schedule = scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE);
    expect(schedule.map((d) => d.dueOn)).toEqual([
      "2026-01-01", // 0 weeks
      "2026-02-12", // 6 weeks
      "2026-02-12", // 6 weeks
      "2026-04-09", // 14 weeks
      "2026-12-31", // 52 weeks
    ]);
  });

  it("filters to the requested track", () => {
    const uip = scheduleFor({ dob, today: dob, track: "UIP" }, FIXTURE);
    const iap = scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE);
    expect(uip.map((d) => d.id)).toEqual(["a-birth", "b-6w", "d-14w"]);
    expect(iap).toHaveLength(5);
    expect(uip.every((d) => d.track.includes("UIP"))).toBe(true);
  });

  it("marks doses past, due and upcoming relative to today", () => {
    // On 13 Feb: the birth dose is long past, the 6-week doses fell yesterday
    // (still inside the 7-day due window), and the rest are upcoming.
    const schedule = scheduleFor({ dob, today: "2026-02-13", track: "IAP" }, FIXTURE);
    const byId = Object.fromEntries(schedule.map((d) => [d.id, d.status]));
    expect(byId["a-birth"]).toBe("past");
    expect(byId["b-6w"]).toBe("due");
    expect(byId["c-6w-iap"]).toBe("due");
    expect(byId["d-14w"]).toBe("upcoming");
    expect(byId["e-52w"]).toBe("upcoming");
  });

  it("closes the due window after seven days", () => {
    const schedule = scheduleFor({ dob, today: "2026-02-19", track: "IAP" }, FIXTURE);
    expect(schedule.find((d) => d.id === "b-6w")!.status).toBe("past");
  });

  it("returns doses in date order", () => {
    const schedule = scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].dueOn >= schedule[i - 1].dueOn).toBe(true);
    }
  });

  it("does NOT correct for prematurity", () => {
    // There is deliberately no gestational parameter — that absence is the
    // safeguard. A preterm baby's birth dose still falls on their birthday.
    const schedule = scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE);
    expect(schedule.find((d) => d.id === "a-birth")!.dueOn).toBe(dob);
  });

  it("is stable across dates that straddle a DST change", () => {
    for (const d of ["2026-03-29", "2026-10-25"]) {
      const schedule = scheduleFor({ dob: d, today: d, track: "IAP" }, FIXTURE);
      expect(schedule[0].dueOn).toBe(d);
      expect(schedule.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dueOn))).toBe(true);
    }
  });

  it("returns nothing while the real schedule is unsourced", () => {
    expect(scheduleFor({ dob, today: dob, track: "IAP" })).toEqual([]);
  });
});

/**
 * These activate automatically the moment a real schedule is transcribed.
 * Skipping beats a permanently red suite; a silent pass would be worse than both.
 */
describe("the transcribed schedule", () => {
  const pending = DOSES.length === 0;

  it.skipIf(pending)("records the revision it was transcribed from", () => {
    expect(SCHEDULE_REVISED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it.skipIf(pending)("has unique, stable ids", () => {
    const ids = DOSES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
  it.skipIf(pending)("is ordered by age and stays within 0-5 years", () => {
    for (let i = 1; i < DOSES.length; i++) {
      expect(DOSES[i].atWeeks).toBeGreaterThanOrEqual(DOSES[i - 1].atWeeks);
    }
    for (const dose of DOSES) {
      expect(dose.atWeeks).toBeGreaterThanOrEqual(0);
      expect(dose.atWeeks).toBeLessThanOrEqual(6 * 52);
    }
  });
  it.skipIf(pending)("covers both tracks", () => {
    expect(DOSES.some((d) => d.track.includes("UIP"))).toBe(true);
    expect(DOSES.some((d) => d.track.includes("IAP"))).toBe(true);
  });
});
