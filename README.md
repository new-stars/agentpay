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
| `SETTLE_RATE_PER_SECOND`, `SETTLE_BURST` | Optional. How fast this backend calls Circle's settlement service (defaults 7 and 10). Raise only once Circle confirms higher limits. |
| `FACILITATOR_TIMEOUT_MS` | Optional. Deadline for each call to Circle's settlement service (default 8000). |
| `RATE_LIMIT_STORE` | Optional. Set to `memory` to keep rate-limit counters per instance even when Redis is configured. |
| `CREDIT_REFUND_MIN_USDC` | Smallest refund a buyer can ask for. Default 0.01. |
| `CREDIT_REFUND_RESTOCK` | Set to `off` to keep refunded credit out of the pool. |
| `REFUND_MAX_FEE`, `REFUND_MIN_GAS_USDC` | Used by `scripts/pay-refunds.ts` on your own machine: fee cap and the gas the payout wallet must hold. |
| `CREDIT_POOL_USDC` | Optional. Turns on prepaid API credit and sets the seller's total pool, for example `1000`. Unset means off. Always off on a serverless host. |
| `CREDIT_MIN_USDC`, `CREDIT_MAX_PURCHASE_USDC` | Optional. Smallest purchase (default 0.01) and largest single purchase (default: the whole pool). |
| `ADMIN_TOKEN` | Optional, at least 16 characters. Enables `DELETE /registry/<id>` so you can remove an abusive listing. Without it that route does not exist. |
| `RATE_LIMIT_MULTIPLIER` | Optional, 1 to 100 (default 1). Raises every rate limit at once, for a trusted or private deployment. |
| `TRUST_PROXY_HEADER` | Optional. Name of a header your own proxy sets with the real client address. Forwarding headers are otherwise ignored, except on Vercel and Netlify. |
| `ALLOWED_ORIGINS` | Optional, comma-separated. Extra websites allowed to change the marketplace from a browser. |
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
bun run scripts/credits-test.ts     # prepaid credit with a hard pool, real payments (start the backend with CREDIT_POOL_USDC=1)
bun run scripts/credit-burst.ts     # 1000 simultaneous calls on one key must never overspend it
bun run scripts/credit-recovery-test.ts  # lost-key recovery and refunds, real payments (see docs/credit-recovery-refunds.md)
bun run scripts/pay-refunds.ts      # operator tool: pay pending refunds from your own wallet
bun run scripts/load-test.ts         # payments at a steady rate (RATE, SECONDS), then an exact money check
bun run scripts/breaker-test.ts      # stand-in settlement service: pause, short-circuit, recovery
bun run scripts/reconcile.ts         # payments Circle received that this server has no record of
bun run scripts/soak-test.ts         # repeated real payments on every paid route, then an exact money check
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

## Prepaid API credit

A seller can sell a fixed pool of API usage, for example 1000 USDC. A buyer buys any amount they like (0.1, 0.5, anything above the minimum), as many times as they like, as long as everything sold stays within the pool. Each purchase is one real payment whose price is the amount asked for, and the buyer gets an API key. Calls made with `Authorization: Bearer <key>` spend the price of the route from the key's balance, so no payment is needed per call. To top up, buy again and send the key in the request body.

- The amount is reserved from the pool before the payment settles, so two buyers cannot both pay for the last of it.
- Demo mode can never create credit. Keys are stored only as hashes and shown once. Unspent credit is not refunded in this version.
- Credit state lives in one running server. A purchase is written to disk before the key is handed over, so it survives a crash. Spending is written every couple of seconds, so stop the server with SIGTERM to save the very latest balances. Set the pool only to what you can really deliver.

## Security

- **Abuse limits**: per visitor and for the whole service, tightest on anything that reaches Circle or an outside server (submitting a seller: 5 per hour, payment attempts: 60 per minute). Counters are shared across instances when Redis is configured.
- **Sellers cannot lie**: a listing is accepted only if the endpoint is reachable over HTTPS, asks for payment, and names the same payout address and price that were entered. Dead or mismatched listings are never stored, and the check repeats later so a seller cannot switch the price afterwards.
- **No server-side request tricks**: seller URLs must be public domain names on https. The address is checked at the moment of connecting, so a name that points at an internal address is refused, redirects are not followed, and replies are size and time limited.
- **Cross-site protection**: another website cannot make a visitor's browser change the marketplace.
- **Charged only for valid requests**: bad input is rejected before payment is taken. Payments are refused when no payout address is configured.
- **Clean errors**: no stack traces or internal messages reach callers, and responses are never cached.
- **Page headers**: the Vercel and Netlify configs add a content security policy, clickjacking protection and the usual hardening headers.
- **Text from sellers** is stripped of control and direction-override characters and is always shown as plain text.

Run the checks against a running backend:

```
API_BASE=http://localhost:3002 ADMIN_TOKEN=<token> bun run scripts/security-check.ts   # backend started with RATE_LIMIT_MULTIPLIER=50 and the same ADMIN_TOKEN
LIMITS=1 bun run scripts/security-check.ts                                              # backend with default limits
```

## If Circle's settlement service pushes back

If Circle's settlement service fails three times in a row, the backend pauses real payments for a short, growing time and answers `503` with `Retry-After`. Nothing is charged. Buyers should wait and retry. The cause is written to the server log. See `docs/mainnet-readiness.md` before going to mainnet.

See `docs/scaling.md` for what was measured at volume and how to run this for tens of thousands of payments a day.
