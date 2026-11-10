import { useEffect, useState, type FormEvent } from 'react'
import { Globe2, Search, Loader2, ExternalLink } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { useLang } from '../LangContext'
import { fmt, money, NUMBER_LOCALE } from '../locales'

interface DiscoveryItem {
  resource: string
  provider: string
  description: string
  category: string
  method: 'GET' | 'POST'
  priceUsdc: string | null
  gateway: boolean
}
interface DiscoveryResponse {
  items: DiscoveryItem[]
  total: number
}

const CATEGORY_KEYS = ['SOCIAL_INTELLIGENCE', 'FINANCIAL_ANALYSIS', 'WEB_SEARCH_RESEARCH', 'PREDICTION_MARKETS', 'CREATIVE', 'INFRASTRUCTURE']

const field =
  'px-3 py-2 rounded-xl text-xs bg-[var(--surface)] border border-[var(--border)] text-[var(--ink)] placeholder-[var(--subtle)] focus:outline-none focus:border-[var(--accent)]'

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export function DiscoveryPanel() {
  const { t, lang } = useLang()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  // The request that is currently shown. Changing it (on submit) triggers a fetch.
  const [request, setRequest] = useState({ q: '', category: '' })
  const [data, setData] = useState<DiscoveryResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const qs = new URLSearchParams()
        if (request.q) qs.set('q', request.q)
        if (request.category) qs.set('category', request.category)
        const res = await fetch(`/api/registry/discover?${qs.toString()}`)
        if (!res.ok) throw new Error('discovery')
        const json = (await res.json()) as DiscoveryResponse
        if (!cancelled) { setData(json); setFailed(false) }
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [request])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setRequest({ q: q.trim(), category })
  }

  const count = new Intl.NumberFormat(NUMBER_LOCALE[lang])

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Globe2 size={14} className="text-[var(--accent)]" />
        <h3 className="display text-sm font-semibold text-[var(--ink)]">{t.discTitle}</h3>
      </div>
      <p className="text-[11px] text-[var(--subtle)]">{t.discIntro}</p>

      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input className={`${field} flex-1 min-w-40`} value={q} onChange={e => setQ(e.target.value)} placeholder={t.discSearch} aria-label={t.discSearch} maxLength={64} />
        <select className={field} value={category} onChange={e => setCategory(e.target.value)} aria-label={t.discAllCategories}>
          <option value="">{t.discAllCategories}</option>
          {CATEGORY_KEYS.map(k => <option key={k} value={k}>{t.discCategories[k]}</option>)}
        </select>
        <button type="submit" disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          {t.discSearchBtn}
        </button>
      </form>

      {failed && <p className="text-xs text-[var(--danger)]">{t.discError}</p>}
      {!failed && data && data.items.length === 0 && <p className="text-xs text-[var(--muted)]">{t.discNone}</p>}

      {!failed && data && data.items.length > 0 && (
        <>
          <p className="text-[11px] text-[var(--subtle)] tabular-nums">
            {fmt(t.discResults, { shown: count.format(data.items.length), total: count.format(data.total) })}
          </p>
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] overflow-hidden">
            {data.items.map(it => (
              <li key={`${it.resource}-${it.method}`} className="px-3 py-2.5 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--ink)] truncate">{it.provider || hostOf(it.resource)}</p>
                    <a href={it.resource} target="_blank" rel="noopener noreferrer" dir="ltr" className="mono text-[10px] text-[var(--subtle)] hover:text-[var(--accent)] inline-flex items-center gap-1 max-w-full">
                      <span className="truncate">{it.method} {hostOf(it.resource)}</span>
                      <ExternalLink size={9} className="shrink-0" />
                    </a>
                  </div>
                  {it.priceUsdc && (
                    <span className="shrink-0 flex items-center gap-1 text-[11px] text-[var(--success)] tabular-nums">
                      <TokenUSDC variant="branded" size={11} />
                      {fmt(t.discFrom, { price: money(lang, it.priceUsdc) })}
                    </span>
                  )}
                </div>
                {it.description && <p className="text-[11px] text-[var(--muted)] leading-relaxed line-clamp-2">{it.description}</p>}
                <p className="text-[10px] text-[var(--subtle)]">
                  {t.discCategories[it.category] ?? ''}{it.gateway ? `${t.discCategories[it.category] ? ' · ' : ''}Circle Gateway` : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-[10px] text-[var(--subtle)] leading-relaxed">{t.discNote}</p>
    </div>
  )
}
