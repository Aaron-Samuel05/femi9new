import { ok, handle } from '@/lib/api'
import { listProducts } from '@/lib/services/products'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => ok(await listProducts()))
}
