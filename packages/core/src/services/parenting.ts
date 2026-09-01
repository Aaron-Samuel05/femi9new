import 'server-only'
import type {
  BabySex,
  BloodGroup as DbBloodGroup,
  DoseAgeUnit,
  VaccinationStatus,
  VaccineTrack,
} from '@prisma/client'
import { dbFor, type Brand } from '@femi9/db'

/**
 * Parenting tools — the service layer behind Lumi9's /parenting-tools.
 *
 * Everything this surface knew used to live in the browser: one localStorage
 * blob for the baby, two hardcoded TypeScript modules for the medical tables,
 * and an email route that sent a plan and kept nothing. This is the seam that
 * gives the page a backend.
 *
 * Three rules shape every function below.
 *
 * **The privacy promise is kept where it was made.** A signed-out parent still
 * writes nothing — the localStorage store stays, and nothing here is reachable
 * without a `userId`. The ONLY exception is `recordParentingLead`, and only
 * because a parent typed an address and asked us to send something to it.
 *
 * **Dates are DATES.** `dob`, `takenOn` and `givenOn` are `@db.Date` columns and
 * cross this boundary as `YYYY-MM-DD` strings, never as `Date`. A birthday has
 * no time and no zone; a UTC-midnight timestamp read back in IST is the day
 * before, which on this page dates every single vaccination one day early. It
 * is also what a Server Component → Client Component handoff requires — a `Date`
 * is not serializable across it.
 *
 * **No date MATHS happens here.** Dating a dose from a birthday, correcting an
 * age for prematurity and walking the WHO tables forward are pure functions with
 * their own tests in `apps/lumi9-web/src/lib/`. This module returns rows. Moving
 * the arithmetic server-side would cost a round trip per keystroke on tools whose
 * whole appeal is that they answer instantly.
 */

// ── Wire types ───────────────────────────────────────────────────────────────

/** `YYYY-MM-DD`. The only date shape that crosses this boundary. */
export type IsoDate = string

/**
 * Blood group as a PERSON writes it, which is what crosses this boundary.
 *
 * Postgres stores exactly these strings — the enum's labels are `'A+'`, `'A-'`
 * and so on. Prisma cannot name a TypeScript member `A+`, so the schema maps
 * them to `A_POS`/`A_NEG`/… and the generated client speaks in those. That is a
 * client-generator artefact, not a fact about the data, and it must not leak
 * past this file: a storefront that has to translate `A_POS` before printing it
 * is one refactor away from printing `A_POS`.
 *
 * So the pair below is the only place the two vocabularies meet. Both maps are
 * exhaustive `Record`s rather than string surgery, so adding a group to the enum
 * without adding it here fails to compile instead of returning `undefined` for
 * somebody's blood type.
 */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const
export type BloodGroup = (typeof BLOOD_GROUPS)[number]

const TO_LABEL: Record<DbBloodGroup, BloodGroup> = {
  A_POS: 'A+',
  A_NEG: 'A-',
  B_POS: 'B+',
  B_NEG: 'B-',
  AB_POS: 'AB+',
  AB_NEG: 'AB-',
  O_POS: 'O+',
  O_NEG: 'O-',
}

const TO_DB: Record<BloodGroup, DbBloodGroup> = {
  'A+': 'A_POS',
  'A-': 'A_NEG',
  'B+': 'B_POS',
  'B-': 'B_NEG',
  'AB+': 'AB_POS',
  'AB-': 'AB_NEG',
  'O+': 'O_POS',
  'O-': 'O_NEG',
}

/**
 * The stored enum member → what a person reads.
 *
 * Exported because the admin service needs the same translation, and two copies
 * of it is exactly the drift this map exists to prevent.
 */
export function bloodGroupLabel(value: DbBloodGroup | null): BloodGroup | null {
  return value ? TO_LABEL[value] : null
}

const toLabel = bloodGroupLabel

function toDb(value: BloodGroup | null | undefined): DbBloodGroup | null {
  return value ? TO_DB[value] : null
}

export interface BabyProfileDTO {
  id: string
  name: string | null
  dob: IsoDate
  sex: BabySex
  weightKg: number | null
  heightCm: number | null
  gestationalWeeks: number | null
  bloodGroup: BloodGroup | null
  updatedAt: string
}

export interface BabyMeasurementDTO {
  takenOn: IsoDate
  weightKg: number | null
  heightCm: number | null
}

/**
 * One dose, in the shape the storefront's `scheduleFor()` already speaks.
 *
 * `at` is reassembled from the two columns rather than exposed as
 * `ageUnit`/`ageValue`, so the dating function and its fixtures are untouched by
 * where the doses now come from — the schedule became a query without the maths
 * noticing.
 */
export interface VaccineDoseDTO {
  /** The stable key. `id` is a cuid nothing outside the database should hold. */
  code: string
  vaccine: string
  dose: string
  at: { unit: DoseAgeUnit; value: number }
  tracks: VaccineTrack[]
  note?: string
}

export interface BabyVaccinationDTO {
  code: string
  status: VaccinationStatus
  givenOn: IsoDate | null
}

export interface SaveBabyProfileInput {
  name?: string | null
  dob: IsoDate
  sex: BabySex
  weightKg?: number | null
  heightCm?: number | null
  gestationalWeeks?: number | null
  bloodGroup?: BloodGroup | null
}

// ── Date coercion ────────────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * `YYYY-MM-DD` → the `Date` a `@db.Date` column wants.
 *
 * Anchored at UTC midnight explicitly. `new Date('2026-03-01')` already parses
 * as UTC, but `new Date(2026, 2, 1)` does not, and the two are a day apart for
 * every caller east of Greenwich — the difference between a baby's first
 * birthday and the day before it.
 */
function toDate(iso: IsoDate): Date {
  if (!ISO_DATE_RE.test(iso)) throw new Error(`Not an ISO date: ${iso}`)
  return new Date(`${iso}T00:00:00.000Z`)
}

/** The inverse. Read in UTC, because that is the zone it was written in. */
function toIso(date: Date | null): IsoDate | null {
  return date ? date.toISOString().slice(0, 10) : null
}

// ── The baby ─────────────────────────────────────────────────────────────────

function toProfileDTO(row: {
  id: string
  name: string | null
  dob: Date
  sex: BabySex
  weightKg: number | null
  heightCm: number | null
  gestationalWeeks: number | null
  bloodGroup: DbBloodGroup | null
  updatedAt: Date
}): BabyProfileDTO {
  return {
    id: row.id,
    name: row.name,
    dob: toIso(row.dob) as IsoDate,
    sex: row.sex,
    weightKg: row.weightKg,
    heightCm: row.heightCm,
    gestationalWeeks: row.gestationalWeeks,
    bloodGroup: toLabel(row.bloodGroup),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function getBabyProfile(brand: Brand, userId: string): Promise<BabyProfileDTO | null> {
  const row = await dbFor(brand).babyProfile.findUnique({ where: { userId } })
  return row ? toProfileDTO(row) : null
}

/**
 * Create or replace this account's baby, and log the measurement.
 *
 * The profile's `weightKg`/`heightCm` are the LATEST reading — denormalised
 * because every tool on the page asks "how big is this baby now" and none of
 * them asks for a series. `BabyMeasurement` is the series, so an edit stops
 * destroying the previous value the way the localStorage blob always did.
 *
 * One transaction, because a profile whose measurement row failed to write is a
 * growth chart with a hole in it that nothing would ever report.
 *
 * The measurement is keyed by `(babyId, takenOn)` and upserted: a parent nudging
 * the weight field three times in a sitting is one reading, not three. `takenOn`
 * is the CALLER'S today, not `new Date()` — the route derives it from the
 * request so a test can fix it, and so a server in UTC does not file an evening
 * measurement in India under tomorrow's date.
 */
export async function saveBabyProfile(
  brand: Brand,
  userId: string,
  input: SaveBabyProfileInput,
  today: IsoDate,
): Promise<BabyProfileDTO> {
  const prisma = dbFor(brand)

  const data = {
    name: input.name?.trim() || null,
    dob: toDate(input.dob),
    sex: input.sex,
    weightKg: input.weightKg ?? null,
    heightCm: input.heightCm ?? null,
    gestationalWeeks: input.gestationalWeeks ?? null,
    bloodGroup: toDb(input.bloodGroup),
  }

  return prisma.$transaction(async (tx) => {
    const row = await tx.babyProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })

    // Only when there is something to record. A profile saved with the weight
    // field left empty must not write a row of two nulls — that is an empty
    // point on a chart, not a measurement, and it would take the day's slot.
    if (data.weightKg !== null || data.heightCm !== null) {
      const takenOn = toDate(today)
      await tx.babyMeasurement.upsert({
        where: { babyId_takenOn: { babyId: row.id, takenOn } },
        create: { babyId: row.id, takenOn, weightKg: data.weightKg, heightCm: data.heightCm },
        update: { weightKg: data.weightKg, heightCm: data.heightCm },
      })
    }

    return toProfileDTO(row)
  })
}

/**
 * Forget this account's baby.
 *
 * Measurements and vaccination records cascade — the "Clear" button on the card
 * means clear, and leaving a child's health history behind an absent profile
 * would be the kind of orphan nobody ever goes looking for.
 *
 * `deleteMany`, not `delete`: pressing Clear twice is not an error.
 */
export async function deleteBabyProfile(brand: Brand, userId: string): Promise<void> {
  await dbFor(brand).babyProfile.deleteMany({ where: { userId } })
}

/** Weight and height over time, oldest first — the order a chart plots in. */
export async function listMeasurements(
  brand: Brand,
  userId: string,
): Promise<BabyMeasurementDTO[]> {
  const rows = await dbFor(brand).babyMeasurement.findMany({
    where: { baby: { userId } },
    orderBy: { takenOn: 'asc' },
    select: { takenOn: true, weightKg: true, heightCm: true },
  })
  return rows.map((r) => ({
    takenOn: toIso(r.takenOn) as IsoDate,
    weightKg: r.weightKg,
    heightCm: r.heightCm,
  }))
}

// ── The schedule ─────────────────────────────────────────────────────────────

/**
 * The published immunisation schedule.
 *
 * Ordered by `position` — the order the seed writes and the console's move
 * buttons preserve — which groups a single visit's doses the way the published
 * table prints them. Ordering by due age instead would scatter the five doses of
 * a 6-week appointment across the list.
 *
 * Inactive rows are dropped rather than flagged: a dose withdrawn from the
 * schedule should vanish from a parent's list, and there is no read that wants
 * both. The console reads them through its own query.
 */
export async function getVaccineSchedule(brand: Brand): Promise<VaccineDoseDTO[]> {
  const rows = await dbFor(brand).vaccineDose.findMany({
    where: { active: true },
    orderBy: [{ position: 'asc' }, { code: 'asc' }],
    select: {
      code: true,
      vaccine: true,
      dose: true,
      ageUnit: true,
      ageValue: true,
      tracks: true,
      note: true,
    },
  })
  return rows.map((r) => ({
    code: r.code,
    vaccine: r.vaccine,
    dose: r.dose,
    at: { unit: r.ageUnit, value: r.ageValue },
    tracks: r.tracks,
    ...(r.note ? { note: r.note } : {}),
  }))
}

/** What this parent has marked given or skipped. Empty when there is no baby. */
export async function listVaccinations(
  brand: Brand,
  userId: string,
): Promise<BabyVaccinationDTO[]> {
  const rows = await dbFor(brand).babyVaccination.findMany({
    where: { baby: { userId } },
    select: { status: true, givenOn: true, dose: { select: { code: true } } },
  })
  return rows.map((r) => ({
    code: r.dose.code,
    status: r.status,
    givenOn: toIso(r.givenOn),
  }))
}

/**
 * Mark one dose given, skipped, or neither.
 *
 * `status: null` DELETES the record — un-ticking a box a parent ticked by
 * mistake must remove the claim, not store a third state meaning "actually no".
 * Returns `'no-profile'` rather than throwing, because a signed-in shopper with
 * no baby yet is an ordinary state of this page, not an error.
 *
 * Addressed by dose CODE, never by row id: the code is the stable key, so
 * re-seeding a corrected schedule leaves every parent's record pointing at the
 * dose they actually ticked.
 */
export async function setVaccination(
  brand: Brand,
  userId: string,
  input: { code: string; status: VaccinationStatus | null; givenOn?: IsoDate | null },
): Promise<{ status: 'ok' } | { status: 'no-profile' } | { status: 'no-dose' }> {
  const prisma = dbFor(brand)

  const [baby, dose] = await Promise.all([
    prisma.babyProfile.findUnique({ where: { userId }, select: { id: true } }),
    prisma.vaccineDose.findUnique({ where: { code: input.code }, select: { id: true } }),
  ])
  if (!baby) return { status: 'no-profile' }
  if (!dose) return { status: 'no-dose' }

  if (input.status === null) {
    await prisma.babyVaccination.deleteMany({ where: { babyId: baby.id, doseId: dose.id } })
    return { status: 'ok' }
  }

  // A skipped dose has no date by definition, so the column is cleared rather
  // than left holding whatever a previous "given" wrote.
  const givenOn =
    input.status === 'given' && input.givenOn ? toDate(input.givenOn) : null

  await prisma.babyVaccination.upsert({
    where: { babyId_doseId: { babyId: baby.id, doseId: dose.id } },
    create: { babyId: baby.id, doseId: dose.id, status: input.status, givenOn },
    update: { status: input.status, givenOn },
  })
  return { status: 'ok' }
}

// ── The care-plan lead ───────────────────────────────────────────────────────

export interface ParentingLeadInput {
  email: string
  babyName?: string | null
  dob?: IsoDate | null
  sex?: BabySex | null
  bloodGroup?: BloodGroup | null
  source?: string | null
  userId?: string | null
}

/**
 * Record that a parent asked for a care plan.
 *
 * The route used to send the email and keep nothing, so the one piece of
 * first-party data this surface collects reached the outbox and no further: no
 * list to follow up, no way to tell whether the feature is used, and no record
 * that the address was given for THIS purpose — which is what makes a later
 * marketing send defensible or not.
 *
 * Upserted on email, bumping `planCount`, so a returning parent is one row with
 * a count rather than a unique violation the route has to swallow. The baby
 * details are overwritten because the newer submission is the truer one.
 *
 * Never throws to the caller: failing to file a lead must not turn a plan the
 * parent DID receive into an error on their screen. The route logs it.
 */
export async function recordParentingLead(
  brand: Brand,
  input: ParentingLeadInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase()
  const shared = {
    babyName: input.babyName?.trim() || null,
    dob: input.dob ? toDate(input.dob) : null,
    sex: input.sex ?? null,
    bloodGroup: toDb(input.bloodGroup),
    source: input.source ?? null,
    userId: input.userId ?? null,
    lastSentAt: new Date(),
  }

  await dbFor(brand).parentingLead.upsert({
    where: { email },
    create: { email, ...shared },
    update: { ...shared, planCount: { increment: 1 } },
  })
}

// ── Everything the page needs, in one call ───────────────────────────────────

export interface ParentingPayload {
  /** The published doses. Empty when the schedule has not been seeded. */
  schedule: VaccineDoseDTO[]
  /** Null for a signed-out visitor — the browser store answers for them. */
  profile: BabyProfileDTO | null
  /** Empty for a signed-out visitor, for the same reason. */
  vaccinations: BabyVaccinationDTO[]
}

/**
 * One round trip for the whole surface.
 *
 * The page renders the schedule, the profile and the ticked doses together or
 * not at all, and three sequential awaits in a server component is three times
 * the latency for no benefit. `userId` is null for a guest, and the two
 * per-parent reads are skipped entirely rather than queried with a null key.
 */
export async function getParentingPayload(
  brand: Brand,
  userId: string | null,
): Promise<ParentingPayload> {
  const [schedule, profile, vaccinations] = await Promise.all([
    getVaccineSchedule(brand),
    userId ? getBabyProfile(brand, userId) : Promise.resolve(null),
    userId ? listVaccinations(brand, userId) : Promise.resolve([]),
  ])
  return { schedule, profile, vaccinations }
}
