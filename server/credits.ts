/**
 * Prepaid API credit with a hard total.
 *
 * The seller sells a pool of API usage (CREDIT_POOL_USDC, for example 1000). A buyer buys any amount they like,
 * as many times as they like, as long as everything sold stays within the pool. Each purchase is one real payment
 * whose price is the amount asked for. The buyer gets an API key; each call made with that key spends the price of
 * the route from the key's balance, so no payment is needed per call.
 *
 * Money safety rules:
 *  - The amount is reserved from the pool BEFORE the payment is settled, so two buyers cannot both pay for the
 *    last of the pool. A payment that fails releases its reservation.
 *  - Demo mode can never create credit.
 *  - Balances are kept in memory and written to disk every couple of seconds and on shutdown. Run one instance:
 *    a serverless host with several instances cannot guard a single pool, so credits stay off there.
 */
import { createHash, randomBytes } from "node:crypto";
import type express from "express";
import { formatUsdc, parseUsdc } from "../src/onchain-money";
import { isServerless, loadJson, saveJson } from "./store";

export interface Account { id?: string; balance: string; bought: string; spent: string; createdAt: string; payer: string }
export interface Refund { id: string; accountId: string; payer: string; amount: string; status: "pending" | "paid" | "rejected"; createdAt: string; resolvedAt?: string; txHash?: string }

const parse = (v: string | undefined): bigint => {
  try { return v ? parseUsdc(v) : 0n; } catch { return 0n; }
};
const capacity = parse(process.env.CREDIT_POOL_USDC);
const minPurchase = parse(process.env.CREDIT_MIN_USDC ?? "0.01") || 10_000n;
const maxPurchaseSetting = parse(process.env.CREDIT_MAX_PURCHASE_USDC);
const maxPurchase = maxPurchaseSetting > 0n ? maxPurchaseSetting : capacity;

export const creditsEnabled = (): boolean => capacity > 0n && !isServerless;

let sold = 0n;
const accounts = new Map<string, Account>();
const refunds = new Map<string, Refund>();
let loading: Promise<void> | undefined;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | undefined;

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

function ensureLoaded(): Promise<void> {
  loading ??= (async () => {
    const saved = await loadJson<{ sold: string; accounts: Record<string, Account>; refunds?: Record<string, Refund> }>("credits");
    if (saved) {
      sold = BigInt(saved.sold);
      for (const [h, a] of Object.entries(saved.accounts)) accounts.set(h, { ...a, id: a.id ?? h.slice(0, 12) });
      for (const [id, r] of Object.entries(saved.refunds ?? {})) refunds.set(id, r);
    }
  })();
  return loading;
}

export async function flushCredits(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = undefined; }
  if (!dirty) return;
  dirty = false;
  await saveJson("credits", { sold: sold.toString(), accounts: Object.fromEntries(accounts), refunds: Object.fromEntries(refunds) });
}
function touch() {
  dirty = true;
  timer ??= setTimeout(() => { timer = undefined; void flushCredits(); }, 2_000);
}

const reserve = (amount: bigint): boolean => {
  if (sold + amount > capacity) return false; // checked and added in one step, so concurrent buyers cannot oversell
  sold += amount;
  touch();
  return true;
};
const release = (amount: bigint) => { sold -= amount; touch(); };

export const poolStatus = () => ({
  enabled: creditsEnabled(),
  totalUsdc: formatUsdc(capacity),
  soldUsdc: formatUsdc(sold),
  remainingUsdc: formatUsdc(capacity - sold),
  minPurchaseUsdc: formatUsdc(minPurchase),
  maxPurchaseUsdc: formatUsdc(maxPurchase),
});

/** Called once a real payment has settled: add the amount to the buyer's key, or create a key. */
export function issueCredit(amount: bigint, payer: string, existingKey?: string): { key?: string; balance: bigint; account: string; separate?: boolean } {
  const created = new Date().toISOString();
  const who = payer.toLowerCase();
  let separate = false;
  if (existingKey) {
    const acct = accounts.get(hashKey(existingKey));
    // A key only grows from the wallet it was bought with, so a refund always has one clear destination.
    if (acct && acct.payer.toLowerCase() === who) {
      acct.balance = (BigInt(acct.balance) + amount).toString();
      acct.bought = (BigInt(acct.bought) + amount).toString();
      touch();
      return { balance: BigInt(acct.balance), account: acct.id ?? hashKey(existingKey).slice(0, 12) };
    }
    separate = Boolean(acct);
  }
  const key = `ak_${randomBytes(24).toString("hex")}`;
  const id = randomBytes(6).toString("hex");
  accounts.set(hashKey(key), { id, balance: amount.toString(), bought: amount.toString(), spent: "0", createdAt: created, payer: who });
  touch();
  return { key, balance: amount, account: id, separate };
}

const bearer = (req: express.Request): string | undefined => {
  const h = req.get("authorization");
  return h?.startsWith("Bearer ak_") ? h.slice(7).trim() : undefined;
};
export const hasCreditKey = (req: express.Request): boolean => bearer(req) !== undefined;

/** Spend the price of a route from the caller's key. Answers the request itself when it cannot. */
export async function spendCredit(req: express.Request, res: express.Response, price: bigint): Promise<boolean> {
  if (!creditsEnabled()) { res.status(401).json({ error: "Credits are not enabled", code: "credits_off" }); return false; }
  await ensureLoaded();
  const acct = accounts.get(hashKey(bearer(req) as string));
  if (!acct) { res.status(401).json({ error: "Unknown API key", code: "bad_key" }); return false; }
  const balance = BigInt(acct.balance);
  if (balance < price) {
    res.status(402).json({ error: "Not enough credit for this call", code: "insufficient_credit", balanceUsdc: formatUsdc(balance) });
    return false;
  }
  acct.balance = (balance - price).toString();
  acct.spent = (BigInt(acct.spent) + price).toString();
  touch();
  res.setHeader("X-Credit-Remaining", formatUsdc(balance - price));
  return true;
}

export async function balanceHandler(req: express.Request, res: express.Response) {
  const key = bearer(req);
  if (!creditsEnabled() || !key) { res.status(401).json({ error: "Send your API key as a Bearer token", code: "bad_key" }); return; }
  await ensureLoaded();
  const a = accounts.get(hashKey(key));
  if (!a) { res.status(401).json({ error: "Unknown API key", code: "bad_key" }); return; }
  res.json({ balanceUsdc: formatUsdc(BigInt(a.balance)), boughtUsdc: formatUsdc(BigInt(a.bought)), spentUsdc: formatUsdc(BigInt(a.spent)) });
}

/** Wallet signatures for key recovery are bound to this identity, so one server cannot replay them on another. */
export const SITE_ID = (process.env.PUBLIC_SITE_URL ?? `http://localhost:${process.env.PORT ?? 3001}`).replace(/\/$/, "");

export const infoHandler: express.RequestHandler = async (_req, res) => {
  await ensureLoaded();
  res.json({ ...poolStatus(), site: SITE_ID });
};

/** Internal handle for credit-recovery.ts. Nothing else should touch this. */
export const _state = {
  accounts, refunds, hashKey, touch, flush: flushCredits, ensureLoaded,
  adjustSold: (delta: bigint) => { sold += delta; if (sold < 0n) sold = 0n; touch(); },
};

/**
 * Guard in front of POST /credits/buy. The price is the amount asked for, so the guard builds the payment gate for
 * that amount. All checks that need no payment happen first, so a bad request is refused before anything is charged.
 */
export function purchaseGuard(gateFor: (price: string) => express.RequestHandler): express.RequestHandler {
  return async (req, res, next) => {
    if (!creditsEnabled()) { res.status(503).json({ error: "Credits are not enabled", code: "credits_off" }); return; }
    await ensureLoaded();
    // Credit is bought with a payment, never with other credit. To top up a key, put it in the body.
    if (hasCreditKey(req)) { res.status(400).json({ error: "Send the key to top up in the request body, not as a Bearer token", code: "bad_key" }); return; }
    const body = (req.body ?? {}) as { amount?: unknown; key?: unknown };
    let amount: bigint;
    try {
      if (typeof body.amount !== "string" || !/^\d{1,9}(\.\d{1,6})?$/.test(body.amount)) throw new Error("bad");
      amount = parseUsdc(body.amount);
    } catch { res.status(400).json({ error: "amount must be a USDC amount with up to 6 decimals", code: "bad_amount" }); return; }
    if (amount < minPurchase || amount > maxPurchase) { res.status(400).json({ error: "amount is outside the allowed range", code: "amount_range", ...poolStatus() }); return; }
    if (req.get("x-demo-mode") !== undefined) { res.status(400).json({ error: "Credit can only be bought with a real payment", code: "demo_not_allowed" }); return; }
    if (typeof body.key === "string" && body.key && !accounts.has(hashKey(body.key))) { res.status(400).json({ error: "Unknown API key", code: "bad_key" }); return; }
    if (sold + amount > capacity) { res.status(409).json({ error: "Not enough credit left in the pool", code: "pool_exhausted", ...poolStatus() }); return; }

    if (req.get("payment-signature") !== undefined) {
      if (!reserve(amount)) { res.status(409).json({ error: "Not enough credit left in the pool", code: "pool_exhausted", ...poolStatus() }); return; }
      let settled = false;
      const done = (keep: boolean) => { if (!settled) { settled = true; if (!keep) release(amount); } };
      res.on("finish", () => done(res.statusCode < 400));
      res.on("close", () => done(res.writableFinished && res.statusCode < 400));
    }
    gateFor(`$${formatUsdc(amount)}`)(req, res, next);
  };
}
