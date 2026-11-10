import { parseUsdc, formatUsdc } from './onchain-money'

/** Broker fee in basis points. 50 bps = 0.5%. */
export const BROKER_FEE_BPS = 50n
const BPS_DENOMINATOR = 10_000n

export type ListingStatus = 'pending' | 'healthy' | 'unreachable'

export interface Listing {
  id: string
  name: string
  description: string
  category: string
  baseUrl: string
  path: string
  method: 'GET' | 'POST'
  /** Seller's own price per call, USDC decimal string. */
  price: string
  payTo: string
  status: ListingStatus
  lastCheckedAt: string | null
  createdAt: string
}

export interface PricedListing extends Listing {
  /** What the buyer pays: seller price plus broker fee. */
  buyerPrice: string
  brokerFee: string
  feePercent: string
}

/** Integer micro-USDC math. The fee rounds up so the broker never undercharges. */
export function quote(price: string): { buyerPrice: string; brokerFee: string } {
  const base = parseUsdc(price)
  const fee = (base * BROKER_FEE_BPS + BPS_DENOMINATOR - 1n) / BPS_DENOMINATOR
  return { buyerPrice: formatUsdc(base + fee), brokerFee: formatUsdc(fee) }
}

export function withQuote(l: Listing): PricedListing {
  const q = quote(l.price)
  return { ...l, ...q, feePercent: `${Number(BROKER_FEE_BPS) / 100}%` }
}
