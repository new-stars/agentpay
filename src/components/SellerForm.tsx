import { useMemo, useState, type FormEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { quote, BROKER_FEE_BPS, type PricedListing, type ListingStatus } from '../registry'
import { useLang } from '../LangContext'
import { describeError } from '../apiError'
import { fmt, money } from '../locales'

const CATEGORIES = ['NLP', 'Data', 'DeFi', 'Compliance', 'Dev Tools', 'Other']

const INITIAL = {
  name: '', description: '', category: 'Data', baseUrl: 'https://', path: '/', method: 'POST', price: '', payTo: '',
}

const field =
  'w-full px-3 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] transition-colors'

export function SellerForm({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const { t, lang } = useLang()
  const [form, setForm] = useState(INITIAL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PricedListing | null>(null)

  const set = (k: keyof typeof INITIAL) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const statusLabel: Record<ListingStatus, string> = {
    healthy: t.statusHealthy,
    unreachable: t.statusUnreachable,
    pending: t.statusPending,
  }

  // Live preview of what buyers will be charged. Invalid input just hides the preview.
  const preview = useMemo(() => {
    try {
      return form.price ? quote(form.price) : null
    } catch {
      return null
    }
  }, [form.price])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        setError(await describeError(res, t))
        return
      }
      setResult((await res.json()) as PricedListing)
      setForm(INITIAL)
      await onSubmitted()
    } catch {
      setError(t.errors.network)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={e => { void submit(e) }} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div>
        <h3 className="display text-sm font-semibold text-[var(--ink)]">{t.formTitle}</h3>
        <p className="text-[11px] text-[var(--subtle)] mt-0.5">
          {fmt(t.formIntro, { fee: `${Number(BROKER_FEE_BPS) / 100}%` })}
        </p>
      </div>

      <input className={field} placeholder={t.formName} aria-label={t.formName} value={form.name} onChange={set('name')} required minLength={3} maxLength={60} />
      <textarea className={field} placeholder={t.formDescription} aria-label={t.formDescription} value={form.description} onChange={set('description')} maxLength={300} rows={2} />

      <div className="grid grid-cols-2 gap-2">
        <select className={field} value={form.category} onChange={set('category')} aria-label={t.mkTitle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{t.categories[c] ?? c}</option>)}
        </select>
        <select className={field} value={form.method} onChange={set('method')} aria-label="HTTP">
          <option>POST</option>
          <option>GET</option>
        </select>
      </div>

      <input dir="ltr" className={field} placeholder="https://api.your-domain.com" aria-label="URL" value={form.baseUrl} onChange={set('baseUrl')} required />
      <input dir="ltr" className={field} placeholder="/v1/summarize" aria-label="URL" value={form.path} onChange={set('path')} required />

      <div className="grid grid-cols-2 gap-2">
        <input dir="ltr" className={`${field} tabular-nums`} placeholder={t.formPrice} aria-label={t.formPrice} value={form.price} onChange={set('price')} inputMode="decimal" required />
        <input dir="ltr" className={`${field} mono`} placeholder={t.formPayTo} aria-label={t.formPayTo} value={form.payTo} onChange={set('payTo')} required />
      </div>

      {preview && (
        <p className="text-[11px] text-[var(--muted)] tabular-nums">
          {fmt(t.formYouReceive, { price: money(lang, form.price), buyer: money(lang, preview.buyerPrice), fee: money(lang, preview.brokerFee) })}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {busy ? t.formChecking : t.formSubmit}
      </button>

      {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      {result && (
        <p className="text-[11px] text-[var(--muted)]">
          {fmt(t.formListedAs, { name: result.name, status: statusLabel[result.status] })}
          {result.status !== 'healthy' && ` ${t.formNotOffered}`}
        </p>
      )}
    </form>
  )
}
