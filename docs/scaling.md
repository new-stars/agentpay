# Handling tens of thousands of payments a day

20,000 to 100,000 payments a day is about 0.2 to 1.2 per second on average. Even at ten times that in the busiest minutes this is 2 to 12 per second.
Everything below was measured on Arc Testnet from one machine. Mainnet and other networks may behave differently.

## What was measured

| Test | Result |
|---|---|
| 7 payments per second for 120 s | 840 of 840 succeeded. Median 106 ms, p99 213 ms |
| 12 per second offered (more than can be settled) | 7.1 per second served, the rest told "busy, nothing was charged" |
| 10 per second, before pacing | about 6% refused by Circle's firewall (HTTP 429) |
| Server killed with payments in flight | 44 ok, 196 could not connect, 1 payment settled with no answer to the buyer |

Every run was reconciled: the buyer's balance change always equalled the total the responses reported, except the one killed-server case, which `scripts/reconcile.ts` found by id.

## The limit that matters

Circle's settlement service answers HTTP 429 once one machine sends roughly 9 to 10 settlements per second, counted over a window of about ten seconds. So by default this backend sends at most 7 per second (bursts of 10), halves that for 15 seconds after any 429, and queues the rest for up to 10 seconds before saying "busy, nothing was charged, retry shortly".

7 per second is about 600,000 a day, far above your target. A busy minute above that is queued, not lost.

## If you need more than that
- Ask Circle what limits apply to your production traffic and whether higher-limit access exists. This is the real fix.
- Run several servers in different places. Each has its own pacer, so capacity adds up. Check whether your host sends outgoing calls from several addresses.
- Raise `SETTLE_RATE_PER_SECOND` and `SETTLE_BURST` only after Circle confirms the new numbers.

## What protects you
- **Pacing and queue** (`server/pacer.ts`): steady calls to Circle, bursts allowed, bounded wait.
- **Circuit breaker**: if the recent failure rate is high, real payments pause briefly and buyers get `503` with `Retry-After`. Nothing is charged.
- **Deadline on every call to Circle**: a hung service cannot pile up requests.
- **Per-visitor and overall limits**, sized so one busy buyer is not blocked (600 payment attempts a minute per address by default).
- **Ledger** (`server/ledger.ts`): every settled payment is written to disk (or Redis), with daily totals. Admin export: `GET /admin/ledger?day=YYYY-MM-DD&format=csv` with `ADMIN_TOKEN`.
- **Reconciliation**: `scripts/reconcile.ts` compares the ledger with what Circle received in a time window.

## Run it like a payments service
1. Use Redis so limits and listings are shared across instances. If your Redis plan counts commands, set `RATE_LIMIT_STORE=memory`: each request otherwise costs several commands.
2. Keep the ledger file or Redis list backed up.
3. Run the reconciliation every day (or hour). Anything listed as "paid but not recorded here" was charged without an answer: give the buyer the result or a refund.
4. Watch the logs for `settlement service failing` and `non-JSON reply`.
5. Stop the server with SIGTERM, not SIGKILL, so open payments finish first.
6. On a serverless host, each payment is two function calls (the price list, then the paid call). Check your plan.
7. Repeat the tests on the build you will run: `soak-test.ts`, `load-test.ts`, `breaker-test.ts`, `payment-attacks.ts`, `security-check.ts`.
