/**
 * Lost keys and refunds for prepaid API credit.
 *
 * Recovery: the wallet that bought a key signs a short message. If it checks out, a NEW key replaces the old one
 * (the old key stops working at once, which also helps if it leaked).
 *
 * Refunds: a buyer asks for their unspent balance back. The amount is frozen straight away so it cannot be spent
 * twice, and it can only ever go back to the wallet that paid. The server never holds a key that can move funds:
 * the operator sends the money from their own machine (scripts/pay-refunds.ts) and then marks the request paid.
 */
import { createHash, randomBytes } from "node:crypto";
import express from "express";
import { verifyMessage, type Address, type Hex } from "viem";
import { formatUsdc, parseUsdc } from "../src/onchain-money";
import { SITE_ID, _state, creditsEnabled } from "./credits";
import { rateLimit } from "./ratelimit";
import { adminOnly } from "./security";

const MAX_AGE_MS = 5 * 60_000;
const refundMin = (() => { try { return parseUsdc(process.env.CREDIT_REFUND_MIN_USDC ?? "0.01"); } catch { return 10_000n; } })();
const restock = process.env.CREDIT_REFUND_RESTOCK !== "off";

export const recoveryMessage = (site: string, payer: string, account: string, issuedAt: number) =>
  `AgentPay API credit key recovery\nsite: ${site}\npayer: ${payer.toLowerCase()}\naccount: ${account}\nissued: ${issuedAt}`;

const usedSignatures = new Map<string, number>();
function markUsed(signature: string): boolean {
  const now = Date.now();
  for (const [k, t] of usedSignatures) if (now - t > 2 * MAX_AGE_MS) usedSignatures.delete(k);
  const id = createHash("sha256").update(signature).digest("hex");
  if (usedSignatures.has(id)) return false;
  usedSignatures.set(id, now);
  return true;
}

const bearerKey = (req: express.Request): string | undefined => {
  const h = req.get("authorization");
  return h?.startsWith("Bearer ak_") ? h.slice(7).trim() : undefined;
};
const fail = (res: express.Response, status: number, code: string, error: string, extra: object = {}) =>
  void res.status(status).json({ error, code, ...extra });

export function createCreditRecoveryRouter(): express.Router {
  const router = express.Router();
  const perIp = rateLimit({ name: "credit-recovery", max: 10, windowMs: 60_000 });
  const adminPerIp = rateLimit({ name: "credit-admin", max: 30, windowMs: 60_000 });

  router.use(["/credits/recover", "/credits/refund", "/credits/refund/:id"], perIp);
  router.use(["/credits/recover", "/credits/refund", "/credits/refund/:id"], async (_req, res, next) => {
    if (!creditsEnabled()) { fail(res, 503, "credits_off", "Credit sales are not enabled"); return; }
    await _state.ensureLoaded();
    next();
  });

  router.post("/credits/recover", async (req, res) => {
    const b = (req.body ?? {}) as { payer?: unknown; issuedAt?: unknown; signature?: unknown; account?: unknown };
    const payer = typeof b.payer === "string" && /^0x[0-9a-fA-F]{40}$/.test(b.payer) ? b.payer : null;
    const signature = typeof b.signature === "string" && /^0x[0-9a-fA-F]{130}$/.test(b.signature) ? (b.signature as Hex) : null;
    const issuedAt = typeof b.issuedAt === "number" && Number.isFinite(b.issuedAt) ? b.issuedAt : null;
    const wanted = typeof b.account === "string" && /^[0-9a-f]{12}$/.test(b.account) ? b.account : undefined;
    if (!payer || !signature || issuedAt === null) { fail(res, 400, "bad_request", "payer, issuedAt and signature are required"); return; }
    if (Math.abs(Date.now() - issuedAt) > MAX_AGE_MS) { fail(res, 400, "stale", "The signature is too old or from the future"); return; }

    const message = recoveryMessage(SITE_ID, payer, wanted ?? "any", issuedAt);
    let ok = false;
    try { ok = await verifyMessage({ address: payer as Address, message, signature }); } catch { ok = false; }
    if (!ok) { fail(res, 401, "bad_signature", "The signature does not match this wallet, site, account and time"); return; }
    if (!markUsed(signature)) { fail(res, 409, "replayed", "This signature was already used"); return; }

    const mine = [..._state.accounts.entries()].filter(([, a]) => a.payer.toLowerCase() === payer.toLowerCase());
    const picked = wanted ? mine.filter(([, a]) => a.id === wanted) : mine;
    if (picked.length === 0) { fail(res, 404, "no_account", "No credit was bought with this wallet"); return; }
    if (picked.length > 1) {
      fail(res, 409, "choose_account", "This wallet has several keys: sign again with one account id",
        { accounts: picked.map(([, a]) => ({ id: a.id, balanceUsdc: formatUsdc(BigInt(a.balance)) })) });
      return;
    }
    const [oldHash, acct] = picked[0]!;
    const key = `ak_${randomBytes(24).toString("hex")}`;
    _state.accounts.delete(oldHash);
    _state.accounts.set(_state.hashKey(key), acct);
    _state.touch();
    await _state.flush();
    res.json({ api_key: key, account: acct.id, balanceUsdc: formatUsdc(BigInt(acct.balance)), note: "The old key no longer works. Save this one now." });
  });

  router.post("/credits/refund", async (req, res) => {
    const key = bearerKey(req);
    const acct = key ? _state.accounts.get(_state.hashKey(key)) : undefined;
    if (!acct) { fail(res, 401, "bad_key", "Send your API key as a Bearer token"); return; }
    const raw = (req.body as { amount?: unknown } | undefined)?.amount;
    let amount: bigint;
    try { amount = typeof raw === "string" && raw ? parseUsdc(raw) : BigInt(acct.balance); } catch { fail(res, 400, "bad_amount", "That is not a valid amount"); return; }
    const balance = BigInt(acct.balance);
    if (amount < refundMin) { fail(res, 400, "amount_range", `The smallest refund is ${formatUsdc(refundMin)} USDC`); return; }
    if (amount > balance) { fail(res, 400, "amount_range", "That is more than your balance", { balanceUsdc: formatUsdc(balance) }); return; }
    // Synchronous from here to the end of the block: the balance is frozen before anything else can spend it.
    acct.balance = (balance - amount).toString();
    const id = randomBytes(6).toString("hex");
    _state.refunds.set(id, { id, accountId: acct.id ?? "", payer: acct.payer, amount: amount.toString(), status: "pending", createdAt: new Date().toISOString() });
    _state.touch();
    await _state.flush();
    res.status(202).json({ refund: id, status: "pending", amountUsdc: formatUsdc(amount), payTo: acct.payer, balanceUsdc: formatUsdc(BigInt(acct.balance)) });
  });

  router.get("/credits/refund/:id", (req, res) => {
    const key = bearerKey(req);
    const acct = key ? _state.accounts.get(_state.hashKey(key)) : undefined;
    const r = _state.refunds.get(String(req.params.id));
    if (!acct) { fail(res, 401, "bad_key", "Send your API key as a Bearer token"); return; }
    if (!r || r.accountId !== acct.id) { fail(res, 404, "not_found", "No such refund"); return; }
    res.json({ refund: r.id, status: r.status, amountUsdc: formatUsdc(BigInt(r.amount)), payTo: r.payer, txHash: r.txHash ?? null });
  });

  router.get("/admin/refunds", adminPerIp, adminOnly, async (req, res) => {
    await _state.ensureLoaded();
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const list = [..._state.refunds.values()].filter((r) => !status || r.status === status).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    res.json({ refunds: list.map((r) => ({ ...r, amountUsdc: formatUsdc(BigInt(r.amount)) })) });
  });

  router.post("/admin/refunds/:id/paid", adminPerIp, adminOnly, async (req, res) => {
    await _state.ensureLoaded();
    const r = _state.refunds.get(String(req.params.id));
    const tx = (req.body as { txHash?: unknown } | undefined)?.txHash;
    if (!r) { fail(res, 404, "not_found", "No such refund"); return; }
    if (r.status !== "pending") { fail(res, 409, "already_resolved", `This refund is already ${r.status}`); return; }
    if (typeof tx !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(tx)) { fail(res, 400, "bad_request", "txHash must be a transaction hash"); return; }
    r.status = "paid"; r.txHash = tx; r.resolvedAt = new Date().toISOString();
    if (restock) _state.adjustSold(-BigInt(r.amount)); else _state.touch();
    await _state.flush();
    res.json({ refund: r.id, status: r.status });
  });

  router.post("/admin/refunds/:id/reject", adminPerIp, adminOnly, async (req, res) => {
    await _state.ensureLoaded();
    const r = _state.refunds.get(String(req.params.id));
    if (!r) { fail(res, 404, "not_found", "No such refund"); return; }
    if (r.status !== "pending") { fail(res, 409, "already_resolved", `This refund is already ${r.status}`); return; }
    const acct = [..._state.accounts.values()].find((a) => a.id === r.accountId);
    if (acct) acct.balance = (BigInt(acct.balance) + BigInt(r.amount)).toString();
    r.status = "rejected"; r.resolvedAt = new Date().toISOString();
    _state.touch();
    await _state.flush();
    res.json({ refund: r.id, status: r.status });
  });

  return router;
}
