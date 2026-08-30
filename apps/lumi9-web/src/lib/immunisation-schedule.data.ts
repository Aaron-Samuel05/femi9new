import type { VaccineDose } from "./immunisation-schedule";

/**
 * India childhood immunisation, birth to 5 years.
 *
 * DELIBERATELY EMPTY. The ages must be transcribed from the published Indian
 * schedules and nothing else — not from memory, not from a search snippet, not
 * from a seven-year-old PDF. A plausible-looking wrong vaccine date is worse
 * than no tool, so the empty state is the correct state until a real source is
 * in hand.
 *
 * Sourcing attempted 2026-08-30, all six failing to yield a schedule table:
 *   nhp.gov.in                        DNS does not resolve
 *   iapindia.org/immunization-schedule  no table
 *   iapindia.org guidebook page       PDFs only, newest linked is 2018-19
 *   iapindia.org/purple-book-2025     returns no content
 *   nhm.gov.in immunization page      prose only
 *   immunizationdata.who.int (India)  rendered headless, no table in the DOM
 *
 * TO FILL: one entry per dose, ascending `atWeeks`, ids lowercase-hyphenated and
 * stable. Doses common to both schedules list both tracks; doses the IAP adds
 * list only "IAP". Set SCHEDULE_REVISED_ON to the revision date printed on the
 * source. The data-shape tests in immunisation-schedule.test.ts skip while this
 * array is empty and activate the moment it is not.
 *
 *   { id: "bcg-birth", vaccine: "BCG", dose: "Birth dose", atWeeks: 0,
 *     track: ["UIP", "IAP"] },
 */
export const UIP_SOURCE = "MoHFW National Immunization Schedule";
export const IAP_SOURCE = "IAP Immunization Timetable";
export const SCHEDULE_REVISED_ON = "";

export const DOSES: VaccineDose[] = [];
