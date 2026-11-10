import { useState } from 'react'
import { Bot, Search, Loader2 } from 'lucide-react'
import type { PricedListing } from '../registry'

const CATEGORIES = ['NLP', 'Data', 'DeFi', 'Compliance', 'Dev Tools', 'Other']

interface SelectResponse {
  best: PricedListing
  alternatives: PricedListing[]
}

type Outcome = { kind: 'found'; data: SelectResponse } | { kind: 'none' } | { kind: 'error'; message: string }

export function BuyerAgentDemo() {
  const [category, setCategory] = useState('NLP')
  const [budget, setBudget] = useState('0.01')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const run = async () => {
    setBusy(true)
    setOutcome(null)
    try {
      const qs = new URLSearchParams({ category, maxPrice: budget })
      const res = await fetch(`/api/registry/select?${qs.toString()}`)
      if (res.status === 404) setOutcome({ kind: 'none' })
      else if (!res.ok) setOutcome({ kind: 'error', message: `Registry returned HTTP ${res.status}` })
      else setOutcome({ kind: 'found', data: (await res.json()) as SelectResponse })
    } catch {
      setOutcome({ kind: 'error', message: 'Could not reach the registry backend' })
    } finally {
      setBusy(false)
    }
  }

  const field =
    'px-3 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bot size={14} className="text-[var(--accent)]" />
        <h3 className="display text-sm font-semibold text-[var(--ink)]">Buyer agent: find supply</h3>
      </div>
      <p className="text-[11px] text-[var(--subtle)]">
        This is the lookup a buyer agent runs before paying. It reads the live registry, keeps only healthy sellers, and picks the cheapest one inside the budget. No payment is made here.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--subtle)]">
          Max buyer price
          <input className={`${field} mono tabular-nums w-24`} value={budget} onChange={e => setBudget(e.target.value)} inputMode="decimal" />
          USDC
        </label>
        <button
          onClick={() => { void run() }}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[#0d1b2f] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          Find a seller
        </button>
      </div>

      {outcome?.kind === 'none' && (
        <p className="text-xs text-[var(--muted)]">No healthy seller in {category} fits that budget. A real agent would raise the budget or try another category.</p>
      )}
      {outcome?.kind === 'error' && <p className="text-xs text-[var(--danger)]">{outcome.message}</p>}
      {outcome?.kind === 'found' && <Result data={outcome.data} />}
    </div>
  )
}

function Result({ data }: { data: SelectResponse }) {
  const b = data.best
  return (
    <ol className="space-y-2 text-xs text-[var(--muted)] tabular-nums">
      <li><span className="text-[var(--subtle)]">1. Discover.</span> Registry returned {data.alternatives.length + 1} healthy candidate(s).</li>
      <li><span className="text-[var(--subtle)]">2. Select.</span> <span className="text-[var(--ink)]">{b.name}</span> is the cheapest.</li>
      <li>
        <span className="text-[var(--subtle)]">3. Quote.</span> Buyer pays <span className="text-[var(--success)]">{b.buyerPrice}</span> USDC:
        seller {b.price} + broker fee {b.brokerFee} ({b.feePercent}).
      </li>
      <li>
        <span className="text-[var(--subtle)]">4. Pay.</span> Not executed in this demo. A live agent would sign the x402 authorisation for this amount and call{' '}
        <code className="mono text-[var(--accent)]">{b.method} {b.baseUrl}{b.path}</code>.
      </li>
    </ol>
  )
}
