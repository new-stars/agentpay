import { useMemo, useState, type FormEvent } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { quote, BROKER_FEE_BPS, type PricedListing } from '../registry'

const CATEGORIES = ['NLP', 'Data', 'DeFi', 'Compliance', 'Dev Tools', 'Other']

const INITIAL = {
  name: '', description: '', category: 'Data', baseUrl: 'https://', path: '/', method: 'POST', price: '', payTo: '',
}

const field =
  'w-full px-3 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)] transition-colors'

export function SellerForm({ onSubmitted }: { onSubmitted: () => Promise<void> }) {
  const [form, setForm] = useState(INITIAL)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PricedListing | null>(null)

  const set = (k: keyof typeof INITIAL) => (e: { target: { value: string } }) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

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
      const body = (await res.json()) as PricedListing & { error?: string }
      if (!res.ok) {
        setError(body.error ?? `Submission failed (HTTP ${res.status})`)
        return
      }
      setResult(body)
      setForm(INITIAL)
      await onSubmitted()
    } catch {
      setError('Could not reach the registry backend')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={e => { void submit(e) }} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div>
        <h3 className="display text-sm font-semibold text-[var(--ink)]">List your API</h3>
        <p className="text-[11px] text-[var(--subtle)] mt-0.5">
          Your endpoint must answer HTTP 402 when called without payment. Buyers pay your price plus a {Number(BROKER_FEE_BPS) / 100}% broker fee.
        </p>
      </div>

      <input className={field} placeholder="Service name" value={form.name} onChange={set('name')} required minLength={3} maxLength={60} />
      <textarea className={field} placeholder="What does it do? (max 300 characters)" value={form.description} onChange={set('description')} maxLength={300} rows={2} />

      <div className="grid grid-cols-2 gap-2">
        <select className={field} value={form.category} onChange={set('category')}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className={field} value={form.method} onChange={set('method')}>
          <option>POST</option>
          <option>GET</option>
        </select>
      </div>

      <input className={field} placeholder="https://api.your-domain.com" value={form.baseUrl} onChange={set('baseUrl')} required />
      <input className={field} placeholder="/v1/summarize" value={form.path} onChange={set('path')} required />

      <div className="grid grid-cols-2 gap-2">
        <input className={`${field} mono tabular-nums`} placeholder="Price, USDC (e.g. 0.01)" value={form.price} onChange={set('price')} inputMode="decimal" required />
        <input className={`${field} mono`} placeholder="Payout address 0x…" value={form.payTo} onChange={set('payTo')} required />
      </div>

      {preview && (
        <p className="text-[11px] text-[var(--muted)] tabular-nums">
          You receive <span className="text-[var(--ink)]">{form.price}</span> USDC. Buyers see{' '}
          <span className="text-[var(--success)]">{preview.buyerPrice}</span> USDC (fee {preview.brokerFee}).
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[#0d1b2f] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
        {busy ? 'Checking your endpoint…' : 'Submit listing'}
      </button>

      {error && <p className="text-[11px] text-[var(--danger)]">{error}</p>}
      {result && (
        <p className="text-[11px] text-[var(--muted)]">
          Listed as <span className="text-[var(--ink)]">{result.name}</span>. Health check:{' '}
          <span className={result.status === 'healthy' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{result.status}</span>.
          {result.status !== 'healthy' && ' It will not be offered to buyer agents until it answers HTTP 402.'}
        </p>
      )}
    </form>
  )
}
