# AgentPay

A marketplace where AI agents discover paid APIs and pay for them per call in USDC. Sellers list an API, buyer agents find the cheapest healthy seller, and the broker keeps a 0.5% fee on top of the seller's price.

Built with [Arc Studio](https://studio.arc.io)

## What it does

- Browse a catalog of paid API services and watch a simulated agent payment handshake.
- Switch the whole interface between 9 languages and between dark and light themes.
- List your own paid API in the seller marketplace. Listings are health-checked and only offered to agents when the endpoint answers HTTP 402.
- See the buyer price (seller price plus 0.5% broker fee) for every listing.
- Run a buyer-agent lookup that picks the cheapest healthy seller inside a budget.
- Search the public Circle Agent Marketplace discovery feed for real x402 sellers (read-only).
- Follow every payment you receive from "received" to "completed", with a link to the onchain settlement transaction. Circle accepts payments instantly and settles them in batches, so this shows when each one is final.
- Switch the whole interface between 9 languages. The language choice is remembered in the browser.

Payments in the catalog demo and the buyer lookup are simulated, and the live activity feed and totals are sample data. No funds move. A design for collecting the broker fee for real is in `docs/broker-settlement.md`.

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
| `DEMO_MODE` | Defaults to on: a request with the header `X-Demo-Mode: simulate` gets clearly marked sample data and no payment is taken. Set to `off` before putting anything of value behind a route. |
| `FAST_SETTLE` | Defaults to on: the seller skips Circle's separate verify call and relies on the settle call, which halves payment time. Set to `off` to restore the two-step flow. |
| `PUBLIC_SITE_URL` | Public address of the deployed site. Used for the operator's own marketplace listing. Vercel and Netlify supply it automatically. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional Redis database (also accepted as `KV_REST_API_URL` and `KV_REST_API_TOKEN`). Without it, marketplace listings on a serverless host live only as long as the instance does. |
| `PAYMENTS_NETWORK` | Network whose payments the receipts panel lists. Defaults to Arc Testnet. |
| `PERF_LOG` | Set to any value to log how long each paid request takes on the server. |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Optional. Provisioned by Arc Studio; not needed elsewhere. |

The seller registry is stored in `server/data/registry.json`, which is created at runtime and not committed.

## Try the buyer bot (testnet)

`scripts/buyer-bot.ts` is a small agent that finds a seller in the registry, checks its spending cap, funds its Gateway balance and pays for one call on Arc Testnet.
It needs `AGENT_PRIVATE_KEY` in `.env`, a throwaway testnet key holding some test USDC. Never use a key that holds real funds.

```
bun run scripts/buyer-bot.ts
```

## Payment speed and safety checks (testnet)

```
bun run scripts/payment-bench.ts     # per-payment timing and a parallel burst
bun run scripts/payment-attacks.ts   # forged, underpaid, replayed and unfunded payments must all be refused
```

Both need `AGENT_PRIVATE_KEY` in `.env` and the backend running. Run the second one after any change to the payment gate.

## Deploy with a working backend

The backend (paid API routes, seller marketplace, payment receipts) runs as a serverless function, so the same project works on a normal server, Vercel or Netlify. The page always calls `/api/...`.

- **Vercel**: import the repository. `vercel.json` builds the page and serves the backend from `api/[...path].cjs`. That file is the backend bundled into one script. After changing anything under `server/`, rebuild it with `bun run build:api` and commit the result.
- **Netlify**: import the repository. `netlify.toml` builds the page and routes `/api/*` to `netlify/functions/api.ts`, which Netlify bundles itself.

On the host, set at least:

- `VITE_SELLER_ADDRESS`: **your own** payout address. Without it the backend refuses to settle real payments, so nothing can be sent to a dead address.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` if you want marketplace listings to survive restarts (a free Upstash Redis database is enough).
- `DEMO_MODE=off` before you put anything of value behind a route.

Never add `AGENT_PRIVATE_KEY` or any other private key to a deployed site. It is only for the local test scripts.

Payment receipts need no database: they are read from Circle by payout address, so they survive restarts and show payments made through any instance.
