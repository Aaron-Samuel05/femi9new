import 'server-only'
import { Prisma } from '@prisma/client'
import { dbFor, type Brand } from '@femi9/db'
import { getSettings, type Settings } from '../settings'

/**
 * Admin settings service — the write-side of the "customizable backend".
 *
 * Reads reuse getSettings(brand) so the editor and the live storefront always agree
 * on what "current" means (a missing row shows its baked-in default, never a
 * blank). Writes upsert one Setting row per changed key; numeric fields are
 * stored as whole-number Json so the storefront reads back an Int, not a
 * "225"-style string that would only survive because getSettings(brand) coerces it.
 */

// The only keys this editor may write. Numeric ones are truncated to Int before
// storage; whatsappNumber is a free-form string. Anything else in the Setting
// table (future flags, etc.) is out of scope and left untouched.
const NUMERIC_KEYS = new Set<keyof Settings>([
  'freeShipThreshold',
  'subscribeSavePct',
  'pointsPerRupee',
  'firstOrderBonusPoints',
])

export type SettingsPatch = Partial<Settings>

/** Current editable settings, defaulted — the form's initial values. */
export async function getEditableSettings(brand: Brand): Promise<Settings> {
  return getSettings(brand)
}

/**
 * Upsert the provided settings and return the fresh, defaulted view. Runs the
 * upserts in one transaction so a partial failure never leaves the config in a
 * half-applied state.
 */
export async function updateSettings(brand: Brand, patch: SettingsPatch): Promise<Settings> {
  const prisma = dbFor(brand)
  const ops = (Object.entries(patch) as [keyof Settings, Settings[keyof Settings]][])
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      // Coerce numeric keys to Int here (belt-and-braces alongside the zod layer)
      // so storage stays typed regardless of how the caller reached this service.
      const stored: Prisma.InputJsonValue = NUMERIC_KEYS.has(key)
        ? Math.trunc(Number(value))
        : (value as string)
      return prisma.setting.upsert({
        where: { key },
        create: { key, value: stored },
        update: { value: stored },
      })
    })

  if (ops.length) await prisma.$transaction(ops)

  return getSettings(brand)
}
