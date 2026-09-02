import { requireConsole } from '@/lib/guard'

/**
 * The module gate for `/[brand]/parenting`.
 *
 * The page itself is a client component (the schedule is edited inline), so it
 * cannot call `requireConsole` — hence a server layout that does. Every other
 * server page in the console passes its module name to the guard; a client page
 * needs this wrapper to get the same check.
 *
 * `hasModule` answers 404, not 403: Femi9's staff should not learn that Lumi9
 * runs a parenting surface by guessing a URL. The API routes gate themselves the
 * same way — hiding a nav link is decoration, and this is what actually decides.
 */
export default async function ParentingLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ brand: string }>
}) {
  await requireConsole((await params).brand, 'parenting')
  return <>{children}</>
}
