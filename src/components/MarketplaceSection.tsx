import { Store, Bot, Coins } from 'lucide-react'
import { useRegistry } from '../useRegistry'
import { ListingList } from './ListingList'
import { SellerForm } from './SellerForm'
import { BuyerAgentDemo } from './BuyerAgentDemo'

export function MarketplaceSection() {
  const { listings, feeBps, loading, error, refresh } = useRegistry()

  const roles = [
    { icon: Store, title: 'Sellers list an API', body: 'Any developer with a paid endpoint submits it. We check it answers HTTP 402 before agents see it.' },
    { icon: Bot, title: 'Agents find supply', body: 'Buyer agents read the registry, filter by category and budget, and pick the cheapest healthy seller.' },
    { icon: Coins, title: `Broker earns ${feeBps / 100}%`, body: 'The buyer price is the seller price plus the broker fee. The seller always receives their full price.' },
  ]

  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="display text-lg font-semibold text-[var(--ink)]">Seller marketplace</h2>
        <p className="text-xs text-[var(--subtle)] mt-0.5">
          Machine-readable registry at <code className="mono text-[var(--accent)]">GET /registry</code>
        </p>
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

      <BuyerAgentDemo />
    </section>
  )
}
