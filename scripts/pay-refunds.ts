/**
 * Operator tool: pay out pending credit refunds from YOUR seller wallet.
 *
 * Run it on your own machine. The server never holds this key.
 *   ADMIN_TOKEN=... SELLER_PRIVATE_KEY=0x... API_BASE=https://your-site/api bun run scripts/pay-refunds.ts
 * Add --yes to skip the confirmation for each refund. Funds come from the seller's Gateway balance and go to the
 * wallet that paid, on the same chain. Each payout is then recorded on the server with its transaction hash.
 */
import { createInterface } from "node:readline/promises";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const API = (process.env.API_BASE ?? "http://localhost:3001").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
const privateKey = process.env.SELLER_PRIVATE_KEY as `0x${string}` | undefined;
const chain = (process.env.CHAIN ?? "arcTestnet") as "arcTestnet";
const autoYes = process.argv.includes("--yes");
if (!token || !privateKey) { console.error("Set ADMIN_TOKEN and SELLER_PRIVATE_KEY."); process.exit(1); }

interface Refund { id: string; payer: string; amount: string; amountUsdc: string; status: string }
const admin = (path: string, body?: object) =>
  fetch(`${API}${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const listRes = await admin("/admin/refunds?status=pending");
if (!listRes.ok) { console.error(`Could not list refunds (HTTP ${listRes.status}).`); process.exit(1); }
const { refunds } = (await listRes.json()) as { refunds: Refund[] };
if (refunds.length === 0) { console.log("No pending refunds."); process.exit(0); }

const seller = new GatewayClient({ chain, privateKey });
const maxFee = process.env.REFUND_MAX_FEE ?? "0.05";            // the SDK's own default ceiling is 2.01 USDC
const gasMin = BigInt(Math.round(Number(process.env.REFUND_MIN_GAS_USDC ?? "0.05") * 1e6));

// A payout is a burn at Circle followed by a mint from THIS wallet. If the wallet cannot pay gas for the mint, the
// burn can already have happened and the money gets stuck (this happened in testing). So check gas before anything.
const start = await seller.getBalances();
if (start.wallet.balance < gasMin) {
  console.error(`Stopped before moving any money: this wallet holds ${start.wallet.formatted} USDC for gas, and a payout needs at least ${formatMicro(gasMin)}.`);
  console.error("Add a little USDC to the seller wallet (on Arc, USDC is the gas token), then run this again.");
  process.exit(1);
}

function formatMicro(v: bigint): string { return (Number(v) / 1e6).toFixed(6); }
const rl = createInterface({ input: process.stdin, output: process.stdout });
let paid = 0, skipped = 0, failed = 0;
for (const r of refunds) {
  const before = (await seller.getBalances()).gateway.available;
  console.log(`\nRefund ${r.id}: ${r.amountUsdc} USDC to ${r.payer}  (your Gateway balance: ${formatMicro(before)}, fee cap ${maxFee})`);
  if (before < BigInt(r.amount)) { console.log("  not enough Gateway balance yet (batched settlements may still be pending): skipped"); skipped++; continue; }
  if (!autoYes && (await rl.question("  send it? [y/N] ")).trim().toLowerCase() !== "y") { skipped++; continue; }
  try {
    const sent = await seller.withdraw(r.amountUsdc, { chain, recipient: r.payer as `0x${string}`, maxFee });
    console.log(`  sent, transaction ${sent.mintTxHash}`);
    const rec = await admin(`/admin/refunds/${r.id}/paid`, { txHash: sent.mintTxHash });
    if (rec.ok) { paid++; console.log("  recorded as paid"); }
    else { failed++; console.error(`  MONEY SENT BUT NOT RECORDED (HTTP ${rec.status}). Mark it paid by hand with this hash: ${sent.mintTxHash}`); }
  } catch (err) {
    failed++;
    console.error(`  transfer failed: ${err instanceof Error ? err.message : String(err)}`);
    const after = (await seller.getBalances()).gateway.available;
    if (after < before) {
      console.error(`  !! YOUR GATEWAY BALANCE FELL BY ${formatMicro(before - after)} USDC BUT THE PAYOUT DID NOT COMPLETE. The money may be in flight.`);
      console.error("  !! Stopping so nothing else is sent. Do not retry this refund; check the wallet and contact Circle support.");
      break;
    }
    console.error("  your Gateway balance is unchanged, so nothing was lost; this refund is still pending.");
  }
}
rl.close();
console.log(`\nDone: ${paid} paid, ${skipped} skipped, ${failed} failed.`);
process.exit(failed ? 1 : 0);
