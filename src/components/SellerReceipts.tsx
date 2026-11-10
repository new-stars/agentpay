import { ExternalLink, Receipt as ReceiptIcon } from 'lucide-react'
import { useLang } from '../LangContext'
import { fmt, money, NUMBER_LOCALE } from '../locales'
import { STAGES, type Receipt } from '../receipts'
import { useReceipts } from '../useReceipts'
import type { LangCode } from '../i18n'
import type { FullT } from '../LangContext'

const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

function ago(lang: LangCode, iso: string): string {
  const seconds = Math.round((Date.parse(iso) - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(NUMBER_LOCALE[lang], { numeric: 'auto' })
  const abs = Math.abs(seconds)
  if (abs < 60) return rtf.format(seconds, 'second')
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute')
  return rtf.format(Math.round(seconds / 3600), 'hour')
}

function duration(lang: LangCode, seconds: number): string {
  const minutes = seconds >= 90
  const value = minutes ? Math.round(seconds / 60) : Math.round(seconds)
  return new Intl.NumberFormat(NUMBER_LOCALE[lang], {
    style: 'unit', unit: minutes ? 'minute' : 'second', unitDisplay: 'long',
  }).format(value)
}

function stageLabel(t: FullT, s: Receipt['status']): string {
  switch (s) {
    case 'received': return t.rcStageReceived
    case 'batched': return t.rcStageBatched
    case 'confirmed': return t.rcStageConfirmed
    case 'completed': return t.rcStageCompleted
    case 'failed': return t.rcStageFailed
    default: return t.rcStageUnknown
  }
}

/** Four segments: filled up to the stage the payment has reached. */
function Progress({ status }: { status: Receipt['status'] }) {
  const reached = status === 'failed' || status === 'unknown' ? -1 : STAGES.indexOf(status)
  return (
    <div className="flex gap-0.5 w-16" aria-hidden="true">
      {STAGES.map((s, i) => (
        <span
          key={s}
          className={`h-1 flex-1 rounded-full ${
            status === 'failed' ? 'bg-[var(--error,#ef4444)]' : i <= reached ? 'bg-[var(--success)]' : 'bg-[var(--border-strong)]'
          }`}
        />
      ))}
    </div>
  )
}

export function SellerReceipts() {
  const { t, lang } = useLang()
  const { data, failed } = useReceipts()

  const total = data ? data.receipts.length : 0
  const done = data?.counts.completed ?? 0

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-2 mb-1">
        <ReceiptIcon size={14} className="text-[var(--accent)]" />
        <h3 className="display text-sm font-semibold text-[var(--ink)]">{t.rcTitle}</h3>
        {data && total > 0 && (
          <span className="ms-auto text-[11px] text-[var(--subtle)]">
            {fmt(t.rcSummary, { n: Object.values(data.counts).reduce((a, b) => a + b, 0), amount: money(lang, data.totalUsdc) })}
          </span>
        )}
      </div>
      <p className="text-[11px] text-[var(--subtle)] leading-relaxed mb-3">{t.rcIntro}</p>

      {failed && !data && <p className="text-xs text-[var(--subtle)]">{t.rcError}</p>}
      {data && !data.seller && <p className="text-xs text-[var(--subtle)]">{t.rcNoSeller}</p>}
      {data?.seller && total === 0 && <p className="text-xs text-[var(--subtle)]">{t.rcEmpty}</p>}

      {data && total > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 text-[11px]">
            {[...STAGES, 'failed' as const].map(s => (
              <span key={s} className="text-[var(--muted)]">
                {stageLabel(t, s)} <b className="text-[var(--ink)]">{data.counts[s]}</b>
              </span>
            ))}
            <span className="ms-auto text-[var(--subtle)]">
              {data.medianSecondsToComplete !== null && done > 0
                ? fmt(t.rcMedian, { time: duration(lang, data.medianSecondsToComplete) })
                : t.rcMedianNone}
            </span>
          </div>

          <ul className="divide-y divide-[var(--border)]">
            {data.receipts.slice(0, 8).map(r => (
              <li key={r.id} className="py-2 flex items-center gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="mono text-[var(--ink)]" dir="ltr">{r.route}</span>
                    <span className="mono text-[var(--ink)]">{money(lang, r.amount)} USDC</span>
                  </div>
                  <div className="text-[10px] text-[var(--subtle)] truncate">
                    {fmt(t.rcFrom, { payer: short(r.payer) })} · {ago(lang, r.receivedAt)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[11px] font-medium ${r.status === 'completed' ? 'text-[var(--success)]' : r.status === 'failed' ? 'text-[var(--error,#ef4444)]' : 'text-[var(--muted)]'}`}>
                    {stageLabel(t, r.status)}
                  </span>
                  <Progress status={r.status} />
                </div>
                {r.explorerUrl?.startsWith('https://') ? (
                  <a
                    href={r.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t.rcViewTx}
                    aria-label={t.rcViewTx}
                    className="text-[var(--subtle)] hover:text-[var(--accent)] shrink-0"
                  >
                    <ExternalLink size={12} />
                  </a>
                ) : (
                  <span className="w-3 shrink-0" />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
