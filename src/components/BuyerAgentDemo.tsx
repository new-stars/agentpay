import { useState } from 'react'
import { Bot, Search, Loader2 } from 'lucide-react'
import type { PricedListing } from '../registry'
import { useLang, type FullT } from '../LangContext'
import { describeError } from '../apiError'
import { extras, fmt, money } from '../locales'
import type { LangCode } from '../i18n'

const CATEGORIES = ['NLP', 'Data', 'DeFi', 'Compliance', 'Dev Tools', 'Other']

interface SelectResponse {
  best: PricedListing
  alternatives: PricedListing[]
}

type Outcome = { kind: 'found'; data: SelectResponse } | { kind: 'none' } | { kind: 'error'; message: string }

const field =
  'px-3 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] focus:outline-none focus:border-[var(--accent)]'

export function BuyerAgentDemo() {
  const { t, lang } = useLang()
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
      else if (!res.ok) setOutcome({ kind: 'error', message: await describeError(res, t) })
      else setOutcome({ kind: 'found', data: (await res.json()) as SelectResponse })
    } catch {
      setOutcome({ kind: 'error', message: t.errors.network })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bot size={14} className="text-[var(--accent)]" />
        <h3 className="display text-sm font-semibold text-[var(--ink)]">{t.agentTitle}</h3>
      </div>
      <p className="text-[11px] text-[var(--subtle)]">{t.agentIntro}</p>

      <div className="flex flex-wrap items-center gap-2">
        <select className={field} value={category} onChange={e => setCategory(e.target.value)} aria-label={t.mkTitle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{t.categories[c] ?? c}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--subtle)]">
          {t.agentMaxPrice}
          <input dir="ltr" className={`${field} tabular-nums w-24`} value={budget} onChange={e => setBudget(e.target.value)} inputMode="decimal" />
          USDC
        </label>
        <button
          onClick={() => { void run() }}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {t.agentFind}
        </button>
      </div>

      {outcome?.kind === 'none' && (
        <p className="text-xs text-[var(--muted)]">{fmt(t.agentNone, { category: t.categories[category] ?? category })}</p>
      )}
      {outcome?.kind === 'error' && <p className="text-xs text-[var(--danger)]">{outcome.message}</p>}
      {outcome?.kind === 'found' && <Result data={outcome.data} t={t} lang={lang} />}
    </div>
  )
}

function Result({ data, t, lang }: { data: SelectResponse; t: FullT; lang: LangCode }) {
  const b = data.best
  const tx = b.id === 'demo-summarizer' ? extras[lang].services.summarize : undefined
  const name = tx ? `${tx.name} · ${t.listDemoTag}` : b.name
  // The translated sentence decides where the call goes, so split around the placeholder.
  const [before, after = ''] = t.agentStep4.split('{call}')
  return (
    <ol className="space-y-2 text-xs text-[var(--muted)] tabular-nums">
      <li>{fmt(t.agentStep1, { n: data.alternatives.length + 1 })}</li>
      <li>{fmt(t.agentStep2, { name })}</li>
      <li>
        {fmt(t.agentStep3, { buyer: money(lang, b.buyerPrice), seller: money(lang, b.price), fee: money(lang, b.brokerFee), pct: b.feePercent })}
      </li>
      <li>
        {before}
        <code dir="ltr" className="mono text-[var(--accent)]">{b.method} {b.baseUrl}{b.path}</code>
        {after}
      </li>
    </ol>
  )
}
