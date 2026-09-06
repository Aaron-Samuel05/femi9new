import { notFound, redirect } from 'next/navigation'
import { isBrand } from '@femi9/db'
import { getAdminSession } from '@femi9/core/admin-identity'
import { ChangePasswordCard } from './ChangePasswordCard'

/**
 * /<brand>/change-password
 *
 * The one screen an invited admin sees before anything else, until they set
 * their own password. The proxy corrals them here on every request; this page
 * is exempt from that same redirect via the `rest[0] === 'change-password'`
 * check.
 *
 * Also reachable from a link in the header for a normal admin who wants to
 * rotate their password proactively — the form is the same, only the copy
 * differs slightly ("must change" banner vs a neutral header).
 */

export const dynamic = 'force-dynamic'

export default async function ChangePasswordPage(props: {
  params: Promise<{ brand: string }>
}) {
  const { brand } = await props.params
  if (!isBrand(brand)) notFound()

  const session = await getAdminSession(brand)
  // The proxy would already have redirected to /login for an unauthenticated
  // request, but defence in depth: an operator hitting this URL directly with
  // no cookie should not see the form.
  if (!session) redirect(`/login?brand=${brand}&next=/${brand}/change-password`)

  return (
    <ChangePasswordCard
      brand={brand}
      email={session.email}
      forced={session.mustChangePassword === true}
    />
  )
}
