'use client'

import { useRouter } from 'next/navigation'
import type { Brand } from '@femi9/db'

/** Signs out of ONE brand — the other tab's console stays signed in. */
export function SignOut({ brand }: { brand: Brand }) {
  const router = useRouter()
  return (
    <button
      className="signout"
      type="button"
      onClick={async () => {
        await fetch(`/api/auth/logout?brand=${brand}`, { method: 'POST' })
        router.push(`/login?brand=${brand}`)
        router.refresh()
      }}
    >
      Sign out
    </button>
  )
}
