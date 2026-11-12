# Before going to mainnet

This is a checklist, not a switch. Nothing in this project is configured for mainnet today: every default points at Arc Testnet.
Mainnet transactions use real funds and cannot be undone. You deploy, fund and operate mainnet yourself.

## What the testnet runs showed

Repeated real payments on Arc Testnet from one throwaway buyer wallet to one throwaway seller wallet:

| Run | Payments | Result |
|---|---|---|
| 4 rounds, all 11 paid routes plus parallel bursts | 121 ok, then 31 failed | Circle's settlement call started answering with an HTML block page (see below). Nothing was charged for the failures. |
| Same again, after the failure was understood | 182 of 182 ok | Money check exact: the buyer's Gateway balance fell by exactly the sum the responses reported. |
| Default rate limits, 4 rounds | 82 of 82 ok | A burst hit the per-visitor limit; the buyer waited and retried, no payment lost. |

Every run ended with a money check (buyer balance change equals total charged) and a lookup of every settlement id at Circle. All matched.
In the longest wait, 159 of 182 payments reached "completed" within about 7 minutes; the rest were still queued for the next batch.

### Known upstream behaviour
Circle's settlement service is behind a web firewall. After a sustained burst from one machine it answered with an HTML page instead of JSON, then recovered on its own within minutes. The backend now logs the real cause, pauses real payments for a short growing interval after three failures in a row, and answers `503` with `Retry-After` and `"nothing was charged"`. A buyer must treat that as "retry later".
Ask Circle what the limits are for your production traffic, and whether an authenticated, higher-limit access route exists. The gateway middleware can send extra headers on every settlement call.

## What is tied to testnet in the code
- Settlement service address (`FACILITATOR_URL`, defaults to the testnet one).
- Network whose payments the receipts panel lists (`PAYMENTS_NETWORK`).
- Chain in `scripts/buyer-bot.ts`, `payment-bench.ts`, `payment-attacks.ts`, `soak-test.ts`.
- "Arc Testnet" wording in the page, the demo responses and the code samples.
- The payout address in this project's `.env` is a throwaway test wallet.

Facts to confirm from Circle's documentation before changing anything: the mainnet settlement address, the network id, and the Gateway contract addresses. The project's own registry lists Arc mainnet as chain id 5042 with explorer `https://explorer.arc.io`.

## Before real money
1. **Independent security review** of the backend and anything you add. The checks in `scripts/` are useful but are not an audit.
2. **Turn demo mode off** (`DEMO_MODE=off`). Otherwise anyone can call a paid route with a header and receive sample data for free.
3. **Decide about the faster settlement path** (`FAST_SETTLE`). It skips Circle's separate verify call and relies on the settle call, which is authoritative. It passed the forged, underpaid, replayed and unfunded payment tests. Have your reviewer confirm it, or set `FAST_SETTLE=off`.
4. **Your own payout address**, checked by sending a small amount first. The backend refuses real payments when none is set.
5. **Key custody**: never put a private key in a deployed site's environment. Buyer agents need a proper key service.
6. **Limits and alerts**: set `ADMIN_TOKEN` so abusive listings can be removed, attach Redis so limits and listings survive restarts, and watch the logs for `settlement service failing`.
7. **Run the checks against the exact build you will deploy**: `bun run scripts/security-check.ts`, `payment-attacks.ts`, `soak-test.ts`.
8. **Legal and tax**: charging a fee as an intermediary can carry obligations where you operate. Get advice.
9. Start with the smallest amounts that prove the whole path: payment, batch settlement, balance in your payout wallet.
