/**
 * Repeated real payments on Arc Testnet, then a money reconciliation.
 *
 * Each round: find a seller through the registry, pay every paid route once, then fire a parallel burst.
 * Afterwards it checks that
 *   1. every response was HTTP 200, charged exactly the listed price and named the right payer,
 *   2. the buyer's Gateway balance fell by exactly the total paid (no double charge, no missing charge),
 *   3. every settlement id is known to Circle, and shows how far each one has got (received ... completed).
 *
 * Needs AGENT_PRIVATE_KEY (throwaway testnet key) in .env.local and the backend running.
 * ROUNDS (default 5), BURST (default 20), API_BASE (default http://localhost:3001),
 * WAIT_MINUTES (default 0): keep polling Circle for that long to watch settlements complete.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { parseUsdc } from "../src/onchain-money";

const API = process.env.API_BASE ?? "http://localhost:3001";
const ROUNDS = Number(process.env.ROUNDS ?? 5);
const BURST = Number(process.env.BURST ?? 20);
const WAIT_MINUTES = Number(process.env.WAIT_MINUTES ?? 0);
const CIRCLE = "https://gateway-api-testnet.circle.com/v1/x402/transfers";
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set (.env.local)");

interface Route { path: string; method: "GET" | "POST"; price: string; body?: object }
// The paid routes of this backend, with the price each must charge.
const ROUTES: Route[] = [
  { path: "/pay/summarize", method: "POST", price: "0.001", body: { text: "soak test document" } },
  { path: "/pay/translate", method: "POST", price: "0.005", body: { text: "hello", target_lang: "fr" } },
  { path: "/pay/analyze", method: "POST", price: "0.010", body: { data: [1, 2, 3, 40, 5] } },
  { path: "/risk", method: "POST", price: "0.050", body: { address: "0x000000000000000000000000000000000000dEaD" } },
  { path: "/explain-contract", method: "POST", price: "0.020", body: { abi: "[]" } },
  { path: "/decode-tx", method: "POST", price: "0.005", body: { txHash: "0x" + "ab".repeat(32), chainId: 1 } },
  { path: "/price", method: "GET", price: "0.001" },
  { path: "/news", method: "GET", price: "0.002" },
  { path: "/pay/sentiment", method: "POST", price: "0.003", body: { text: "great" } },
  { path: "/pay/ens", method: "POST", price: "0.002", body: { query: "vitalik.eth" } },
  { path: "/pay/gas", method: "POST", price: "0.001", body: { to: "0x000000000000000000000000000000000000dEaD" } },
];
const CHEAP = ROUTES.filter(r => Number(r.price) <= 0.003);

const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const ms = (t0: number) => Math.round(performance.now() - t0);
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0; };

interface Outcome { ok: boolean; route: Route; ms: number; id?: string; atomic?: bigint; error?: string; retries: number }
const outcomes: Outcome[] = [];
const problems: string[] = [];

/** One payment. A rate-limit refusal is expected under load, so wait and try again like a well-behaved buyer. */
async function payRoute(route: Route): Promise<Outcome> {
  const url = `${API}${route.path}`;
  const t0 = performance.now();
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await client.pay<Record<string, unknown>>(url, route.method === "POST" ? { method: "POST", body: JSON.stringify(route.body ?? {}) } : { method: "GET" });
      const want = parseUsdc(route.price);
      const bad: string[] = [];
      if (r.status !== 200) bad.push(`status ${r.status}`);
      if (r.amount !== want) bad.push(`charged ${r.formattedAmount}, expected ${route.price}`);
      if (!/^[0-9a-f-]{36}$/.test(r.transaction)) bad.push(`odd settlement id ${r.transaction}`);
      const payer = typeof r.data?.paid_by === "string" ? r.data.paid_by.toLowerCase() : undefined;
      if (payer !== undefined && payer !== client.address.toLowerCase()) bad.push(`response names payer ${payer}`);
      if (bad.length) problems.push(`${route.path}: ${bad.join("; ")}`);
      return { ok: bad.length === 0, route, ms: ms(t0), id: r.transaction, atomic: r.amount, retries: attempt, error: bad.join("; ") || undefined };
    } catch (e) {
      const msg = (e as Error).message;
      if (/429|too many|rate|temporarily unavailable|503/i.test(msg) && attempt < 5) { await sleep(Math.min(6_000 * 2 ** attempt, 40_000)); continue; }
      problems.push(`${route.path}: ${msg.slice(0, 140)}`);
      return { ok: false, route, ms: ms(t0), error: msg.slice(0, 140), retries: attempt };
    }
  }
}

console.log(`Backend ${API} | ${ROUNDS} rounds | burst ${BURST}\n`);

// ── make sure there is enough in the Gateway wallet ──
const before = await client.getBalances();
const worstCase = ROUTES.reduce((a, r) => a + parseUsdc(r.price), 0n) * BigInt(ROUNDS) + parseUsdc("0.003") * BigInt(BURST * ROUNDS);
if (before.gateway.available < worstCase) {
  const top = await client.deposit("1");
  console.log(`Topped up the Gateway balance with ${top.formattedAmount} USDC`);
}
const start = await client.getBalances();
console.log(`Gateway balance before: ${start.gateway.formattedAvailable} USDC\n`);

const run0 = performance.now();
for (let round = 1; round <= ROUNDS; round++) {
  // 1. discovery through the registry, like a real buyer agent
  const sel = await fetch(`${API}/registry/select?category=NLP&maxPrice=0.01`);
  if (!sel.ok) problems.push(`round ${round}: registry select answered HTTP ${sel.status}`);

  // 2. every route once, one after another (the dear /risk route only in the first and last round)
  const routes = ROUTES.filter(r => r.path !== "/risk" || round === 1 || round === ROUNDS);
  const seq: Outcome[] = [];
  for (const r of routes) seq.push(await payRoute(r));

  // 3. a burst of cheap calls at the same time
  const t0 = performance.now();
  const burst = await Promise.all(Array.from({ length: BURST }, (_, i) => payRoute(CHEAP[i % CHEAP.length])));
  const burstMs = ms(t0);

  outcomes.push(...seq, ...burst);
  const okCount = [...seq, ...burst].filter(o => o.ok).length;
  console.log(
    `round ${round}: ${okCount}/${seq.length + burst.length} ok | sequential median ${pct(seq.map(o => o.ms), 50)} ms | burst of ${BURST} in ${burstMs} ms` +
      ` | retries ${[...seq, ...burst].reduce((a, o) => a + o.retries, 0)}`,
  );
}
const wall = ms(run0);

// ── reconciliation ──
const paid = outcomes.filter(o => o.ok && o.atomic !== undefined);
const totalPaid = paid.reduce((a, o) => a + (o.atomic ?? 0n), 0n);
await sleep(1_500);
const end = await client.getBalances();
const fell = start.gateway.available - end.gateway.available;
console.log("\nMoney check");
console.log(`  payments that succeeded : ${paid.length} of ${outcomes.length}`);
console.log(`  total they charged      : ${totalPaid} atomic units`);
console.log(`  Gateway balance fell by : ${fell} atomic units`);
if (fell !== totalPaid) problems.push(`balance fell by ${fell} but the responses add up to ${totalPaid}`);
console.log(`  ${fell === totalPaid ? "EXACT MATCH" : "MISMATCH"}`);

const lat = paid.map(o => o.ms);
console.log("\nSpeed (includes the 402 round trip and any rate-limit waiting)");
console.log(`  median ${pct(lat, 50)} ms | p95 ${pct(lat, 95)} ms | max ${Math.max(0, ...lat)} ms | ${Math.round((paid.length / wall) * 1000)} payments/s overall`);

// ── what Circle knows about each payment ──
const ids = [...new Set(paid.map(o => o.id as string))];
const state: Record<string, string> = {};
const lookup = async (id: string) => {
  try {
    const r = await fetch(`${CIRCLE}/${id}`, { headers: { "user-agent": "agentpay-soak/1.0" }, signal: AbortSignal.timeout(8_000) });
    state[id] = r.ok ? ((await r.json()) as { status: string }).status : `HTTP ${r.status}`;
  } catch { state[id] = "unreachable"; }
};
async function sweep() {
  const pending = ids.filter(id => state[id] !== "completed" && state[id] !== "failed");
  for (let i = 0; i < pending.length; i += 10) await Promise.all(pending.slice(i, i + 10).map(lookup));
}
await sweep();
const tally = () => Object.entries(ids.reduce<Record<string, number>>((a, id) => { const s = state[id] ?? "?"; a[s] = (a[s] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k} ${v}`).join(", ");
console.log(`\nCircle knows ${ids.filter(id => !/^HTTP|unreachable/.test(state[id] ?? "")).length} of ${ids.length} settlement ids: ${tally()}`);
if (ids.some(id => /^HTTP|unreachable/.test(state[id] ?? ""))) problems.push("some settlement ids were not found at Circle");

for (let waited = 0; waited < WAIT_MINUTES; waited++) {
  if (ids.every(id => state[id] === "completed" || state[id] === "failed")) break;
  await sleep(60_000);
  await sweep();
  console.log(`  +${waited + 1} min: ${tally()}`);
}
if (ids.some(id => state[id] === "failed")) problems.push("some settlements failed at Circle");

console.log(problems.length === 0 ? "\nSOAK PASSED" : `\n${problems.length} PROBLEM(S):\n  ${[...new Set(problems)].slice(0, 12).join("\n  ")}`);
process.exit(problems.length === 0 ? 0 : 1);
