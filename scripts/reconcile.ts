/**
 * Finds payments that Circle received but this server has no record of (and the reverse) in a time window.
 * A payment can be settled while the server dies before answering; this is how you find those and make them right.
 *
 *   LEDGER_FILE=server/data/ledger-2026-11-12.jsonl FROM=2026-11-12T12:47:30Z TO=2026-11-12T12:48:30Z \
 *     SELLER=0x... bun run scripts/reconcile.ts
 */
import { readFileSync } from "node:fs";

const FROM = process.env.FROM;
const TO = process.env.TO;
const SELLER = process.env.SELLER ?? process.env.VITE_SELLER_ADDRESS;
const FILE = process.env.LEDGER_FILE;
const NETWORK = process.env.PAYMENTS_NETWORK ?? "eip155:5042002";
const BASE = process.env.FACILITATOR_URL ?? "https://gateway-api-testnet.circle.com";
if (!FROM || !TO || !SELLER || !FILE) throw new Error("Set FROM, TO, SELLER and LEDGER_FILE (see the comment at the top)");

interface Transfer { id: string; status: string; amount: string; createdAt: string }
const STATUSES = ["received", "batched", "confirmed", "completed", "failed"];

async function page(status: string, from: string, to: string): Promise<Transfer[]> {
  const qs = new URLSearchParams({ to: SELLER as string, network: NETWORK, status, startDate: from, endDate: to, pageSize: "50" });
  const res = await fetch(`${BASE}/v1/x402/transfers?${qs.toString()}`, { headers: { "User-Agent": "agentpay-reconcile/1.0" } });
  if (!res.ok) throw new Error(`Circle answered HTTP ${res.status}`);
  return ((await res.json()) as { transfers?: Transfer[] }).transfers ?? [];
}

/** A full page of 50 may hide more, so split the window in half until every piece is under 50. */
async function window(status: string, from: string, to: string, depth = 0): Promise<Transfer[]> {
  const rows = await page(status, from, to);
  if (rows.length < 50 || depth >= 12) return rows;
  const mid = new Date((Date.parse(from) + Date.parse(to)) / 2).toISOString();
  return [...(await window(status, from, mid, depth + 1)), ...(await window(status, mid, to, depth + 1))];
}

const atCircle = new Map<string, Transfer>();
for (const s of STATUSES) for (const t of await window(s, new Date(FROM).toISOString(), new Date(TO).toISOString())) atCircle.set(t.id, t);

const ours = new Set(
  readFileSync(FILE, "utf8").split("\n").filter(Boolean)
    .map(l => JSON.parse(l) as { id: string; at: string })
    .filter(e => e.at >= new Date(FROM).toISOString() && e.at <= new Date(TO).toISOString())
    .map(e => e.id),
);

const missingHere = [...atCircle.values()].filter(t => !ours.has(t.id));
const missingAtCircle = [...ours].filter(id => !atCircle.has(id));
const sum = (ts: Transfer[]) => ts.reduce((a, t) => a + BigInt(t.amount), 0n);

console.log(`Window ${FROM} to ${TO}`);
console.log(`  Circle received ${atCircle.size} payments (${sum([...atCircle.values()])} atomic units)`);
console.log(`  this server recorded ${ours.size}`);
console.log(`  PAID BUT NOT RECORDED HERE: ${missingHere.length} (${sum(missingHere)} atomic units)`);
for (const t of missingHere) console.log(`    ${t.id}  ${t.createdAt}  ${t.amount}  ${t.status}`);
console.log(`  RECORDED HERE BUT UNKNOWN TO CIRCLE: ${missingAtCircle.length}`);
for (const id of missingAtCircle) console.log(`    ${id}`);
process.exit(missingAtCircle.length === 0 ? 0 : 1);
