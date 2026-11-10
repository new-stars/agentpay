# AgentPay

A marketplace where AI agents discover paid APIs and pay for them per call in USDC. Sellers list an API, buyer agents find the cheapest healthy seller, and the broker keeps a 0.5% fee on top of the seller's price.

Built with [Arc Studio](https://studio.arc.io)

## What it does

- Browse a catalog of paid API services and watch a simulated agent payment handshake.
- Switch the whole interface between 9 languages and between dark and light themes.
- List your own paid API in the seller marketplace. Listings are health-checked and only offered to agents when the endpoint answers HTTP 402.
- See the buyer price (seller price plus 0.5% broker fee) for every listing.
- Run a buyer-agent lookup that picks the cheapest healthy seller inside a budget.

Payments in the catalog demo and the buyer lookup are simulated. No funds move.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, wagmi, viem, ConnectKit, Express (Bun), Circle Gateway Nanopayments (x402).

## Development

Prerequisites: [Bun](https://bun.sh).

```bash
bun install
bun run start      # backend on :3001 and Vite dev server on :5173
```

Or run them separately with `bun run server` and `bun run dev`. The frontend reaches the backend through the `/api` proxy.

Checks: `bun run check` (lint and typecheck).

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_SELLER_ADDRESS` | Address that receives payments for the demo endpoints. |
| `FACILITATOR_URL` | Circle Gateway facilitator URL. Defaults to the testnet facilitator. |
| `PORT` | Backend port. Defaults to 3001. |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional. Provisioned by Arc Studio; not needed elsewhere. |

The seller registry is stored in `server/data/registry.json`, which is created at runtime and not committed.
