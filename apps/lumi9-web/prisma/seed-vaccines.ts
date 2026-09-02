/**
 * Seed the published immunisation schedule into the `lumi9` schema.
 *
 *   DATABASE_URL_LUMI9=postgresql://…/db?schema=lumi9 npm run db:seed-vaccines
 *
 * `src/lib/immunisation-schedule.data.ts` is this seed's INPUT, exactly as
 * `src/lib/catalog.ts` is the catalogue seed's and `src/lib/journal.ts` is the
 * journal's. The storefront reads the DATABASE through
 * `@femi9/core/services/parenting`, so editing that module changes what a fresh
 * seed writes and nothing that is already live.
 *
 * Its own command, and NOT part of `db:seed`, for the reason the journal seed is
 * separate: re-seeding a price must not silently rewrite a medical table that
 * somebody has since corrected in the console.
 *
 * ⚠️ It DOES overwrite a dose the console has since edited. That is the trade
 * for idempotence. Run it once to import, then edit in the console.
 *
 * **Nothing here is invented.** The module is a verbatim transcription of the
 * schedule supplied by the site owner; this script moves it into rows and adds
 * no dose, no age and no clinical caveat that was not in that text.
 */
import { dbFor } from '@femi9/db'
import { DOSES } from '../src/lib/immunisation-schedule.data'

const BRAND = 'lumi9' as const

async function main() {
  const db = dbFor(BRAND)

  // Loud rather than silently writing nothing. An empty module means somebody
  // gutted the transcription, and a zero-row schedule is exactly the state the
  // storefront renders as "we're still finalising this" — a message nobody
  // would connect back to a seed that reported success.
  if (DOSES.length === 0) {
    throw new Error('immunisation-schedule.data.ts has no doses — nothing to seed.')
  }

  let created = 0
  let updated = 0

  for (const [index, dose] of DOSES.entries()) {
    const data = {
      vaccine: dose.vaccine,
      dose: dose.dose,
      ageUnit: dose.at.unit,
      ageValue: dose.at.value,
      tracks: dose.track,
      note: dose.note ?? null,
      // The module's order IS the published table's order, which groups a
      // single visit's doses together. Ordering by due age instead would
      // scatter the five doses of a 6-week appointment across the list.
      position: index,
      active: true,
    }

    const existing = await db.vaccineDose.findUnique({
      where: { code: dose.id },
      select: { id: true },
    })

    if (existing) {
      await db.vaccineDose.update({ where: { id: existing.id }, data })
      updated++
    } else {
      // `code` is the module's `id` ("penta-1"). It is the stable key every
      // BabyVaccination points at, so re-running this never orphans a parent's
      // record.
      await db.vaccineDose.create({ data: { ...data, code: dose.id } })
      created++
    }
  }

  /*
   * A dose the module no longer lists is DEACTIVATED, not deleted.
   *
   * Deleting cascades to `BabyVaccination` and would erase a parent's record
   * that their child had that dose — a withdrawn vaccine is still one the baby
   * received. `active: false` drops it from every parent's list while the
   * history survives.
   */
  const codes = DOSES.map((d) => d.id)
  const retired = await db.vaccineDose.updateMany({
    where: { code: { notIn: codes }, active: true },
    data: { active: false },
  })

  console.log(
    JSON.stringify(
      { brand: BRAND, doses: { created, updated }, deactivated: retired.count },
      null,
      2,
    ),
  )

  await db.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
