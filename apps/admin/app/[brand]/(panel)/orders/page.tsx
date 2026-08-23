import { requireConsole } from '@/lib/guard'

export default async function OrdersPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand } = await params
  const { session } = await requireConsole(brand, 'orders')
  // Reads land here in the next slice; the point of this page today is that the
  // brand it reads for comes from the SESSION, never from the URL segment.
  return <h1>Orders · {session.brand}</h1>
}
