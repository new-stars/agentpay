import { useState } from 'react'
import { RefreshCw, Store } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { PricedListing, ListingStatus } from '../registry'
import { useLang } from '../LangContext'
import { describeError } from '../apiError'
import { fmt, money } from '../locales'

const STATUS_DOT: Record<ListingStatus, string> = {
  healthy: 'bg-[var(--success)]',
  unreachable: 'bg-[var(--danger)]',
  pending: 'bg-[var(--subtle)]',
}

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

interface Props {
  listings: PricedListing[]
  loading: boolean
  error: string | null
  onChanged: () => Promise<void>
}

export function ListingList({ listings, loading, error, onChanged }: Props) {
  const { t, lang } = useLang()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const statusLabel: Record<ListingStatus, string> = {
    healthy: t.statusHealthy,
    unreachable: t.statusUnreachable,
    pending: t.statusPending,
  }

  const recheck = async (id: string) => {
    setBusyId(id)
    setNote(null)
    try {
      const res = await fetch(`/api/registry/${id}/check`, { method: 'POST' })
      if (!res.ok) setNote(await describeError(res, t))
      await onChanged()
    } catch {
      setNote(t.errors.network)
    } finally {
      setBusyId(null)
    }
  }

  // The operator's own demo listing is stored in English on the server, so its name is localised here.
  const displayName = (l: PricedListing) => {
    const tx = l.id === 'demo-summarizer' ? t.services.summarize : undefined
    return tx ? `${tx.name} · ${t.listDemoTag}` : l.name
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Store size={14} className="text-[var(--accent)]" />
          <h3 className="display text-sm font-semibold text-[var(--ink)]">{t.listTitle}</h3>
        </div>
        <span className="text-[11px] text-[var(--subtle)] tabular-nums">{fmt(t.listCount, { n: listings.length })}</span>
      </div>

      {error && <p className="px-4 py-6 text-xs text-[var(--danger)]">{fmt(t.listUnavailable, { error: t.errors.network })}</p>}
      {!error && loading && <p className="px-4 py-6 text-xs text-[var(--subtle)]">{t.listLoading}</p>}
      {!error && !loading && listings.length === 0 && <p className="px-4 py-6 text-xs text-[var(--subtle)]">{t.listEmpty}</p>}

      <ul className="divide-y divide-[var(--border)]">
        {listings.map(l => (
          <li key={l.id} className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)] truncate">{displayName(l)}</p>
                <p dir="ltr" className="mono text-[10px] text-[var(--subtle)] truncate text-start">
                  {l.method} {l.baseUrl}{l.path}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[l.status]}`} />
                <span className="text-[11px] text-[var(--muted)]">{statusLabel[l.status]}</span>
                <button
                  onClick={() => { void recheck(l.id) }}
                  disabled={busyId === l.id}
                  title={t.listRecheckTitle}
                  aria-label={t.listRecheckTitle}
                  className="ms-1 p-1 rounded text-[var(--subtle)] hover:text-[var(--accent)] disabled:opacity-40"
                >
                  <RefreshCw size={11} className={busyId === l.id ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <p className="text-[var(--subtle)]">{t.listSellerGets}</p>
                <p className="tabular-nums text-[var(--ink)]">{money(lang, l.price)}</p>
              </div>
              <div>
                <p className="text-[var(--subtle)]">{fmt(t.listBrokerFee, { pct: l.feePercent })}</p>
                <p className="tabular-nums text-[var(--ink)]">{money(lang, l.brokerFee)}</p>
              </div>
              <div>
                <p className="text-[var(--subtle)]">{t.listBuyerPays}</p>
                <p className="tabular-nums text-[var(--success)] flex items-center gap-1">
                  <TokenUSDC variant="branded" size={11} />{money(lang, l.buyerPrice)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--subtle)]">
              {t.categories[l.category] ?? l.category} · {t.listPayout}{' '}
              <span dir="ltr" className="mono">{l.payTo.startsWith('0x') ? short(l.payTo) : t.listNotConfigured}</span>
            </p>
          </li>
        ))}
      </ul>
      {note && <p className="px-4 py-2 text-[11px] text-[var(--danger)] border-t border-[var(--border)]">{note}</p>}
    </div>
  )
}
