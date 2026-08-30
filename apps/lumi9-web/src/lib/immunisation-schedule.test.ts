import { describe, expect, it } from "vitest";
import { DOSES } from "./immunisation-schedule.data";
import {
  availableTracks,
  dueDate,
  scheduleFor,
  type VaccineDose,
} from "./immunisation-schedule";

/**
 * A stand-in schedule. The dating logic is proven against this rather than
 * against the medical table, so a change to one can never quietly excuse the
 * other.
 */
const FIXTURE: VaccineDose[] = [
  { id: "a-birth", vaccine: "A", dose: "Birth", at: { unit: "weeks", value: 0 }, track: ["UIP", "IAP"] },
  { id: "b-6w", vaccine: "B", dose: "1", at: { unit: "weeks", value: 6 }, track: ["UIP", "IAP"] },
  { id: "c-6w-iap", vaccine: "C", dose: "1", at: { unit: "weeks", value: 6 }, track: ["IAP"] },
  { id: "d-9m", vaccine: "D", dose: "1", at: { unit: "months", value: 9 }, track: ["UIP", "IAP"] },
  { id: "e-5y", vaccine: "E", dose: "Booster", at: { unit: "years", value: 5 }, track: ["IAP"] },
];

describe("dueDate", () => {
  it("uses the unit the schedule states", () => {
    expect(dueDate("2026-01-15", { unit: "weeks", value: 6 })).toBe("2026-02-26");
    expect(dueDate("2026-01-15", { unit: "months", value: 9 })).toBe("2026-10-15");
    expect(dueDate("2026-01-15", { unit: "years", value: 5 })).toBe("2031-01-15");
  });
  it("clamps a month-end birthday", () => {
    expect(dueDate("2026-01-31", { unit: "months", value: 1 })).toBe("2026-02-28");
  });
});

describe("scheduleFor", () => {
  const dob = "2026-01-01";

  it("dates every dose from the birth date", () => {
    expect(scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE).map((d) => d.dueOn)).toEqual([
      "2026-01-01",
      "2026-02-12",
      "2026-02-12",
      "2026-10-01",
      "2031-01-01",
    ]);
  });

  it("filters to the requested track", () => {
    const uip = scheduleFor({ dob, today: dob, track: "UIP" }, FIXTURE);
    expect(uip.map((d) => d.id)).toEqual(["a-birth", "b-6w", "d-9m"]);
    expect(scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE)).toHaveLength(5);
  });

  it("marks doses past, due and upcoming relative to today", () => {
    const byId = Object.fromEntries(
      scheduleFor({ dob, today: "2026-02-20", track: "IAP" }, FIXTURE).map((d) => [d.id, d.status]),
    );
    expect(byId["a-birth"]).toBe("past");
    expect(byId["b-6w"]).toBe("due"); // 8 days ago, inside the 28-day window
    expect(byId["d-9m"]).toBe("upcoming");
  });

  it("closes the due window after four weeks", () => {
    const byId = Object.fromEntries(
      scheduleFor({ dob, today: "2026-03-15", track: "IAP" }, FIXTURE).map((d) => [d.id, d.status]),
    );
    expect(byId["b-6w"]).toBe("past");
  });

  it("returns doses in date order", () => {
    const schedule = scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i].dueOn >= schedule[i - 1].dueOn).toBe(true);
    }
  });

  it("does NOT correct for prematurity", () => {
    // No gestational parameter exists on this function — that absence is the
    // safeguard. A preterm baby's birth dose still falls on their birthday.
    expect(scheduleFor({ dob, today: dob, track: "IAP" }, FIXTURE)[0].dueOn).toBe(dob);
  });

  it("is stable across dates that straddle a DST change", () => {
    for (const d of ["2026-03-29", "2026-10-25"]) {
      const schedule = scheduleFor({ dob: d, today: d, track: "IAP" }, FIXTURE);
      expect(schedule[0].dueOn).toBe(d);
      expect(schedule.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dueOn))).toBe(true);
    }
  });
});

describe("availableTracks", () => {
  it("lists only tracks that actually have doses", () => {
    expect(availableTracks(FIXTURE)).toEqual(["UIP", "IAP"]);
    // Note the filter must REPLACE the track list, not select on it — every
    // shared dose lists both, so filtering by "includes UIP" keeps IAP too.
    expect(availableTracks(FIXTURE.map((d) => ({ ...d, track: ["UIP" as const] })))).toEqual(["UIP"]);
    expect(availableTracks([])).toEqual([]);
  });
  it("reflects the shipped schedule — UIP only until IAP is supplied", () => {
    expect(availableTracks()).toEqual(["UIP"]);
  });
});

describe("the shipped UIP schedule", () => {
  it("has unique, stable ids", () => {
    const ids = DOSES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it("is ordered by age", () => {
    const dates = DOSES.map((d) => dueDate("2026-01-01", d.at));
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i] >= dates[i - 1]).toBe(true);
    }
  });

  it("covers every visit in the published schedule", () => {
    // One assertion per line of the source, so a dropped visit fails loudly.
    const on = (iso: string) =>
      scheduleFor({ dob: "2026-01-01", today: "2026-01-01", track: "UIP" })
        .filter((d) => d.dueOn === iso)
        .map((d) => d.id)
        .sort();
    expect(on("2026-01-01")).toEqual(["bcg-birth", "bopv-0", "hepb-birth"]);
    expect(on("2026-02-12")).toEqual(["bopv-1", "fipv-1", "pcv-1", "penta-1", "rvv-1"]);
    expect(on("2026-03-12")).toEqual(["bopv-2", "penta-2", "rvv-2"]);
    expect(on("2026-04-09")).toEqual(["bopv-3", "fipv-2", "pcv-2", "penta-3", "rvv-3"]);
    expect(on("2026-10-01")).toEqual(["fipv-3", "je-1", "mr-1", "pcv-booster", "vitamin-a-1"]);
    expect(on("2027-05-01")).toEqual(["bopv-booster", "dpt-booster-1", "je-2", "mr-2", "vitamin-a-2"]);
    expect(on("2031-01-01")).toEqual(["dpt-booster-2"]);
    expect(on("2036-01-01")).toEqual(["td-10y"]);
    expect(on("2042-01-01")).toEqual(["td-16y"]);
  });

  it("keeps the published range on exactly the doses that have one", () => {
    // The source gives three ranged visits and two exact ages (Td at 10 and 16).
    // Asserting both directions catches a range silently dropped AND a range
    // invented for a dose the schedule states precisely.
    const ranged = DOSES.filter((d) => d.note).map((d) => d.id);
    expect(ranged).toHaveLength(11);
    for (const dose of DOSES) {
      if (dose.note) expect(dose.note).toMatch(/^Given between /);
    }
    expect(DOSES.find((d) => d.id === "td-10y")!.note).toBeUndefined();
    expect(DOSES.find((d) => d.id === "td-16y")!.note).toBeUndefined();
    expect(DOSES.find((d) => d.id === "mr-1")!.note).toBe("Given between 9 and 11 months");
    expect(DOSES.find((d) => d.id === "dpt-booster-2")!.note).toBe("Given between 5 and 6 years");
  });

  it("carries no IAP doses yet", () => {
    expect(DOSES.every((d) => d.track.length === 1 && d.track[0] === "UIP")).toBe(true);
  });
});
