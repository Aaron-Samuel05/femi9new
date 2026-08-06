import { ok, handle } from '@/lib/api'
import { getSettings } from '@/lib/services/settings'

export const dynamic = 'force-dynamic'

export async function GET() {
  return handle(async () => ok(await getSettings()))
}
