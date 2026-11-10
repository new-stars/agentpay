import { useEffect, useState } from 'react'
import { isTerminal, type ReceiptsResponse } from './receipts'

const FAST_MS = 8_000 // something is still settling: look again soon
const SLOW_MS = 30_000 // everything is final: look rarely

/** Polls the seller's payment ledger. Pauses while the tab is hidden and stops when the panel unmounts. */
export function useReceipts() {
  const [data, setData] = useState<ReceiptsResponse | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      let next = SLOW_MS
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch('/api/payments')
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const json = (await res.json()) as ReceiptsResponse
          if (cancelled) return
          setData(json)
          setFailed(false)
          if (json.receipts.some(r => !isTerminal(r.status))) next = FAST_MS
        } catch {
          if (cancelled) return
          setFailed(true)
        }
      }
      if (!cancelled) timer = setTimeout(() => void tick(), next)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return { data, failed }
}
