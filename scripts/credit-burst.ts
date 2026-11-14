/**
 * Spending credit under heavy concurrency must never overspend a key.
 * Start the backend with CREDIT_POOL_USDC=10 and RATE_LIMIT_MULTIPLIER=50, then:
 *   API_BASE=http://localhost:3005 bun run scripts/credit-burst.ts
 * Buys 0.5 USDC of credit with a real testnet payment (needs AGENT_PRIVATE_KEY with a Gateway balance).
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const API = process.env.API_BASE ?? "http://localhost:3005";
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set");
const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });

const bought = await client.pay<{ api_key: string; balanceUsdc: string }>(`${API}/credits/buy`, { method: "POST", body: JSON.stringify({ amount: "0.5" }) });
const apiKey = bought.data.api_key;
console.log(`bought ${bought.data.balanceUsdc} USDC of credit; firing 1000 calls of 0.001 at once`);

const t0 = performance.now();
const results = await Promise.all(
  Array.from({ length: 1000 }, () =>
    fetch(`${API}/pay/gas`, { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` }, body: "{}" }).then(
      async r => ({ status: r.status, code: ((await r.json().catch(() => ({}))) as { code?: string }).code }),
      () => ({ status: 0, code: "network" }),
    ),
  ),
);
const ms = Math.round(performance.now() - t0);
const ok = results.filter(r => r.status === 200).length;
const refused = results.filter(r => r.status === 402 && r.code === "insufficient_credit").length;
const other = results.length - ok - refused;
const bal = (await (await fetch(`${API}/credits/balance`, { headers: { Authorization: `Bearer ${apiKey}` } })).json()) as { balanceUsdc: string; spentUsdc: string };

let problems = 0;
const check = (name: string, good: boolean, detail: string) => { if (!good) problems += 1; console.log(`${good ? "pass " : "FAIL "} ${name}  (${detail})`); };
check("exactly 500 calls were served (0.5 / 0.001)", ok === 500, `${ok} served, ${refused} refused for lack of credit, ${other} other`);
check("the other 500 were refused cleanly", refused === 500 && other === 0, `${refused} refused`);
check("balance is exactly zero, spent exactly 0.5", bal.balanceUsdc === "0" && bal.spentUsdc === "0.5", `${bal.balanceUsdc} left, ${bal.spentUsdc} spent`);
console.log(`1000 calls in ${ms} ms`);
console.log(problems === 0 ? "\nNO OVERSPEND" : `\n${problems} PROBLEM(S)`);
process.exit(problems === 0 ? 0 : 1);
