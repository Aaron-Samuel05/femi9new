import type { VaccineDose } from "./immunisation-schedule";

/**
 * India — National Immunization Schedule (UIP), the free government schedule.
 *
 * Transcribed verbatim from the schedule supplied by the site owner on
 * 2026-08-30. Nothing here is inferred: no vaccine, dose number or age appears
 * below that was not in that text, and no clinical caveat has been added to it.
 *
 * Where the schedule gives a RANGE ("9-11 Months"), `at` is the earliest age —
 * the point it becomes due — and the full range is kept in `note` so the window
 * is not lost.
 *
 * Deliberately excluded:
 *   - The Td doses for pregnant women. This is a tool about a baby, and mixing
 *     a maternal schedule into a list dated from the child's birthday would be
 *     actively confusing.
 *
 * The IAP (private/optional) schedule is NOT here. It was not supplied, so the
 * IAP track has no doses and the UI does not offer it. Adding it is a matter of
 * appending entries with track: ["IAP"].
 *
 * SCHEDULE_REVISED_ON is empty on purpose: the source arrived as text rather
 * than as a dated publication, so there is no revision to cite. The disclaimer
 * degrades to naming the source alone rather than showing a date we invented.
 */
export const UIP_SOURCE = "National Immunization Schedule (UIP), India";
export const IAP_SOURCE = "IAP Immunization Timetable";
export const SCHEDULE_REVISED_ON = "";

const UIP: VaccineDose["track"] = ["UIP"];

export const DOSES: VaccineDose[] = [
  // ── At birth ──────────────────────────────────────────────────────────────
  { id: "bcg-birth", vaccine: "BCG", dose: "Birth dose", at: { unit: "weeks", value: 0 }, track: UIP },
  { id: "bopv-0", vaccine: "bOPV", dose: "0 (birth dose)", at: { unit: "weeks", value: 0 }, track: UIP },
  { id: "hepb-birth", vaccine: "Hepatitis B", dose: "Birth dose", at: { unit: "weeks", value: 0 }, track: UIP },

  // ── 6 weeks ───────────────────────────────────────────────────────────────
  { id: "bopv-1", vaccine: "bOPV", dose: "1", at: { unit: "weeks", value: 6 }, track: UIP },
  { id: "penta-1", vaccine: "Pentavalent", dose: "1", at: { unit: "weeks", value: 6 }, track: UIP },
  { id: "fipv-1", vaccine: "fIPV", dose: "1", at: { unit: "weeks", value: 6 }, track: UIP },
  { id: "rvv-1", vaccine: "Rotavirus (RVV)", dose: "1", at: { unit: "weeks", value: 6 }, track: UIP },
  { id: "pcv-1", vaccine: "PCV", dose: "1", at: { unit: "weeks", value: 6 }, track: UIP },

  // ── 10 weeks ──────────────────────────────────────────────────────────────
  { id: "bopv-2", vaccine: "bOPV", dose: "2", at: { unit: "weeks", value: 10 }, track: UIP },
  { id: "penta-2", vaccine: "Pentavalent", dose: "2", at: { unit: "weeks", value: 10 }, track: UIP },
  { id: "rvv-2", vaccine: "Rotavirus (RVV)", dose: "2", at: { unit: "weeks", value: 10 }, track: UIP },

  // ── 14 weeks ──────────────────────────────────────────────────────────────
  { id: "bopv-3", vaccine: "bOPV", dose: "3", at: { unit: "weeks", value: 14 }, track: UIP },
  { id: "penta-3", vaccine: "Pentavalent", dose: "3", at: { unit: "weeks", value: 14 }, track: UIP },
  { id: "fipv-2", vaccine: "fIPV", dose: "2", at: { unit: "weeks", value: 14 }, track: UIP },
  { id: "rvv-3", vaccine: "Rotavirus (RVV)", dose: "3", at: { unit: "weeks", value: 14 }, track: UIP },
  { id: "pcv-2", vaccine: "PCV", dose: "2", at: { unit: "weeks", value: 14 }, track: UIP },

  // ── 9–11 months ───────────────────────────────────────────────────────────
  { id: "mr-1", vaccine: "Measles–Rubella (MR)", dose: "1", at: { unit: "months", value: 9 }, track: UIP, note: "Given between 9 and 11 months" },
  { id: "je-1", vaccine: "Japanese Encephalitis (JE)", dose: "1", at: { unit: "months", value: 9 }, track: UIP, note: "Given between 9 and 11 months" },
  { id: "pcv-booster", vaccine: "PCV", dose: "Booster", at: { unit: "months", value: 9 }, track: UIP, note: "Given between 9 and 11 months" },
  { id: "fipv-3", vaccine: "fIPV", dose: "3", at: { unit: "months", value: 9 }, track: UIP, note: "Given between 9 and 11 months" },
  { id: "vitamin-a-1", vaccine: "Vitamin A", dose: "1", at: { unit: "months", value: 9 }, track: UIP, note: "Given between 9 and 11 months" },

  // ── 16–23 months ──────────────────────────────────────────────────────────
  { id: "mr-2", vaccine: "Measles–Rubella (MR)", dose: "2", at: { unit: "months", value: 16 }, track: UIP, note: "Given between 16 and 23 months" },
  { id: "je-2", vaccine: "Japanese Encephalitis (JE)", dose: "2", at: { unit: "months", value: 16 }, track: UIP, note: "Given between 16 and 23 months" },
  { id: "dpt-booster-1", vaccine: "DPT", dose: "Booster 1", at: { unit: "months", value: 16 }, track: UIP, note: "Given between 16 and 23 months" },
  { id: "bopv-booster", vaccine: "bOPV", dose: "Booster", at: { unit: "months", value: 16 }, track: UIP, note: "Given between 16 and 23 months" },
  { id: "vitamin-a-2", vaccine: "Vitamin A", dose: "2", at: { unit: "months", value: 16 }, track: UIP, note: "Given between 16 and 23 months" },

  // ── 5–6 years ─────────────────────────────────────────────────────────────
  { id: "dpt-booster-2", vaccine: "DPT", dose: "Booster 2", at: { unit: "years", value: 5 }, track: UIP, note: "Given between 5 and 6 years" },

  // ── 10 and 16 years ───────────────────────────────────────────────────────
  { id: "td-10y", vaccine: "Td", dose: "10 years", at: { unit: "years", value: 10 }, track: UIP },
  { id: "td-16y", vaccine: "Td", dose: "16 years", at: { unit: "years", value: 16 }, track: UIP },
];
