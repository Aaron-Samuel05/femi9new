import { z } from 'zod'
import { badRequest, handle, notFound, ok, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { deleteAddress, updateAddress } from '@/lib/services/account'

const PatchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  line: z.string().trim().min(3).max(300).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  state: z.string().trim().max(120).optional(),
  pincode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal('')),
  phone: z.string().trim().regex(/^\d{10}$/).optional().or(z.literal('')),
  isPrimary: z.boolean().optional(),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser()
    if (!user) return unauthorized()
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Check the address fields.', parsed.error.flatten())
    const address = await updateAddress(user.sub, (await ctx.params).id, parsed.data)
    if (!address) return notFound('Address not found')
    return ok({ ok: true })
  })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser()
    if (!user) return unauthorized()
    const result = await deleteAddress(user.sub, (await ctx.params).id)
    if (result === 'missing') return notFound('Address not found')
    if (result === 'in-use') return badRequest('An address used by an order cannot be deleted.')
    return ok({ ok: true })
  })
}
