import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { useLang } from '../LangContext'

// Code stays in English on purpose: identifiers and comments are what developers copy.
// Every snippet follows the published API of @circle-fin/x402-batching and the Circle CLI docs.
type TabId = 'buyer-ts' | 'seller-ts' | 'cli'

const CODES: Record<TabId, string> = {
  'buyer-ts': `// Buyer agent: pays x402 APIs through Circle Gateway Nanopayments
import { GatewayClient } from '@circle-fin/x402-batching/client'

const client = new GatewayClient({
  chain: 'arcTestnet',                                // use a testnet while building
  privateKey: process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`,
})

// Spending guard: abort before signing anything above 0.10 USDC (6 decimals)
client.onBeforePaymentCreation(async (ctx) => {
  if (BigInt(ctx.selectedRequirements.amount) > 100_000n) {
    return { abort: true, reason: 'Payment exceeds spending limit' }
  }
})

// One-time: fund your Gateway balance with USDC
await client.deposit('1.00')

// Optional: check the endpoint supports Gateway batching before paying
const support = await client.supports('https://your-host/pay/summarize')

// pay() runs the whole 402 handshake: request, sign, retry
const { data, formattedAmount } = await client.pay('https://your-host/pay/summarize', {
  method: 'POST',
  body: { text: 'Circle enables USDC payments...' },
})
console.log(formattedAmount, data)`,

  'seller-ts': `// Seller: put an HTTP 402 payment gate in front of an Express route
import express from 'express'
import { createGatewayMiddleware } from '@circle-fin/x402-batching/server'

const app = express()
app.use(express.json())

const gateway = createGatewayMiddleware({
  sellerAddress: process.env.SELLER_ADDRESS as \`0x\${string}\`, // where you get paid
  facilitatorUrl: 'https://gateway-api-testnet.circle.com',     // testnet; the default is mainnet
})

// Callers without a valid payment get HTTP 402 automatically
app.post('/pay/summarize', gateway.require('$0.001'), (req, res) => {
  const { payer, amount, network } = (req as any).payment
  res.json({ summary: '...', paid_by: payer, amount, network })
})

app.listen(3000)`,

  cli: `# Circle CLI: find and pay a service from the command line
npm install -g @circle-fin/cli

# 1. Find a service
circle services search "weather data"

# 2. Read its payment requirements without paying
circle services inspect https://api.example.com/weather

# 3. Preview the cost, then pay with a spending cap
circle services pay https://api.example.com/weather \\
  --address 0xYourWalletAddress --chain ARC --estimate

circle services pay https://api.example.com/weather \\
  --address 0xYourWalletAddress --chain ARC --max-amount 0.01

# Replace 0xYourWalletAddress with your own agent wallet address.`,
}

const FOOTER: Record<TabId, { cmd: string; file: string }> = {
  'buyer-ts': { cmd: 'npm i @circle-fin/x402-batching', file: 'agent.ts' },
  'seller-ts': { cmd: 'npm i @circle-fin/x402-batching express', file: 'server.ts' },
  cli: { cmd: 'npm install -g @circle-fin/cli', file: 'terminal' },
}

export function CodeSnippet() {
  const { t } = useLang()
  const [active, setActive] = useState<TabId>('buyer-ts')
  const [copied, setCopied] = useState(false)

  const tabs: { id: TabId; label: string }[] = [
    { id: 'buyer-ts', label: `${t.codeTabBuyer} · TypeScript` },
    { id: 'seller-ts', label: `${t.codeTabSeller} · TypeScript` },
    { id: 'cli', label: t.codeTabCli },
  ]

  const copy = () => {
    void navigator.clipboard.writeText(CODES[active]).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--code-bg)] overflow-hidden">
      <div className="flex items-center border-b border-[var(--border)] overflow-x-auto">
        <div className="flex shrink-0">
          {tabs.map(tab => (
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
          title={t.codeCopyTitle}
          aria-label={t.codeCopyTitle}
          className="shrink-0 flex items-center gap-1 me-3 px-2 py-1 rounded text-[10px] text-[var(--subtle)] hover:text-[var(--accent)] transition-colors"
        >
          {copied ? <Check size={11} className="text-[var(--success)]" /> : <Copy size={11} />}
          {copied ? t.codeCopied : t.codeCopy}
        </button>
      </div>

      <pre dir="ltr" className="mono text-[11px] text-[var(--muted)] leading-[1.65] p-4 overflow-x-auto whitespace-pre text-left">
        {CODES[active]}
      </pre>

      <div dir="ltr" className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between">
        <span className="mono text-[10px] text-[var(--subtle)]">{FOOTER[active].cmd}</span>
        <span className="mono text-[10px] text-[var(--subtle)]/60">{FOOTER[active].file}</span>
      </div>
    </div>
  )
}
