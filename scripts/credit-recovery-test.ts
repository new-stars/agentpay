/**
 * Real-payment test of key recovery and refunds (Arc Testnet, throwaway wallets).
 * Start the backend with CREDIT_POOL_USDC, ADMIN_TOKEN and VITE_SELLER_ADDRESS (the test seller), then:
 *   API_BASE=http://localhost:3004 ADMIN_TOKEN=... bun run scripts/credit-recovery-test.ts
 */
import { spawnSync } from "node:child_process";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const API = (process.env.API_BASE ?? "http://localhost:3004").replace(/\/$/, "");
const adminToken = process.env.ADMIN_TOKEN ?? "";
const buyerKey = process.env.AGENT_PRIVATE_KEY as `0x${string}`;
const sellerKey = process.env.TEST_SELLER_PRIVATE_KEY as `0x${string}`;
if (!buyerKey || !sellerKey || !adminToken) { console.error("Need AGENT_PRIVATE_KEY, TEST_SELLER_PRIVATE_KEY, ADMIN_TOKEN."); process.exit(1); }

const buyer = privateKeyToAccount(buyerKey);
const attacker = privateKeyToAccount(generatePrivateKey());
const client = new GatewayClient({ chain: "arcTestnet", privateKey: buyerKey });
let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${extra}`}`);
};
const j = async (path: string, init: RequestInit = {}) => { const r = await fetch(`${API}${path}`, init); return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> }; };
const post = (path: string, body: object, headers: Record<string, string> = {}) => j(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const bearer = (k: string) => ({ authorization: `Bearer ${k}` });
const admin = { authorization: `Bearer ${adminToken}` };
const poolSold = async () => String((await j("/credits")).body.soldUsdc);

const info = (await j("/credits")).body as { site: string; enabled: boolean };
if (!info.enabled) { console.error("Credits are not enabled on this backend."); process.exit(1); }
const sign = (acct: typeof buyer, payer: string, account: string, issuedAt: number, site = info.site) =>
  acct.signMessage({ message: `AgentPay API credit key recovery\nsite: ${site}\npayer: ${payer.toLowerCase()}\naccount: ${account}\nissued: ${issuedAt}` });

if ((await client.getBalances()).gateway.available < 800_000n) await client.deposit("1");

console.log("== buy credit");
const buy = async (amount: string) => (await client.pay<{ api_key: string; account: string; balanceUsdc: string }>(`${API}/credits/buy`, { method: "POST", body: JSON.stringify({ amount }) })).data;
const first = await buy("0.3");
check("bought 0.3 and got a key + account id", first.api_key.startsWith("ak_") && /^[0-9a-f]{12}$/.test(first.account) && first.balanceUsdc === "0.3");

console.log("\n== key recovery");
const now = Date.now();
check("a different wallet signing for the buyer is refused", (await post("/credits/recover", { payer: buyer.address, issuedAt: now, signature: await sign(attacker, buyer.address, "any", now) })).status === 401);
check("a signature from 10 minutes ago is refused", (await post("/credits/recover", { payer: buyer.address, issuedAt: now - 600_000, signature: await sign(buyer, buyer.address, "any", now - 600_000) })).body.code === "stale");
check("a signature made for another site is refused", (await post("/credits/recover", { payer: buyer.address, issuedAt: now, signature: await sign(buyer, buyer.address, "any", now, "https://evil.example") })).status === 401);
check("a wallet that bought nothing gets 404", (await post("/credits/recover", { payer: attacker.address, issuedAt: now, signature: await sign(attacker, attacker.address, "any", now) })).status === 404);
check("an unknown account id gets 404", (await post("/credits/recover", { payer: buyer.address, account: "aaaaaaaaaaaa", issuedAt: now, signature: await sign(buyer, buyer.address, "aaaaaaaaaaaa", now) })).status === 404);
const sig = await sign(buyer, buyer.address, "any", now);
const rec = await post("/credits/recover", { payer: buyer.address, issuedAt: now, signature: sig });
const key2 = String(rec.body.api_key);
check("the buyer's own signature gives a new key with the same balance", rec.status === 200 && key2.startsWith("ak_") && key2 !== first.api_key && rec.body.balanceUsdc === "0.3");
check("the OLD key stops working at once", (await j("/credits/balance", { headers: bearer(first.api_key) })).status === 401);
check("the new key works", (await j("/credits/balance", { headers: bearer(key2) })).body.balanceUsdc === "0.3");
check("replaying the same signature is refused", (await post("/credits/recover", { payer: buyer.address, issuedAt: now, signature: sig })).body.code === "replayed");

console.log("\n== refunds");
for (let i = 0; i < 10; i++) await post("/pay/summarize", { text: "x" }, bearer(key2));
check("10 calls spent 0.01 of the key", (await j("/credits/balance", { headers: bearer(key2) })).body.balanceUsdc === "0.29");
check("refund without a key is refused", (await post("/credits/refund", { amount: "0.1" })).status === 401);
check("a bad amount is refused", (await post("/credits/refund", { amount: "abc" }, bearer(key2))).body.code === "bad_amount");
check("below the smallest refund is refused", (await post("/credits/refund", { amount: "0.001" }, bearer(key2))).body.code === "amount_range");
check("more than the balance is refused", (await post("/credits/refund", { amount: "5" }, bearer(key2))).body.code === "amount_range");
const soldBefore = await poolSold();
const r1 = await post("/credits/refund", { amount: "0.1" }, bearer(key2));
check("refund of 0.1 is accepted as pending", r1.status === 202 && r1.body.status === "pending" && r1.body.balanceUsdc === "0.19");
check("it will be paid to the wallet that paid, nobody else", String(r1.body.payTo).toLowerCase() === buyer.address.toLowerCase());
const other = await buy("0.05");
check("another key cannot see this refund", (await j(`/credits/refund/${String(r1.body.refund)}`, { headers: bearer(other.api_key) })).status === 404);
const burst = await Promise.all(Array.from({ length: 5 }, () => post("/credits/refund", { amount: "0.1" }, bearer(key2))));
check("5 simultaneous refund requests on 0.19: exactly 1 succeeds (balance can't be refunded twice)", burst.filter((b) => b.status === 202).length === 1, JSON.stringify(burst.map((b) => b.status)));
check("balance is now 0.09", (await j("/credits/balance", { headers: bearer(key2) })).body.balanceUsdc === "0.09");
check("admin list needs the token", (await j("/admin/refunds")).status !== 200);
const pending = ((await j("/admin/refunds?status=pending", { headers: admin })).body.refunds as { id: string; amountUsdc: string }[]);
check("admin sees both pending refunds", pending.length === 2, String(pending.length));
const second = pending.find((p) => p.id !== r1.body.refund)!;
check("rejecting a refund puts the money back on the key", (await post(`/admin/refunds/${second.id}/reject`, {}, admin)).status === 200 && (await j("/credits/balance", { headers: bearer(key2) })).body.balanceUsdc === "0.19");
check("a refund cannot be rejected twice", (await post(`/admin/refunds/${second.id}/reject`, {}, admin)).status === 409);

console.log("\n== operator pays the refund from the seller wallet");
const walletBefore = (await client.getBalances()).wallet.balance;
const run = spawnSync("bun", ["run", "scripts/pay-refunds.ts", "--yes"], { env: { ...process.env, API_BASE: API, ADMIN_TOKEN: adminToken, SELLER_PRIVATE_KEY: sellerKey }, encoding: "utf8", timeout: 120_000 });
console.log(run.stdout.split("\n").map((l) => `   | ${l}`).join("\n"));
const walletAfter = (await client.getBalances()).wallet.balance;
check("payout script finished cleanly", run.status === 0, run.stderr.slice(0, 200));
check("the buyer's wallet received exactly 0.1 USDC", walletAfter - walletBefore === 100_000n, String(walletAfter - walletBefore));
const done = await j(`/credits/refund/${String(r1.body.refund)}`, { headers: bearer(key2) });
check("refund shows paid with a transaction hash", done.body.status === "paid" && /^0x[0-9a-f]{64}$/.test(String(done.body.txHash)));
check("paid refund cannot be paid again", (await post(`/admin/refunds/${String(r1.body.refund)}/paid`, { txHash: `0x${"a".repeat(64)}` }, admin)).status === 409);
const soldAfter = await poolSold();
const expectedSold = Number(soldBefore) + 0.05 - 0.1;
check(`the refunded 0.1 went back into the pool (sold ${soldBefore} + 0.05 bought - 0.1 refunded = ${expectedSold.toFixed(2)})`, Math.abs(Number(soldAfter) - expectedSold) < 1e-9, `got ${soldAfter}`);

console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`} (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
