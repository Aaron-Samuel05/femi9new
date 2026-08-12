import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { badRequest, created, handle, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { deleteSymptom, logSymptom } from '@/lib/services/cycle'

/**
 * POST /api/cycle/symptoms — log a symptom intensity for the signed-in user.
 * `level` is a 0-3 intensity, matching the SymptomLog schema and the dashboard's
 * three-dot strip.
 */
const Schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date'),
  symptom: z.string().trim().min(1).max(40),
  level: z.number().int().min(0).max(3),
})

export async function POST(req: NextRequest) {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()

    const parsed = Schema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Invalid request', parsed.error.flatten())

    const { date, symptom, level } = parsed.data
    await logSymptom(u.sub, date, symptom, level)
    return created({ ok: true })
  })
}

export async function DELETE(req: NextRequest) {
  return handle(async () => {
    const u = await requireUser()
    if (!u) return unauthorized()
    const id = req.nextUrl.searchParams.get('id')?.trim()
    if (!id) return badRequest('Symptom id is required')
    return ok({ deleted: await deleteSymptom(u.sub, id) })
  })
}
