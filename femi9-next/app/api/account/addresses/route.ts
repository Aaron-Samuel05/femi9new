import { z } from 'zod'
import { badRequest, created, handle, unauthorized } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createAddress } from '@/lib/services/account'

const AddressSchema = z.object({
  label: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(120),
  line: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().max(120).optional().default(''),
  pincode: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal('')),
  phone: z.string().trim().regex(/^\d{10}$/).optional().or(z.literal('')),
  isPrimary: z.boolean().optional(),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser()
    if (!user) return unauthorized()
    const parsed = AddressSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return badRequest('Check the address fields.', parsed.error.flatten())
    const address = await createAddress(user.sub, parsed.data)
    return created({ id: address.id })
  })
}
