import { addWeeks, ageInDays, type IsoDate } from "@/lib/baby-age";
import { DOSES } from "./immunisation-schedule.data";

export type VaccineTrack = "UIP" | "IAP";

export type VaccineDose = {
  id: string;
  vaccine: string;
  dose: string;
  /** Weeks after birth, per the published schedule. */
  atWeeks: number;
  track: VaccineTrack[];
  note?: string;
};

export type ScheduledDose = VaccineDose & {
  dueOn: IsoDate;
  status: "due" | "upcoming" | "past";
};

/** A dose stays "due" for a week before it counts as past. */
const DUE_WINDOW_DAYS = 7;

/**
 * Dates the schedule from the birth date.
 *
 * Takes NO gestational age, and that is deliberate. Immunisation runs on
 * chronological age even for a preterm baby; accepting a correction here would
 * invite someone to apply the growth rule and delay real doses.
 *
 * `doses` is injectable so the dating logic can be tested against a fixture.
 * That matters more than usual here: the real table is sourced separately, and
 * the logic must be provably correct before any medical data goes near it.
 */
export function scheduleFor(
  input: { dob: IsoDate; today: IsoDate; track: VaccineTrack },
  doses: VaccineDose[] = DOSES,
): ScheduledDose[] {
  return doses
    .filter((dose) => dose.track.includes(input.track))
    .map((dose) => {
      const dueOn = addWeeks(input.dob, dose.atWeeks);
      const daysUntil = ageInDays(input.today, dueOn);
      const status: ScheduledDose["status"] =
        daysUntil > 0 ? "upcoming" : daysUntil > -DUE_WINDOW_DAYS ? "due" : "past";
      return { ...dose, dueOn, status };
    })
    .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

/** True once a real schedule has been transcribed. The UI checks this. */
export function hasScheduleData(): boolean {
  return DOSES.length > 0;
}

export { IAP_SOURCE, SCHEDULE_REVISED_ON, UIP_SOURCE } from "./immunisation-schedule.data";
