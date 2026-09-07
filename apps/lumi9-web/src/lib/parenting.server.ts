import "server-only";
import { getSession } from "@femi9/core/auth";
import {
  getParentingPayload,
  type BabyProfileDTO,
  type BabyMeasurementDTO,
  type BabyVaccinationDTO,
  type VaccineDoseDTO,
} from "@femi9/core/services/parenting";
import type { BabyProfile } from "@/lib/baby-profile";
import type { VaccineDose } from "@/lib/immunisation-schedule";

/**
 * The parenting tools' data, loaded from the `lumi9` schema.
 *
 * Same seam `catalog.server.ts` is for the catalogue, and for the same reason:
 * `@femi9/core` returns brand-agnostic rows and this file maps them into the
 * shape THIS storefront's pure modules already speak. The mapping is the whole
 * point of the file — `scheduleFor()`, `projectSizeUp()` and their tests never
 * learn that the schedule stopped being a TypeScript array.
 *
 * Loaded by `app/parenting-tools/layout.tsx` and NOT by the root layout. The
 * catalogue is on every page; a vaccination schedule is on four, and putting
 * this query in the root layout would run it on the homepage, every product
 * page and every article for nobody.
 */

/**
 * `VaccineDoseDTO` → the app's `VaccineDose`.
 *
 * Two renames and nothing else. `code` becomes `id` because the code IS the
 * stable identity as far as this app is concerned — the cuid is a database
 * detail no component should ever hold, and the storefront's `id` field was
 * already carrying exactly these strings ("penta-1", "mr-2") when the doses
 * were a module. `tracks` becomes `track` for the same continuity.
 */
function toDose(dto: VaccineDoseDTO): VaccineDose {
  return {
    id: dto.code,
    vaccine: dto.vaccine,
    dose: dto.dose,
    at: dto.at,
    track: dto.tracks,
    ...(dto.note ? { note: dto.note } : {}),
  };
}

/**
 * The stored profile → the shape every tool already reads.
 *
 * `null` collapses to `undefined` on the optional fields: the client type uses
 * `?:` throughout because it was born from a localStorage blob, and a `null`
 * weight would render as "null kg" wherever a component tests for presence with
 * a plain truthiness check.
 */
function toProfile(dto: BabyProfileDTO): BabyProfile {
  return {
    id: dto.id,
    name: dto.name ?? undefined,
    dob: dto.dob,
    sex: dto.sex,
    weightKg: dto.weightKg ?? undefined,
    heightCm: dto.heightCm ?? undefined,
    gestationalWeeks: dto.gestationalWeeks ?? undefined,
    bloodGroup: dto.bloodGroup ?? undefined,
  };
}

/** One child, with the two series that belong to them. */
export interface BabyRecord {
  profile: BabyProfile;
  /**
   * Weight and height over time, oldest first — the order the chart plots in.
   *
   * Always empty for a guest, and that is a property of where a guest's
   * children live rather than an omission: the device store keeps the latest
   * measurement per child, not a history. The chart says so instead of drawing
   * a one-point line and calling it a trend.
   */
  measurements: BabyMeasurementDTO[];
  /** Dose code → what the parent marked, for THIS child. */
  vaccinations: BabyVaccinationDTO[];
}

export interface ParentingPayload {
  /**
   * The published doses. EMPTY is a real state, not a failure: it means nobody
   * has run `db:seed-vaccines` against this schema, and the schedule component
   * already says so plainly rather than rendering an empty list that reads as a
   * bug. That behaviour predates the database and is why `hasScheduleData()`
   * exists.
   */
  schedule: VaccineDose[];
  /**
   * Every child on this account, each with their own record.
   *
   * EMPTY for a signed-out visitor is not "no children" — it means the browser
   * store is the authority for them, and `signedIn` below is what says which.
   * Collapsing the two would make a guest's children disappear on every render.
   *
   * This replaced a single `profile`. One baby per account was enforced all the
   * way down in the database, so adding a second child meant overwriting the
   * first — and taking their entire measurement series and vaccination record
   * with them, silently.
   */
  babies: BabyRecord[];
  /**
   * Whether there is a session at all.
   *
   * The client store branches on this: signed in, the server is the source of
   * truth and localStorage is a mirror; signed out, localStorage is all there
   * is and nothing leaves the device.
   */
  signedIn: boolean;
}

export async function loadParenting(): Promise<ParentingPayload> {
  // Read server-side, never from a client `useSession()`: this decides where a
  // profile is STORED, and a client answer to "who is this" is chrome, not an
  // authorisation. The API routes re-read it anyway.
  const session = await getSession("lumi9");
  const payload = await getParentingPayload("lumi9", session?.sub ?? null);

  return {
    schedule: payload.schedule.map(toDose),
    babies: payload.babies.map((b) => ({
      profile: toProfile(b.profile),
      measurements: b.measurements,
      vaccinations: b.vaccinations,
    })),
    signedIn: session !== null,
  };
}
