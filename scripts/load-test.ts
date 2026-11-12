/**
 * Sustained load on Arc Testnet: real payments arriving at a fixed rate for a fixed time.
 * RATE=10 SECONDS=60 bun run scripts/load-test.ts
 * Needs AGENT_PRIVATE_KEY in .env, a Gateway balance (it tops up as needed) and the backend running.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const API = process.env.API_BASE ?? "http://localhost:3003";
const RATE = Number(process.env.RATE ?? 10);
const SECONDS = Number(process.env.SECONDS ?? 60);
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set in .env");

const ROUTES: Array<{ path: string; method: "GET" | "POST"; atomic: bigint }> = [
  { path: "/pay/summarize", method: "POST", atomic: 1000n },
  { path: "/pay/gas", method: "POST", atomic: 1000n },
  { path: "/price", method: "GET", atomic: 1000n },
];
const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });

const need = BigInt(RATE * SECONDS) * 1000n + 50_000n;
let balance = (await client.getBalances()).gateway.available;
while (balance < need) {
  await client.deposit("1");
  balance = (await client.getBalances()).gateway.available;
}
console.log(`Load: ${RATE} payments/s for ${SECONDS}s against ${API}  (Gateway balance ${Number(balance) / 1e6} USDC)\n`);

interface Outcome { ok: boolean; ms: number; atomic: bigint; error?: string }
const outcomes: Outcome[] = [];
let launched = 0;
let inFlight = 0;
let peakInFlight = 0;

const fire = async () => {
  const r = ROUTES[launched++ % ROUTES.length];
  const t0 = performance.now();
  inFlight++;
  peakInFlight = Math.max(peakInFlight, inFlight);
  try {
    const res = await client.pay(`${API}${r.path}`, r.method === "POST" ? { method: "POST", body: JSON.stringify({ text: "load" }) } : { method: "GET" });
    outcomes.push({ ok: res.status === 200 && res.amount === r.atomic, ms: performance.now() - t0, atomic: res.amount });
  } catch (e) {
    outcomes.push({ ok: false, ms: performance.now() - t0, atomic: 0n, error: (e as Error).message.replace(/\s+/g, " ").slice(0, 80) });
  } finally {
    inFlight--;
  }
};

const before = (await client.getBalances()).gateway.available;
const started = Date.now();
const total = RATE * SECONDS;
let progress = 0;
await new Promise<void>(resolve => {
  const timer = setInterval(() => {
    const due = Math.min(total, Math.floor(((Date.now() - started) / 1000) * RATE));
    while (progress < due) { progress++; void fire(); }
    if (Date.now() - started >= SECONDS * 1000 + 100 && progress >= total) { clearInterval(timer); resolve(); }
  }, 50);
});
while (inFlight > 0) await new Promise(r => setTimeout(r, 100));

const wall = (Date.now() - started) / 1000;
const okOnes = outcomes.filter(o => o.ok);
const lat = okOnes.map(o => o.ms).sort((a, b) => a - b);
const pct = (p: number) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * p))] ?? 0);
const after = (await client.getBalances()).gateway.available;
const charged = okOnes.reduce((a, o) => a + o.atomic, 0n);
const errors = new Map<string, number>();
for (const o of outcomes.filter(x => !x.ok)) errors.set(o.error ?? "unexpected response", (errors.get(o.error ?? "unexpected response") ?? 0) + 1);

console.log(`sent ${outcomes.length} | ok ${okOnes.length} | failed ${outcomes.length - okOnes.length} | ${wall.toFixed(1)}s | ${(okOnes.length / wall).toFixed(1)} ok/s | peak in flight ${peakInFlight}`);
console.log(`latency  p50 ${pct(0.5)} ms | p95 ${pct(0.95)} ms | p99 ${pct(0.99)} ms | max ${pct(1)} ms`);
console.log(`money    charged per responses ${charged} | balance fell by ${before - after} | ${charged === before - after ? "EXACT MATCH" : `DIFFERENCE ${before - after - charged} (paid but no good answer, or the reverse)`}`);
for (const [msg, n] of errors) console.log(`  ${n} x ${msg}`);
process.exit(charged === before - after ? 0 : 1);
