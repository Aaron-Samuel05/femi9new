import { requireConsole } from '@/lib/guard'

/**
 * Femi9-only. `requireConsole` 404s this for Lumi9 because `thara` is absent
 * from that brand's module list — the guard, not the missing nav link, is what
 * enforces it.
 */
export default async function TharaPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params
  await requireConsole(brand, 'thara')
  return <h1>Thara</h1>
}
