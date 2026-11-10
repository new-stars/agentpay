import { useCallback, useEffect, useState } from 'react'
import type { PricedListing } from './registry'

interface RegistryResponse {
  broker_fee_bps: number
  listings: PricedListing[]
}

export function useRegistry() {
  const [listings, setListings] = useState<PricedListing[]>([])
  const [feeBps, setFeeBps] = useState(50)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumping this re-runs the fetch effect below.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch('/api/registry')
        if (!res.ok) throw new Error(`Registry returned HTTP ${res.status}`)
        const json = (await res.json()) as RegistryResponse
        if (cancelled) return
        setListings(json.listings)
        setFeeBps(json.broker_fee_bps)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Registry backend is not reachable')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [version])

  const refresh = useCallback((): Promise<void> => {
    setVersion(v => v + 1)
    return Promise.resolve()
  }, [])

  return { listings, feeBps, loading, error, refresh }
}
