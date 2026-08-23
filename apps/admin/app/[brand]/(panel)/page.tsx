import { requireConsole } from '@/lib/guard'
import { brandConfig } from '@femi9/core/brands'

export default async function OverviewPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params
  const { session } = await requireConsole(brand, 'dashboard')
  const config = brandConfig(session.brand)

  return (
    <>
      <h1>{config.name} overview</h1>
      <p className="who">
        Signed in as {session.email}. This console has {config.modules.length} modules.
      </p>
    </>
  )
}
