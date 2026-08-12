import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { updateProfile } from '@/lib/services/account'

const ProfileSchema = z.object({ name: z.string().trim().min(2).max(120) })

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser()
    if (!user) return unauthorized()
    const parsed = ProfileSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Enter a valid full name.', parsed.error.flatten())
    if (!(await updateProfile(user.sub, parsed.data))) return notFound('User not found')
    return ok({ ok: true })
  })
}
