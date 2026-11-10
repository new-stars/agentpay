# Broker settlement: how a 0.5% fee could really be collected

Status: **design only. Nothing in this document is built.** The site currently shows the fee as a quote. No funds move.

## Why the fee cannot simply be "added on top"

A paid route created with `createGatewayMiddleware({ sellerAddress })` pays one address. If a buyer agent calls a third-party seller directly, 100% of the payment goes to that seller and this site is not in the payment path. So there is nothing to take 0.5% from.

For this site to earn a fee it has to sit **inside** the payment path. There are two ways.

### Model A: reseller proxy (technically possible today)

```
buyer agent --pays 0.001005--> broker route --pays 0.001--> seller API
                                   |
                                   +-- keeps 0.000005
```

1. The buyer agent calls a route on this site, for example `POST /resell/<listingId>`.
2. That route is protected by the Gateway middleware with `sellerAddress = BROKER_ADDRESS` and a price of `seller price + 0.5%`.
3. After the buyer's payment is verified, the server calls the seller's real URL using `GatewayClient.pay(url, { method, body })` from the broker's own agent wallet, paying the seller price.
4. The seller's response is returned to the buyer.

What it needs:

- A **broker agent wallet** with USDC deposited into Gateway (`client.deposit`). This is real money at risk, so start on Arc Testnet.
- `BROKER_PRIVATE_KEY` in `.env` (never `VITE_`-prefixed, never committed) and `BROKER_ADDRESS` for the fee wallet. The platform's shared deploy wallet must not be used for either.
- A spending cap with `client.onBeforePaymentCreation`, so one bad listing cannot drain the wallet.
- A per-listing route or dynamic price. The middleware takes a price per route, so check in the current docs whether a computed price is supported before relying on it.

Open questions to settle on testnet before any real use:

- **Failure ordering.** If the buyer has paid and the seller call then fails, who bears the loss? Confirm in the facilitator docs when funds are captured relative to the response, then decide between refund, retry or credit.
- **Latency.** The buyer waits for two payment handshakes in series.
- **Chain match.** The buyer and the seller may accept different chains or assets. The broker has to pick a rail both sides support.

### Model B: referral agreement (no technical change)

The seller agrees to pay the broker 0.5% on calls that came through the registry. Settlement happens off-site (invoice or a periodic transfer). It needs trust and bookkeeping, not code.

## Rules that apply to both models

- Only list or resell a seller who has **agreed** to it. The Circle marketplace entries shown on this site are read-only for that reason.
- Taking a fee as an intermediary can bring licensing, tax and sanctions-screening duties that depend on where you operate. Get professional advice before charging real users.
- The registry only proves that an endpoint answers HTTP 402. It does not vouch for the seller's quality or honesty.

## Suggested path

1. Fund a broker wallet on Arc Testnet from the in-app test USDC button.
2. Build Model A for **one** listing you control (your own API), and measure both payments end to end.
3. Add the failure handling above.
4. Only then onboard outside sellers who have agreed in writing.
