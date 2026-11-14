# Running the backend on a server

The page on Vercel, Netlify or Hugging Face is only files. The payment server, the seller marketplace and the credit pool need a machine that keeps a program running. The `Dockerfile` in this repo packs exactly that, so any platform that runs a Docker image (or any computer with Docker) can host it.

**Testnet only.** Nothing here has a mainnet setting.

## What you need

- A platform that runs a Dockerfile, or a server with Docker.
- **A persistent disk** mounted at `/app/server/data`. Without it, every redeploy erases the seller list, the payment ledger and the credit pool.
- **Exactly one instance.** The credit pool and the ledger live on that disk; two copies would oversell.
- HTTPS in front (most platforms provide it).

## Build and run

```
docker build -t agentpay-backend .
docker run -d --name agentpay -p 3001:3001 \
  -v agentpay-data:/app/server/data \
  --env-file backend.env \
  agentpay-backend
```

Keep `backend.env` out of git. The image never contains settings or keys; they come from the platform's environment variables.

## Settings

| Variable | What to put |
|---|---|
| `VITE_SELLER_ADDRESS` | **Your own** payout address. (The name starts with `VITE_` for historical reasons.) If it is empty, the server refuses real payments instead of sending them to a dead address. |
| `DEMO_MODE` | `off` before any real money. While on, anyone can call paid routes for sample data. |
| `ADMIN_TOKEN` | A long random value. Turns on takedown, the refund list and the ledger export. Without it those do not exist. |
| `ALLOWED_ORIGINS` | The address of your page (comma-separated). Lets that site write to the backend from a browser. |
| `PUBLIC_SITE_URL` | This backend's own public https address. Key-recovery signatures are bound to it. |
| `TRUST_PROXY_HEADER` | Only when a proxy sits in front, for example `x-forwarded-for`. Otherwise every visitor looks like the proxy and shares one rate-limit allowance. Use it only if the platform's proxy overwrites that header; if a visitor can set it, they can dodge the limits. |
| `CREDIT_POOL_USDC` | Optional. The total prepaid credit you can really deliver. Leave out to turn credit sales off. |

Everything else (limits, pacing, refund settings) is in the README table and has safe defaults.

## Connect the page

Build the page with `VITE_API_BASE=https://your-backend-address` and host it anywhere. The page asks the backend for `/health` once and shows a short notice if it cannot reach it.

## After it is up

1. `GET /health` returns `"status":"ok"` (the image also has a Docker health check).
2. From your own machine: `API_BASE=https://your-backend ADMIN_TOKEN=... bun run scripts/security-check.ts` (41 checks).
3. A small real payment with `scripts/buyer-bot.ts`, then `scripts/reconcile.ts` to compare the ledger with Circle.
4. Stop the container with a normal stop (SIGTERM) so the latest credit balances are saved. Back up the data disk.

## What was tested

The image built from this Dockerfile, started as a non-root user, answered from outside, passed the 41 security checks, all 11 services and the 24 prepaid-credit checks with real payments on Arc Testnet, stopped in under a second with exit code 0, and kept its data across a restart.

Not tested: any specific cloud provider, HTTPS, `TRUST_PROXY_HEADER` behind a real proxy, or running in more than one region. Building the image needs internet access for `bun install`.
