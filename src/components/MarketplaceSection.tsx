import { Store, Bot, Coins } from 'lucide-react'
import { useRegistry } from '../useRegistry'
import { useLang } from '../LangContext'
import { fmt } from '../locales'
import { ListingList } from './ListingList'
import { SellerForm } from './SellerForm'
import { BuyerAgentDemo } from './BuyerAgentDemo'
import { DiscoveryPanel } from './DiscoveryPanel'

export function MarketplaceSection() {
  const { t } = useLang()
  const { listings, feeBps, loading, error, refresh } = useRegistry()

  const roles = [
    { icon: Store, title: t.mkRole1Title, body: t.mkRole1Body },
    { icon: Bot, title: t.mkRole2Title, body: t.mkRole2Body },
    { icon: Coins, title: fmt(t.mkRole3Title, { fee: `${feeBps / 100}%` }), body: t.mkRole3Body },
  ]

  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="display text-lg font-semibold text-[var(--ink)]">{t.mkTitle}</h2>
        <p className="text-xs text-[var(--subtle)] mt-0.5">{t.mkSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {roles.map(r => (
          <div key={r.title} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <r.icon size={14} className="text-[var(--accent)] mb-2" />
            <p className="text-xs font-semibold text-[var(--ink)]">{r.title}</p>
            <p className="text-[11px] text-[var(--subtle)] mt-1 leading-relaxed">{r.body}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ListingList listings={listings} loading={loading} error={error} onChanged={refresh} />
        <SellerForm onSubmitted={refresh} />
      </div>

      <div className="space-y-4">
        <DiscoveryPanel />
        <BuyerAgentDemo />
      </div>
    </section>
  )
}
