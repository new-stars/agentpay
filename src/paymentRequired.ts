import { formatUsdc } from '@/onchain-money'

export interface PaymentRequirement {
  /** Price in USDC, decimal string */
  price: string
  /** Networks the seller accepts, as CAIP-2 ids */
  networks: string[]
  scheme: string
  payTo: string
}

/**
 * Read what the seller really asked for. An x402 v2 server puts the requirements in the
 * PAYMENT-REQUIRED response header (base64 JSON); the body can be empty.
 * Returns null when the header is missing or malformed, so callers never show invented values.
 */
export function readPaymentRequired(header: string | null): PaymentRequirement | null {
  if (!header) return null
  try {
    const parsed = JSON.parse(atob(header)) as {
      accepts?: Array<{ amount?: string; network?: string; payTo?: string; extra?: { name?: string } }>
    }
    const accepts = parsed.accepts ?? []
    const first = accepts[0]
    if (!first?.amount || !/^\d{1,18}$/.test(first.amount)) return null
    return {
      price: formatUsdc(BigInt(first.amount)),
      networks: accepts.map(a => a.network ?? '').filter(Boolean),
      scheme: first.extra?.name ?? 'exact',
      payTo: first.payTo ?? '',
    }
  } catch {
    return null
  }
}
