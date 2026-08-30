import { addMonths, addWeeks, addYears, ageInDays, type IsoDate } from "@/lib/baby-age";
import { DOSES } from "./immunisation-schedule.data";

export type VaccineTrack = "UIP" | "IAP";

/**
 * Age in the unit the published schedule states it in.
 *
 * Not normalised to weeks. The source says "6 Weeks", "9-11 Months" and
 * "5-6 Years", and those are different kinds of age: nine months means the 9th
 * of the birth month, not 274 days later. Flattening them to weeks drifts by
 * days on exactly the doses parents diarise.
 */
export type DoseAge =
  | { unit: "weeks"; value: number }
  | { unit: "months"; value: number }
  | { unit: "years"; value: number };

export type VaccineDose = {
  id: string;
  vaccine: string;
  dose: string;
  /** When it becomes due. For a published range, the EARLIEST age in it. */
  at: DoseAge;
  track: VaccineTrack[];
  /** The published range or condition, where one exists. */
  note?: string;
};

export type ScheduledDose = VaccineDose & {
  dueOn: IsoDate;
  status: "due" | "upcoming" | "past";
};

/** A dose stays "due" for four weeks before it counts as past. */
const DUE_WINDOW_DAYS = 28;

export function dueDate(dob: IsoDate, at: DoseAge): IsoDate {
  if (at.unit === "weeks") return addWeeks(dob, at.value);
  if (at.unit === "months") return addMonths(dob, at.value);
  return addYears(dob, at.value);
}

/**
 * Dates the schedule from the birth date.
 *
 * Takes NO gestational age, and that is deliberate. Immunisation runs on
 * chronological age even for a preterm baby; accepting a correction here would
 * invite someone to apply the growth rule and delay real doses.
 *
 * `doses` is injectable so the dating logic can be tested against a fixture
 * rather than against whichever medical table happens to be loaded.
 */
export function scheduleFor(
  input: { dob: IsoDate; today: IsoDate; track: VaccineTrack },
  doses: VaccineDose[] = DOSES,
): ScheduledDose[] {
  return doses
    .filter((dose) => dose.track.includes(input.track))
    .map((dose) => {
      const dueOn = dueDate(input.dob, dose.at);
      const daysUntil = ageInDays(input.today, dueOn);
      const status: ScheduledDose["status"] =
        daysUntil > 0 ? "upcoming" : daysUntil > -DUE_WINDOW_DAYS ? "due" : "past";
      return { ...dose, dueOn, status };
    })
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

/**
 * Which tracks actually have doses.
 *
 * The UI renders a selector only for these. Offering a tab that opens onto an
 * empty list would read as a broken page rather than as missing data.
 */
export function availableTracks(doses: VaccineDose[] = DOSES): VaccineTrack[] {
  return (["UIP", "IAP"] as VaccineTrack[]).filter((t) =>
    doses.some((d) => d.track.includes(t)),
  );
}

export function hasScheduleData(): boolean {
  return DOSES.length > 0;
}

export { IAP_SOURCE, SCHEDULE_REVISED_ON, UIP_SOURCE } from "./immunisation-schedule.data";
