import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/admin-auth'
import { isTharaEnabled } from '@/lib/thara/feature'
import '@/styles/admin.css'
import { AdminShell } from './_shell'

// Authentication is cookie-backed and must be evaluated for every request.
export const dynamic = 'force-dynamic'

/**
 * Guarded admin shell. Server component: it resolves the session before any
 * child renders and redirects unauthenticated visitors to the login screen
 * (belt-and-braces with the edge middleware). The login page lives OUTSIDE this
 * (panel) group, so it never inherits this sidebar chrome.
 */
export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')
  const tharaEnabled = isTharaEnabled()

  return <AdminShell session={session} tharaEnabled={tharaEnabled}>{children}</AdminShell>
}
