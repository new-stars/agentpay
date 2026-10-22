/**
 * Shows a minimal agent-side code example demonstrating the x402 payment flow.
 * English primary; comments explain the protocol steps.
 */
export function CodeSnippet() {
  const code = `// Minimal agent wallet — pays for APIs via HTTP 402 + Circle Gateway
// Works with any x402-compatible endpoint on Arc Testnet

import { createWalletClient, http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { withPaymentInterceptor } from "@circle-fin/x402-batching/client"

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY)

// Wrap fetch with the x402 interceptor.
// On a 402 response it automatically:
//   1. Reads the payment requirements (price, network, seller address)
//   2. Signs an EIP-3009 off-chain authorisation
//   3. Retries the request with the X-Payment header
const paidFetch = withPaymentInterceptor(fetch, {
  walletClient: createWalletClient({ account, transport: http() }),
  maxAmountUsdc: "0.10",   // safety cap per call
})

// Call a paid API — agent handles the 402 handshake automatically
const res = await paidFetch("https://your-agentpay-host/pay/summarize", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ text: "Circle enables businesses to use USDC..." }),
})

const data = await res.json()
// { summary, key_points, paid_by, amount_usdc, ... }
console.log(data.summary)`

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[#060f1c] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--danger)]/60" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/40" />
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--success)]/40" />
        </div>
        <span className="text-[10px] mono text-[var(--subtle)]">agent-client.ts</span>
        <span className="text-[10px] text-[var(--subtle)]">x402 buyer side</span>
      </div>
      <pre className="mono text-[11px] text-[var(--muted)] leading-5 p-4 overflow-x-auto whitespace-pre">
        {code}
      </pre>
    </div>
  )
}
