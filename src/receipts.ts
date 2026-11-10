/** Shared by the server (ledger) and the page (receipts panel). No runtime imports on purpose. */

/** Stages Circle reports for a payment, in order. `failed` is terminal too. */
export const STAGES = ['received', 'batched', 'confirmed', 'completed'] as const
export type TransferStatus = (typeof STAGES)[number] | 'failed'

export interface Receipt {
  /** Circle settlement id, from the PAYMENT-RESPONSE header */
  id: string
  route: string
  payer: string
  /** USDC, decimal string */
  amount: string
  network: string
  receivedAt: string
  /** `unknown` until Circle's status endpoint has been reached once */
  status: TransferStatus | 'unknown'
  /** Onchain transaction that settled the batch, once there is one */
  txHash: string | null
  completedAt: string | null
  /** Link to the settlement transaction, when there is one */
  explorerUrl: string | null
}

export interface ReceiptsResponse {
  seller: string | null
  receipts: Receipt[]
  counts: Record<TransferStatus | 'unknown', number>
  totalUsdc: string
  /** Typical seconds from receiving a payment to its final settlement, over recent completed ones */
  medianSecondsToComplete: number | null
}

export const isTerminal = (s: Receipt['status']): boolean => s === 'completed' || s === 'failed'
