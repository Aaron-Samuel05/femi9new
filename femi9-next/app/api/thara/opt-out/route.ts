import { NextResponse } from 'next/server'
import { handle, unauthorized, notFound } from '@/lib/api'
import { getSession } from '@/lib/auth'
import { optOutUser } from '@/lib/services/thara'
import { isTharaEnabled } from '@/lib/thara/feature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return handle(async () => {
    if (!isTharaEnabled()) return notFound()
    const session = await getSession()
    if (!session) return unauthorized()
    await optOutUser(session.sub)
    return new NextResponse(null, { status: 204 })
  })
}
