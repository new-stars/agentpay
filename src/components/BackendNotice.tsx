import { ServerOff } from 'lucide-react'
import { useLang } from '../LangContext'

/** Shown instead of broken-looking panels when this page has no payment server behind it. */
export function BackendNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useLang()
  return (
    <div role="status" className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] ${compact ? 'p-3' : 'p-4'} flex gap-3 items-start`}>
      <ServerOff size={16} className="text-[var(--accent)] mt-0.5 shrink-0" />
      <div>
        <p className="text-xs font-semibold text-[var(--ink)]">{t.backendOfflineTitle}</p>
        <p className="text-[11px] text-[var(--subtle)] mt-1 leading-relaxed">{t.backendOfflineBody}</p>
      </div>
    </div>
  )
}
