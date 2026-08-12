import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, created, handle, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { deletePeriod, logPeriod } from '@/lib/services/cycle'

/**
 * POST /api/cycle/periods — log a period start for the signed-in user.
 * The start date must be a plain YYYY-MM-DD calendar day, not in the future
 * (you can't have already started a period that hasn't happened yet).
 */
const Schema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
    .refine((s) => s <= new Date().toISOString().slice(0, 10), 'That date is in the future'),
  // Period length in days — clamped to a sane menstrual range.
  lengthDays: z.number().int().min(1).max(15),
})

export async function POST(req: NextRequest) {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()

    const parsed = Schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    await logPeriod(u.sub, parsed.data.startDate, parsed.data.lengthDays)
    return created({ ok: true })
  })
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()
    const id = req.nextUrl.searchParams.get('id')?.trim()
    if (!id) return badRequest('Period id is required')
    return ok({ deleted: await deletePeriod(u.sub, id) })
  })
}
