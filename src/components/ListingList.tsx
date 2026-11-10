import { useState } from 'react'
import { RefreshCw, Store } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import type { PricedListing, ListingStatus } from '../registry'

const STATUS_STYLE: Record<ListingStatus, { dot: string; label: string }> = {
  healthy: { dot: 'bg-[var(--success)]', label: 'Healthy' },
  unreachable: { dot: 'bg-[var(--danger)]', label: 'Unreachable' },
  pending: { dot: 'bg-[var(--subtle)]', label: 'Pending' },
}

const short = (addr: string) => (addr.startsWith('0x') ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr)

interface Props {
  listings: PricedListing[]
  loading: boolean
  error: string | null
  onChanged: () => Promise<void>
}

export function ListingList({ listings, loading, error, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const recheck = async (id: string) => {
    setBusyId(id)
    setNote(null)
    try {
      const res = await fetch(`/api/registry/${id}/check`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        setNote(body.error ?? `Check failed (HTTP ${res.status})`)
      }
      await onChanged()
    } catch {
      setNote('Could not reach the registry backend')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Store size={14} className="text-[var(--accent)]" />
          <h3 className="display text-sm font-semibold text-[var(--ink)]">Listed sellers</h3>
        </div>
        <span className="mono text-[11px] text-[var(--subtle)] tabular-nums">{listings.length} listed</span>
      </div>

      {error && (
        <p className="px-4 py-6 text-xs text-[var(--danger)]">
          Registry unavailable: {error}. The registry needs the backend server, so it does not run on static hosting.
        </p>
      )}
      {!error && loading && <p className="px-4 py-6 text-xs text-[var(--subtle)]">Loading registry…</p>}
      {!error && !loading && listings.length === 0 && (
        <p className="px-4 py-6 text-xs text-[var(--subtle)]">No sellers listed yet. Submit the first one with the form.</p>
      )}

      <ul className="divide-y divide-[var(--border)]">
        {listings.map(l => (
          <li key={l.id} className="px-4 py-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-[var(--ink)] truncate">{l.name}</p>
                <p className="mono text-[10px] text-[var(--subtle)] truncate">
                  {l.method} {l.baseUrl}{l.path}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLE[l.status].dot}`} />
                <span className="text-[11px] text-[var(--muted)]">{STATUS_STYLE[l.status].label}</span>
                <button
                  onClick={() => { void recheck(l.id) }}
                  disabled={busyId === l.id}
                  title="Re-check: the endpoint must answer HTTP 402 when called without payment"
                  className="ml-1 p-1 rounded text-[var(--subtle)] hover:text-[var(--accent)] disabled:opacity-40"
                >
                  <RefreshCw size={11} className={busyId === l.id ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <p className="text-[var(--subtle)]">Seller gets</p>
                <p className="mono tabular-nums text-[var(--ink)]">{l.price}</p>
              </div>
              <div>
                <p className="text-[var(--subtle)]">Broker fee ({l.feePercent})</p>
                <p className="mono tabular-nums text-[var(--ink)]">{l.brokerFee}</p>
              </div>
              <div>
                <p className="text-[var(--subtle)]">Buyer pays</p>
                <p className="mono tabular-nums text-[var(--success)] flex items-center gap-1">
                  <TokenUSDC variant="branded" size={11} />{l.buyerPrice}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-[var(--subtle)]">
              {l.category} · payout {short(l.payTo)}
            </p>
          </li>
        ))}
      </ul>
      {note && <p className="px-4 py-2 text-[11px] text-[var(--danger)] border-t border-[var(--border)]">{note}</p>}
    </div>
  )
}
