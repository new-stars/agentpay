/**
 * Measures where the time goes in one Gateway payment (testnet) and how well payments run in parallel.
 * Needs AGENT_PRIVATE_KEY (throwaway testnet key with a Gateway balance) in .env and the backend running.
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const API = process.env.API_BASE ?? "http://localhost:3001";
const URL_ = `${API}/pay/summarize`;
const SEQ = Number(process.env.SEQ ?? 8);
const PAR = Number(process.env.PAR ?? 10);
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set in .env");

const ms = (t0: number) => Math.round(performance.now() - t0);
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return `min ${s[0]}  median ${s[Math.floor(s.length / 2)]}  max ${s[s.length - 1]}  avg ${Math.round(sum / s.length)} ms`;
};

const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });
let signStart = 0;
let signMs = 0;
client.onBeforePaymentCreation(() => { signStart = performance.now(); return Promise.resolve(undefined); });
client.onAfterPaymentCreation(() => { signMs = ms(signStart); return Promise.resolve(); });

const body = JSON.stringify({ text: "benchmark payment" });
const pay = () => client.pay(URL_, { method: "POST", body });

console.log("warm-up (first call also opens connections):");
let t = performance.now();
await pay();
console.log(`  first payment ${ms(t)} ms`);

console.log(`\n${SEQ} sequential payments:`);
const totals: number[] = [];
const signs: number[] = [];
for (let i = 0; i < SEQ; i++) {
  t = performance.now();
  await pay();
  totals.push(ms(t));
  signs.push(signMs);
}
console.log("  total      ", stats(totals));
console.log("  signing    ", stats(signs));
console.log("  net+server ", stats(totals.map((x, i) => x - (signs[i] ?? 0))));

console.log(`\n${PAR} payments at once:`);
t = performance.now();
const results = await Promise.allSettled(Array.from({ length: PAR }, () => pay()));
const wall = ms(t);
const ok = results.filter(r => r.status === "fulfilled").length;
console.log(`  ${ok}/${PAR} ok in ${wall} ms wall time (${Math.round((ok / wall) * 1000)} payments/s)`);
for (const r of results) if (r.status === "rejected") console.log("  failed:", String((r.reason as Error).message).slice(0, 120));
