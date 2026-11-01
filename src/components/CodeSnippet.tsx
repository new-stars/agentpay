import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

const TABS = [
  { id: 'buyer-ts',   label: 'Buyer · TypeScript',  lang: 'TypeScript' },
  { id: 'seller-ts',  label: 'Seller · TypeScript',  lang: 'TypeScript' },
  { id: 'buyer-py',   label: 'Buyer · Python',        lang: 'Python'     },
] as const
type TabId = (typeof TABS)[number]['id']

const CODES: Record<TabId, string> = {
  'buyer-ts': `// Agent buyer — pays for APIs automatically via HTTP 402 + Circle Gateway
// Drop-in: any x402 endpoint on Arc Testnet or mainnet

import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { withPaymentInterceptor } from "@circle-fin/x402-batching/client"

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY)

// Wrap fetch once — the interceptor handles 402 automatically:
//  1. Reads price / network / seller address from the 402 body
//  2. Signs an EIP-3009 transferWithAuthorization (off-chain, 0 gas)
//  3. Retries the request with X-Payment header attached
const paidFetch = withPaymentInterceptor(fetch, {
  walletClient: createWalletClient({ account, transport: http() }),
  maxAmountUsdc: "0.10",   // per-call safety cap
})

// Call any paid API — agent handles the full handshake
const res = await paidFetch("https://your-host/pay/summarize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Circle enables USDC payments..." }),
})

const { summary, key_points, paid_by, amount_usdc } = await res.json()
// paid_by  : "0xAgentWallet..."
// amount_usdc: "0.001"`,

  'seller-ts': `// Seller server — protect any Express route with HTTP 402
// Agents pay automatically; you collect USDC via Circle Gateway

import express from "express"
import { createGatewayMiddleware } from "@circle-fin/x402-batching"

const app = express()
app.use(express.json())

// One-line payment gate — returns 402 to unauthenticated callers
const gateway = createGatewayMiddleware({
  sellerAddress: process.env.SELLER_WALLET_ADDRESS,
  network: "ARC-TESTNET",
})

// Protect a route: require $0.001 USDC per call
app.post(
  "/pay/summarize",
  gateway.require("0.001"),          // price in USDC
  (req, res) => {
    const { text } = req.body
    // ... your logic here ...
    res.json({
      summary: "Your AI-generated summary...",
      key_points: ["Point 1", "Point 2"],
      word_count: text.split(" ").length,
      paid_by:     req.payment.from,   // injected by middleware
      amount_usdc: req.payment.amount,
    })
  }
)

app.listen(3000)
// Circle Gateway batches all authorisations and settles on-chain`,

  'buyer-py': `# Agent buyer (Python) — HTTP 402 auto-pay via x402 library
# pip install x402-python viem-py

import os
from x402.client import PaymentInterceptor
from eth_account import Account

account = Account.from_key(os.environ["AGENT_PRIVATE_KEY"])

# Wrap requests.Session — interceptor handles 402 automatically
session = PaymentInterceptor(
    account=account,
    max_amount_usdc="0.10",   # per-call safety cap
)

# Call any paid API — 402 handshake is transparent
resp = session.post(
    "https://your-host/pay/summarize",
    json={"text": "Circle enables USDC payments..."},
)

data = resp.json()
# data["summary"]     → "..."
# data["paid_by"]     → "0xAgentWallet..."
# data["amount_usdc"] → "0.001"
print(data["summary"])`,
}

export function CodeSnippet() {
  const [active, setActive] = useState<TabId>('buyer-ts')
  const [copied, setCopied] = useState(false)

  const copy = () => {
    void navigator.clipboard.writeText(CODES[active]).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[#060f1c] overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center border-b border-[var(--border)] overflow-x-auto">
        <div className="flex gap-0 shrink-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-3 py-2 text-[11px] font-medium whitespace-nowrap transition-colors border-b-2 ${
                active === tab.id
                  ? 'text-[var(--accent)] border-[var(--accent)] bg-[var(--accent)]/8'
                  : 'text-[var(--subtle)] border-transparent hover:text-[var(--muted)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={copy}
          title="Copy code"
          className="shrink-0 flex items-center gap-1 mr-3 px-2 py-1 rounded text-[10px] text-[var(--subtle)] hover:text-[var(--accent)] transition-colors"
        >
          {copied ? <Check size={11} className="text-[var(--success)]" /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Code */}
      <pre className="mono text-[11px] text-[var(--muted)] leading-[1.65] p-4 overflow-x-auto whitespace-pre">
        {CODES[active]}
      </pre>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between">
        <span className="text-[10px] text-[var(--subtle)]">
          {active === 'seller-ts'
            ? 'npm i @circle-fin/x402-batching express'
            : active === 'buyer-py'
            ? 'pip install x402-python eth-account'
            : 'npm i @circle-fin/x402-batching viem'}
        </span>
        <span className="mono text-[10px] text-[var(--subtle)]/60">
          {active.includes('seller') ? 'seller-server.ts' : active.includes('py') ? 'agent.py' : 'agent-client.ts'}
        </span>
      </div>
    </div>
  )
}
