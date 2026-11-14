# Lost keys and refunds for prepaid API credit

Both features only exist when credit sales are on (`CREDIT_POOL_USDC` set) on a normal server. Tested with real payments on Arc Testnet (`scripts/credit-recovery-test.ts`, 29 checks).

## Recovering a lost key

The wallet that bought the credit proves itself by signing a short message. Nothing else (no email, no password).

1. `GET /credits` returns `site`. Signatures are bound to it, so one server cannot replay them on another.
2. Sign this exact text (EIP-191 personal message) with the wallet that paid, using the current time in milliseconds:

   ```
   AgentPay API credit key recovery
   site: <site from /credits>
   payer: <wallet address, lower case>
   account: <12-character account id, or "any">
   issued: <milliseconds since 1970>
   ```
3. `POST /credits/recover` with `{ "payer", "issuedAt", "signature", "account"? }`.

What happens: the server checks the signature, that it is under 5 minutes old and not used before, then **issues a new key and the old key stops working immediately**. This also helps if a key leaked. If the wallet owns several keys, the reply is `409 choose_account` with the account ids and balances; sign again with one id.

Limits: only normal wallets (private-key signatures). Smart-contract wallets are not supported.

## Refunds

1. The buyer calls `POST /credits/refund` with their key (`amount` optional, default the whole balance). The amount is **frozen at once**, so it cannot be spent or refunded twice, and the request is `pending`.
2. A refund can only go **back to the wallet that paid**. A stolen key cannot redirect it.
3. The operator pays it out from their own machine: `ADMIN_TOKEN=... SELLER_PRIVATE_KEY=... API_BASE=... bun run scripts/pay-refunds.ts`. The server never holds a key that can move funds.
4. The script sends the money from the seller's Gateway balance to the buyer, then records the transaction hash. The refunded amount returns to the pool (turn off with `CREDIT_REFUND_RESTOCK=off`).
5. The operator can also reject a refund (`POST /admin/refunds/:id/reject`): the money goes back onto the key.

Buyers check progress with `GET /credits/refund/:id` and their key.

### Read this before paying refunds

- **The payout wallet needs a little USDC for gas** (on Arc, USDC is the gas token), in addition to the Gateway balance. In testing, a payout from a wallet with no gas **took the money out of the Gateway balance but never delivered it** (0.1035 USDC stuck). `pay-refunds.ts` now checks gas before moving anything and stops if money left the balance without arriving.
- Each payout costs a small fee. Measured on testnet: 0.0035 USDC on a 0.1 USDC refund. `REFUND_MAX_FEE` (default 0.05) caps it.
- The seller's Gateway balance only grows when Circle finishes a batch, which can take minutes. A refund waits (is skipped) until the balance covers it.
- A key that is topped up from a different wallet than the one that created it gets a **separate** key, so every key has exactly one refund destination.

## Not covered

Refund policy (time limits, partial rules, fees charged to the buyer), notifications, smart-contract wallets, and an admin web page. Credit state lives in one server; see the README.
