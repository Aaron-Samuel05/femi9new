'use client'

import { useEffect, useState } from 'react'

export interface PublicSettings {
  freeShipThreshold: number
  subscribeSavePct: number
  whatsappNumber: string
}

const DEFAULTS: PublicSettings = {
  freeShipThreshold: 999,
  subscribeSavePct: 15,
  whatsappNumber: '919042916499',
}

export function usePublicSettings(): PublicSettings {
  const [settings, setSettings] = useState(DEFAULTS)
  useEffect(() => {
    let active = true
    fetch('/api/settings')
      .then((res) => res.ok ? res.json() : Promise.reject())
      .then((data) => {
        if (active) setSettings({
          freeShipThreshold: Number(data.freeShipThreshold) || DEFAULTS.freeShipThreshold,
          subscribeSavePct: Number(data.subscribeSavePct) || DEFAULTS.subscribeSavePct,
          whatsappNumber: String(data.whatsappNumber || DEFAULTS.whatsappNumber),
        })
      })
      .catch(() => {})
    return () => { active = false }
  }, [])
  return settings
}
