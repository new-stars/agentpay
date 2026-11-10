/**
 * Buyer bot: discover a seller in the AgentPay registry, then pay for it with Circle Gateway Nanopayments.
 *
 *   bun run scripts/buyer-bot.ts
 *
 * Reads AGENT_PRIVATE_KEY from .env (a throwaway testnet key). Never prints it.
 * Testnet only (Arc Testnet).
 */
import { GatewayClient } from "@circle-fin/x402-batching/client";

const API = process.env.REGISTRY_URL ?? "http://localhost:3001";
const MAX_PRICE_USDC = "0.01"; // budget for this task (buyer price, incl. broker fee)
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set in .env");

const json = (v: unknown): string =>
  JSON.stringify(v, (_k: string, x: unknown): unknown => (typeof x === "bigint" ? x.toString() : x), 2);
const step = (n: number, msg: string) => console.log(`\n[${n}] ${msg}`);

interface Best {
  id: string; name: string; baseUrl: string; path: string; method: "GET" | "POST"; payTo: string;
  price: string; brokerFee: string; buyerPrice: string;
}

const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });
console.log("buyer address:", client.address);

step(1, "Balances before");
console.log(json(await client.getBalances()));

step(2, `Discover: cheapest healthy NLP seller under ${MAX_PRICE_USDC} USDC`);
const sel = await fetch(`${API}/registry/select?category=NLP&maxPrice=${MAX_PRICE_USDC}`);
if (!sel.ok) throw new Error(`select failed: HTTP ${sel.status} ${await sel.text()}`);
const { best } = (await sel.json()) as { best: Best };
const url = `${best.baseUrl}${best.path}`;
console.log(`picked: ${best.name}\n  ${best.method} ${url}\n  payTo ${best.payTo}\n  seller price ${best.price}, fee ${best.brokerFee}, buyer price ${best.buyerPrice}`);

step(3, "Pre-flight: does the URL support Gateway batching?");
const sup = await client.supports(url);
console.log(json(sup));

step(4, "Spending guard: a 0.0001 USDC cap must block this payment");
const guarded = new GatewayClient({ chain: "arcTestnet", privateKey: key });
guarded.onBeforePaymentCreation((ctx) =>
  Promise.resolve(BigInt(ctx.selectedRequirements.amount) > 100n ? { abort: true, reason: "over cap" } : undefined),
);
try {
  await guarded.pay(url, { method: best.method, body: JSON.stringify({ text: "guard test" }) });
  console.log("BUG: payment went through despite the cap");
} catch (e) {
  console.log("blocked as expected:", (e as Error).message);
}

step(5, "Ensure Gateway balance, then pay");
const before = await client.getBalances();
console.log("gateway balance:", json(before.gateway));
if (before.gateway.available < 10_000n) {
  const dep = await client.deposit("1");
  console.log("deposited", dep.formattedAmount, "USDC, tx", dep.depositTxHash);
} else {
  console.log("Gateway balance is enough, skipping deposit");
}

const paid = await client.pay<Record<string, unknown>>(url, {
  method: best.method,
  body: JSON.stringify({ text: "Circle lets agents pay per call in USDC, with no account and no gas." }),
});
console.log(`paid ${paid.formattedAmount} USDC, HTTP ${paid.status}, settlement ${paid.transaction}`);
console.log("response:", json(paid.data));

step(6, "Balances after");
console.log(json(await client.getBalances()));
