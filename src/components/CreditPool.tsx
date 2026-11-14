import { useEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { useLang } from '../LangContext'
import { fmt, money } from '../locales'

interface Pool {
  enabled: boolean
  totalUsdc: string
  soldUsdc: string
  remainingUsdc: string
  minPurchaseUsdc: string
}

const SAMPLE = `POST /credits/buy   {"amount": "0.5"}   → { "api_key": "ak_…" }
POST /pay/summarize  Authorization: Bearer ak_…   (no payment per call)`

export function CreditPool() {
  const { t, lang } = useLang()
  const [pool, setPool] = useState<Pool | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const res = await fetch('/api/credits')
        if (res.ok && !cancelled) setPool((await res.json()) as Pool)
      } catch {
        // Backend not reachable: the card simply stays hidden.
      }
      if (!cancelled) timer = setTimeout(() => void load(), 20_000)
    }
    void load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [])

  if (!pool) return null
  const total = Number(pool.totalUsdc)
  const pct = total > 0 ? Math.min(100, (Number(pool.soldUsdc) / total) * 100) : 0
  const soldOut = pool.enabled && Number(pool.remainingUsdc) <= 0

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <Coins size={14} className="text-[var(--accent)]" />
        <h3 className="display text-sm font-semibold text-[var(--ink)]">{t.crTitle}</h3>
        {soldOut && <span className="ms-auto text-[11px] font-medium text-[var(--danger)]">{t.crSoldOut}</span>}
      </div>
      <p className="text-[11px] text-[var(--subtle)] leading-relaxed mb-3">{t.crIntro}</p>

      {!pool.enabled ? (
        <p className="text-xs text-[var(--subtle)]">{t.crDisabled}</p>
      ) : (
        <>
          <div className="h-2 rounded-full bg-[var(--border-strong)] overflow-hidden mb-1.5" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] mb-3">
            <span className="text-[var(--ink)]">{fmt(t.crRemaining, { remaining: money(lang, pool.remainingUsdc), total: money(lang, pool.totalUsdc) })}</span>
            <span className="text-[var(--subtle)]">{fmt(t.crMin, { min: money(lang, pool.minPurchaseUsdc) })}</span>
          </div>
          <p className="text-[11px] text-[var(--subtle)] mb-1">{t.crHow}</p>
          <pre dir="ltr" className="mono text-[10px] leading-relaxed rounded-lg bg-[var(--code-bg)] text-[var(--muted)] p-2.5 overflow-x-auto">{SAMPLE}</pre>
        </>
      )}
    </div>
  )
}
