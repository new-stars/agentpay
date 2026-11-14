/**
 * Prepaid credit with a hard pool, tested with real testnet payments.
 * Start the backend with CREDIT_POOL_USDC=1 (and RATE_LIMIT_MULTIPLIER=20), then:
 *   API_BASE=http://localhost:3004 bun run scripts/credits-test.ts
 * Needs AGENT_PRIVATE_KEY (throwaway testnet key with a Gateway balance of at least 1.1 USDC).
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const API = process.env.API_BASE ?? "http://localhost:3004";
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set");
const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });

let problems = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) problems += 1;
  console.log(`${ok ? "pass " : "FAIL "} ${name}${detail ? `  (${detail})` : ""}`);
};
const j = async (path: string, init?: RequestInit) => {
  const res = await fetch(`${API}${path}`, init);
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown>, res };
};
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  j(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const buy = async (amount: string, existingKey?: string) => {
  try {
    const r = await client.pay<{ api_key?: string; balanceUsdc: string }>(`${API}/credits/buy`, { method: "POST", body: JSON.stringify({ amount, ...(existingKey ? { key: existingKey } : {}) }) });
    return { ok: true as const, ...r.data };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
};
const gatewayBalance = async () => (await client.getBalances()).gateway.available;
const atomic = (usdc: string) => BigInt(Math.round(Number(usdc) * 1e6));

console.log("Prepaid credit with a hard pool\n");
const pool0 = (await j("/credits")).body;
check("pool is on and starts empty", pool0.enabled === true && pool0.soldUsdc === "0", `total ${String(pool0.totalUsdc)}, min ${String(pool0.minPurchaseUsdc)}`);
const total = atomic(String(pool0.totalUsdc));
const start = await gatewayBalance();

// Refused before any payment
check("amount that is not a number", (await post("/credits/buy", { amount: "abc" })).body.code === "bad_amount");
check("amount with 7 decimals", (await post("/credits/buy", { amount: "0.1234567" })).body.code === "bad_amount");
check("amount below the minimum", (await post("/credits/buy", { amount: "0.001" })).body.code === "amount_range");
check("amount above the whole pool", (await post("/credits/buy", { amount: "5" })).body.code === "amount_range");
check("demo mode cannot create credit", (await post("/credits/buy", { amount: "0.1" }, { "X-Demo-Mode": "simulate" })).body.code === "demo_not_allowed");
check("top-up of an unknown key", (await post("/credits/buy", { amount: "0.1", key: "ak_nope" })).body.code === "bad_key");
check("credit cannot buy credit", (await post("/credits/buy", { amount: "0.1" }, { Authorization: "Bearer ak_whatever" })).body.code === "bad_key");

// The price asked for is the price charged
const challenge = await post("/credits/buy", { amount: "0.37" });
const required = JSON.parse(Buffer.from(challenge.res.headers.get("payment-required") ?? "e30=", "base64").toString("utf8")) as { accepts?: Array<{ amount: string }> };
check("the 402 asks for exactly the amount requested", challenge.status === 402 && required.accepts?.[0]?.amount === "370000", `asked 0.37, challenge says ${required.accepts?.[0]?.amount} units`);

// Any amount, any number of times
const a = await buy("0.3");
check("buy 0.3", a.ok && typeof a.api_key === "string", a.ok ? `balance ${a.balanceUsdc}` : a.error);
const keyA = a.ok ? (a.api_key as string) : "";
const a2 = await buy("0.5", keyA);
check("buy 0.5 on the same key", a2.ok && a2.api_key === undefined && a2.balanceUsdc === "0.8", a2.ok ? `balance ${a2.balanceUsdc}` : a2.error);
const b = await buy("0.1");
check("buy 0.1 as a second buyer", b.ok && typeof b.api_key === "string");
const keyB = b.ok ? (b.api_key as string) : "";
check("pool shows 0.9 sold", (await j("/credits")).body.soldUsdc === "0.9", String((await j("/credits")).body.soldUsdc));

// More than is left: refused, nothing charged
const beforeBig = await gatewayBalance();
const big = await buy("0.2");
check("0.2 when only 0.1 is left is refused", !big.ok);
check("...and nothing was charged", (await gatewayBalance()) === beforeBig);

// Five buyers race for the last 0.1: exactly two fit
const race = await Promise.all(Array.from({ length: 5 }, () => buy("0.05")));
const won = race.filter(r => r.ok);
check("5 buyers race for the last 0.1 (0.05 each): exactly 2 get it", won.length === 2, `${won.length} succeeded`);
const keyC = (won.find(r => r.ok && r.api_key) as { api_key?: string } | undefined)?.api_key ?? "";
const after = (await j("/credits")).body;
check("pool is exactly full, never over", after.soldUsdc === after.totalUsdc && after.remainingUsdc === "0", `sold ${String(after.soldUsdc)} of ${String(after.totalUsdc)}`);
check("sold out: even 0.01 is refused", (await post("/credits/buy", { amount: "0.01" })).body.code === "pool_exhausted");

// Spending by key: unlimited calls while credit lasts, no payment per call
let okCalls = 0;
for (let i = 0; i < 20; i++) {
  const r = await post("/pay/summarize", { text: "spend by key" }, { Authorization: `Bearer ${keyA}` });
  if (r.status === 200) okCalls += 1;
}
check("20 calls with the key, no payment per call", okCalls === 20, `${okCalls}/20`);
const bal = await j("/credits/balance", { headers: { Authorization: `Bearer ${keyA}` } });
check("balance fell by exactly 20 x 0.001", bal.body.balanceUsdc === "0.78" && bal.body.spentUsdc === "0.02", `${String(bal.body.balanceUsdc)} left, ${String(bal.body.spentUsdc)} spent`);
check("a bigger call (/risk, 0.05) is also spent from credit", (await post("/risk", { address: "0x0000000000000000000000000000000000000001" }, { Authorization: `Bearer ${keyA}` })).status === 200);
const first = await post("/risk", { address: "0x0000000000000000000000000000000000000001" }, { Authorization: `Bearer ${keyC}` });
const second = await post("/risk", { address: "0x0000000000000000000000000000000000000001" }, { Authorization: `Bearer ${keyC}` });
check("a key with 0.05 pays for one /risk call, then is refused", first.status === 200 && second.status === 402 && second.body.code === "insufficient_credit", `${first.status} then ${second.status}`);
check("an unknown key is refused", (await post("/pay/summarize", {}, { Authorization: "Bearer ak_unknown" })).status === 401);
void keyB;

// The money
const spent = start - (await gatewayBalance());
check("buyer paid exactly the pool total, no more", spent === total, `${spent} of ${total} units`);

console.log(problems === 0 ? "\nCREDIT POOL HOLDS" : `\n${problems} PROBLEM(S)`);
process.exit(problems === 0 ? 0 : 1);
