import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { formatUnits } from "viem";
import { createRegistryRouter } from "./registry";
import { createPaymentsRouter, recordRoute } from "./payments";
import { isServerless, storeKind } from "./store";
import { rateLimit } from "./ratelimit";
import { createPacer } from "./pacer";
import { createLedgerRouter, recordLedger } from "./ledger";
import { cors, errorHandler, notFound, securityHeaders } from "./security";
import { formatUsdc, parseUsdc } from "../src/onchain-money";
import { balanceHandler, flushCredits, hasCreditKey, infoHandler, issueCredit, purchaseGuard, spendCredit } from "./credits";

// Extended request type with payment info injected by middleware
type PaidRequest = express.Request & {
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
};

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(cors);
// One visitor cannot hammer the service as a whole; stricter limits sit on the expensive routes.
app.use(rateLimit({ name: "all", max: 1_200, windowMs: 60_000 }));
app.use(express.json({ limit: "200kb" }));

const SELLER_ADDRESS = process.env.VITE_SELLER_ADDRESS;
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ||
  "https://gateway-api-testnet.circle.com";

if (!SELLER_ADDRESS) {
  console.warn(
    "[AgentPay] VITE_SELLER_ADDRESS not set — using demo placeholder. Set it in .env to receive real payments."
  );
}

// The payment gate calls Circle's settlement service with no time limit of its own. If that service hangs, every
// buyer would hang with it and requests would pile up. Give each of those calls a deadline; a timeout counts as a
// failed settlement (503, nothing charged, circuit breaker).
const FACILITATOR_TIMEOUT_MS = Number(process.env.FACILITATOR_TIMEOUT_MS) > 0 ? Number(process.env.FACILITATOR_TIMEOUT_MS) : 8_000;
const nativeFetch = globalThis.fetch.bind(globalThis);
let lastBlockLog = 0;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith(FACILITATOR_URL)) return nativeFetch(input, init);
  // A call the web firewall in front of Circle turned away (an HTML page or 429, not a JSON answer) never reached
  // Circle's service, so asking again cannot settle anything twice. HTTP 429 means "too fast": halve the pace for a
  // while, wait, and go back through the pacer. Other refusals get one quick retry.
  const attempts = (init?.method ?? "GET").toUpperCase() === "POST" ? 3 : 1;
  for (let i = 0; ; i++) {
    const res = await nativeFetch(input, init?.signal ? init : { ...init, signal: AbortSignal.timeout(FACILITATOR_TIMEOUT_MS) });
    const type = res.headers.get("content-type") ?? "";
    const turnedAway = !type.includes("json") && (type.includes("html") || res.status === 429 || res.status === 403 || res.status >= 500);
    if (!turnedAway) return res;
    if (Date.now() - lastBlockLog > 5_000) {
      lastBlockLog = Date.now();
      const body = await res.clone().text().catch(() => "");
      console.warn(`[AgentPay] settlement service sent a non-JSON reply (HTTP ${res.status}, ${res.headers.get("server") ?? "unknown server"}, cf-ray ${res.headers.get("cf-ray") ?? "-"}): ${body.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    if (i >= attempts - 1) return res;
    if (res.status === 429) {
      pacer.slowDown(15_000);
      await new Promise(r => setTimeout(r, 1_000 + Math.random() * 1_000));
      if (!(await pacer.take())) return res;
    } else {
      await new Promise(r => setTimeout(r, 200 * (i + 1) + Math.random() * 150));
    }
  }
}) as typeof fetch;

const gateway = createGatewayMiddleware({
  sellerAddress: (SELLER_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
  facilitatorUrl: FACILITATOR_URL,
});

// ── Faster settlement ──────────────────────────────────────────
// By default the gate calls Circle twice in a row: /verify, then /settle (about 120 ms each).
// /settle checks the whole authorisation again and a call is only served after it succeeds, so the
// extra /verify round trip is skipped. Obviously broken payloads are still rejected locally first.
// Set FAST_SETTLE=off to restore the two-step flow.
const FAST_SETTLE = process.env.FAST_SETTLE !== "off";
if (FAST_SETTLE) {
  gateway.onBeforeVerify((ctx) => {
    const payload = (ctx.paymentPayload as { payload?: { authorization?: { from?: unknown }; signature?: unknown } }).payload;
    const from = payload?.authorization?.from;
    if (typeof from !== "string" || typeof payload?.signature !== "string") {
      return Promise.resolve({ abort: true as const, reason: "malformed_payment" });
    }
    return Promise.resolve({ skip: true as const, result: { isValid: true, payer: from } });
  });
}


// Demo mode lets the website show the full flow without a funded wallet: a request that carries
// "X-Demo-Mode: simulate" gets clearly-marked SAMPLE data and no payment is taken. Every other
// request must carry a real payment. Set DEMO_MODE=off before putting anything of value behind a route.
const DEMO_MODE = process.env.DEMO_MODE !== "off";

// Each paid call class has its own budget. Paying attempts reach Circle's service, so they are the tightest
// and also capped for the whole service.
// Circle's settlement service sits behind a web firewall that can answer a burst of calls with an HTML block page
// instead of JSON. Keep hammering it and the block lasts longer, so after a few failures in a row stop calling it for
// a short, growing pause and tell buyers when to retry. Nothing is charged while this is open.
const breaker = { recent: [] as boolean[], openUntil: 0, pause: 10_000 };
const BREAKER_WINDOW = 20; // look at the last 20 settlements
const BREAKER_MAX_FAILS = 6; // open at 6 failures among them...
const BREAKER_MAX_STREAK = 3; // ...or 3 failures in a row
const breakerRetryAfter = () => Math.max(1, Math.ceil((breaker.openUntil - Date.now()) / 1000));
function noteSettlementResult(ok: boolean) {
  breaker.recent.push(ok);
  if (breaker.recent.length > BREAKER_WINDOW) breaker.recent.shift();
  if (ok) {
    if (breaker.recent.slice(-5).every(Boolean)) breaker.pause = 10_000; // healthy again
    return;
  }
  const fails = breaker.recent.filter(v => !v).length;
  const streak = breaker.recent.slice(-BREAKER_MAX_STREAK);
  if (fails >= BREAKER_MAX_FAILS || (streak.length === BREAKER_MAX_STREAK && streak.every(v => !v))) {
    breaker.openUntil = Date.now() + breaker.pause;
    console.warn(`[AgentPay] settlement service failing (${fails} of the last ${breaker.recent.length}), pausing payments for ${breaker.pause / 1000}s`);
    breaker.pause = Math.min(breaker.pause * 2, 60_000);
    breaker.recent = [];
  }
}

const creditPerIp = rateLimit({ name: "credit-call", max: 1_200, windowMs: 60_000 });
const unpaidPerIp = rateLimit({ name: "pay-unpaid", max: 600, windowMs: 60_000 });
const demoPerIp = rateLimit({ name: "pay-demo", max: 60, windowMs: 60_000 });
const paidPerIp = rateLimit({ name: "pay-real", max: 600, windowMs: 60_000 });
const paidGlobal = rateLimit({ name: "pay-real", max: 3_000, windowMs: 60_000, global: true });

// Calls to Circle go out at a steady pace (bursts allowed), so a spike of buyers waits briefly in a queue instead of
// hitting Circle's firewall. Measured on testnet from one machine: Circle's edge answered HTTP 429 above roughly 9 settlements
// per second, and it looks like a count over a window of about ten seconds, so the burst allowance is kept small. The
// defaults stay below that; raise them only once Circle confirms higher limits for you.
const envNumber = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const pacer = createPacer({
  ratePerSecond: envNumber("SETTLE_RATE_PER_SECOND", 7),
  burst: envNumber("SETTLE_BURST", 10),
  maxWaitMs: 10_000,
  maxQueue: 1_000,
});

function gate(price: string): express.RequestHandler {
  const real = gateway.require(price) as express.RequestHandler;

  const handle: express.RequestHandler = (req, res, next) => {
    if (DEMO_MODE && req.get("x-demo-mode") === "simulate") {
      (req as PaidRequest).payment = {
        verified: false,
        payer: "simulated",
        amount: parseUsdc(price.replace("$", "")).toString(),
        network: "ARC-TESTNET",
      };
      const json = res.json.bind(res);
      res.json = (body?: unknown) => json({ ...(body as object), sample_data: true, demo_mode: true });
      next();
      return;
    }
    // Without a payout address the 402 challenge would name the zero address as payee. Refuse to settle anything then.
    if (!SELLER_ADDRESS && req.get("payment-signature") !== undefined) {
      res.status(503).json({ error: "Payout address is not configured", code: "seller_not_configured" });
      return;
    }
    if (req.get("payment-signature") !== undefined && Date.now() < breaker.openUntil) {
      res.setHeader("Retry-After", String(breakerRetryAfter()));
      res.status(503).json({ error: "Payment service temporarily unavailable, nothing was charged", code: "settlement_unavailable" });
      return;
    }
    if (process.env.PERF_LOG) {
      const t0 = performance.now();
      res.on("finish", () => console.log(`[perf] ${req.path} ${Math.round(performance.now() - t0)}ms status=${res.statusCode}`));
    }
    res.on("finish", () => {
      const pay = (req as PaidRequest).payment;
      if (pay?.verified && pay.transaction && res.statusCode < 400) {
        noteSettlementResult(true);
        recordRoute({ id: pay.transaction, route: req.path });
        void recordLedger({ id: pay.transaction, at: new Date().toISOString(), route: req.path, payer: pay.payer, amount: pay.amount, network: pay.network });
      }
    });
    // The payment gate hides the real cause of a failure behind a bare 500. Log it for the operator, and tell the
    // buyer the truth in a standard way: a temporary problem that is safe to retry (nothing was charged).
    const originalEnd = res.end.bind(res) as (...args: unknown[]) => express.Response;
    res.end = ((...args: unknown[]) => {
      if (res.statusCode >= 500 && typeof args[0] === "string") {
        console.error(`[AgentPay] ${req.path} -> ${res.statusCode}: ${args[0].slice(0, 300)}`);
        if (args[0].includes("Payment processing error")) {
          noteSettlementResult(false);
          res.statusCode = 503;
          res.setHeader("Retry-After", String(Math.max(5, breakerRetryAfter())));
          args[0] = JSON.stringify({ error: "Payment service temporarily unavailable, nothing was charged", code: "settlement_unavailable" });
        }
      }
      return originalEnd(...args);
    }) as typeof res.end;
    // Only a request that carries a payment makes a call to Circle. The price list (402) is answered locally.
    if (req.get("payment-signature") === undefined) { real(req, res, next); return; }
    pacer.take().then(granted => {
      // The buyer hung up while waiting: make no call, charge nothing. (Check the connection, not the request:
      // a request whose body was already read reports itself as destroyed.)
      if (res.destroyed || req.socket.destroyed) return;
      if (!granted) {
        res.setHeader("Retry-After", "2");
        res.status(503).json({ error: "Busy, nothing was charged. Retry shortly", code: "busy" });
        return;
      }
      real(req, res, next);
    }, next);
  };

  const priceAtomic = parseUsdc(price.replace("$", ""));
  return (req, res, next) => {
    // A caller with a prepaid API key spends credit instead of paying per call.
    if (hasCreditKey(req)) {
      creditPerIp(req, res, () => {
        spendCredit(req, res, priceAtomic).then(ok => {
          if (!ok) return;
          (req as PaidRequest).payment = { verified: false, payer: "credit", amount: priceAtomic.toString(), network: "credit" };
          next();
        }, next);
      });
      return;
    }
    const demo = DEMO_MODE && req.get("x-demo-mode") === "simulate";
    const sig = req.get("payment-signature");
    const budget = demo ? demoPerIp : sig !== undefined ? paidPerIp : unpaidPerIp;
    budget(req, res, () => {
      if (sig === undefined || demo) { handle(req, res, next); return; }
      // A malformed Payment-Signature is a client error: answer 400 and do not spend the shared budget on it.
      try { JSON.parse(Buffer.from(sig, "base64").toString("utf8")); }
      catch { res.status(400).json({ error: "Malformed Payment-Signature header", code: "bad_signature" }); return; }
      paidGlobal(req, res, () => handle(req, res, next));
    });
  };
}

/**
 * Checks the types and sizes of the body fields a route reads, BEFORE payment is taken, so a bad request
 * is rejected for free instead of failing after the buyer has been charged. Missing fields are fine.
 */
type FieldRule = ["string", number] | ["array", number] | ["number"];
function bodyShape(rules: Record<string, FieldRule>): express.RequestHandler {
  return (req, res, next) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body !== "object" || Array.isArray(body)) { res.status(400).json({ error: "Body must be a JSON object", code: "bad_body" }); return; }
    for (const [key, rule] of Object.entries(rules)) {
      const v = body[key];
      if (v === undefined) continue;
      const ok =
        rule[0] === "string" ? typeof v === "string" && v.length <= rule[1]
        : rule[0] === "array" ? Array.isArray(v) && v.length <= rule[1] && v.every(x => typeof x === "number" && Number.isFinite(x))
        : typeof v === "number" && Number.isFinite(v);
      if (!ok) { res.status(400).json({ error: `Invalid field: ${key}`, code: "bad_body" }); return; }
    }
    next();
  };
}

// ──────────────────────────────────────────
// Paid routes
// ──────────────────────────────────────────

// $0.001 per call — AI summary endpoint
app.post("/pay/summarize", bodyShape({ text: ["string", 16_000] }), gate("$0.001"), (req: PaidRequest, res) => {
  const { text } = req.body as { text?: string };
  const { payer, amount, network } = req.payment!;
  const usdcAmount = formatUnits(BigInt(amount), 6);

  console.log(`[AgentPay] /summarize  payer=${payer}  amount=${usdcAmount} USDC  network=${network}`);

  const wordCount = (text || "").split(/\s+/).filter(Boolean).length;
  res.json({
    summary: text
      ? `This text contains ${wordCount} word${wordCount !== 1 ? "s" : ""}. Key theme: "${text.slice(0, 60)}${text.length > 60 ? "..." : ""}"`
      : "No text provided.",
    paid_by: payer,
    amount_usdc: usdcAmount,
    network,
  });
});

// $0.005 per call — AI translation endpoint
app.post("/pay/translate", bodyShape({ text: ["string", 16_000], target_lang: ["string", 8] }), gate("$0.005"), (req: PaidRequest, res) => {
  const { text, target_lang } = req.body as { text?: string; target_lang?: string };
  const { payer, amount, network } = req.payment!;
  const usdcAmount = formatUnits(BigInt(amount), 6);

  console.log(`[AgentPay] /translate  payer=${payer}  amount=${usdcAmount} USDC  network=${network}`);

  res.json({
    translation: `[Translated to ${target_lang || "EN"}] ${text || ""}`,
    paid_by: payer,
    amount_usdc: usdcAmount,
    network,
  });
});

// $0.010 per call — Data analysis endpoint
app.post("/pay/analyze", bodyShape({ data: ["array", 1_000] }), gate("$0.010"), (req: PaidRequest, res) => {
  const { data } = req.body as { data?: unknown[] };
  const { payer, amount, network } = req.payment!;
  const usdcAmount = formatUnits(BigInt(amount), 6);

  console.log(`[AgentPay] /analyze  payer=${payer}  amount=${usdcAmount} USDC  network=${network}`);

  const count = Array.isArray(data) ? data.length : 0;
  res.json({
    insight: `Analyzed ${count} data point${count !== 1 ? "s" : ""}. Variance nominal. Trend: upward.`,
    paid_by: payer,
    amount_usdc: usdcAmount,
    network,
  });
});

// $0.050 per call — Wallet risk score
app.post("/risk", bodyShape({ address: ["string", 64] }), gate("$0.050"), (req: PaidRequest, res) => {
  const { address } = req.body as { address?: string };
  const { payer, amount, network } = req.payment!;
  const usdcAmount = formatUnits(BigInt(amount), 6);
  console.log(`[AgentPay] /risk  payer=${payer}  amount=${usdcAmount} USDC  network=${network}`);
  res.json({
    address: address ?? "0x0000",
    risk_score: Math.floor(Math.random() * 30) + 5,
    labels: ["EOA", "active-6m"],
    recommendation: "APPROVE",
    paid_by: payer,
    amount_usdc: usdcAmount,
    network,
  });
});

// $0.020 per call — Contract explainer
app.post("/explain-contract", bodyShape({ abi: ["string", 150_000] }), gate("$0.020"), (req: PaidRequest, res) => {
  const { abi } = req.body as { abi?: string };
  const { payer, amount, network } = req.payment!;
  const usdcAmount = formatUnits(BigInt(amount), 6);
  console.log(`[AgentPay] /explain-contract  payer=${payer}  amount=${usdcAmount} USDC  network=${network}`);
  const hasAbi = typeof abi === "string" && abi.length > 0;
  res.json({
    functions: hasAbi
      ? [{ name: "transfer", description: "Move tokens from caller to recipient", params: { to: "address", amount: "uint256" }, risks: [] }]
      : [],
    overall_risk: "low",
    risk_flags: [],
    paid_by: payer,
    amount_usdc: usdcAmount,
    network,
  });
});

// $0.005 per call — Transaction decoder
app.post("/decode-tx", bodyShape({ txHash: ["string", 80], chainId: ["number"] }), gate("$0.005"), (req: PaidRequest, res) => {
  const { txHash, chainId } = req.body as { txHash?: string; chainId?: number };
  const { payer, amount, network } = req.payment!;
  const usdcAmount = formatUnits(BigInt(amount), 6);
  console.log(`[AgentPay] /decode-tx  payer=${payer}  amount=${usdcAmount} USDC  network=${network}`);
  res.json({
    txHash: txHash ?? "0x...",
    chainId: chainId ?? 5042002,
    method: "transfer(address,uint256)",
    params: { to: "0xABCD...1234", amount: "100.000000 USDC" },
    events: ["Transfer(from=0x..., to=0xABCD...1234, value=100000000)"],
    gas_used: 51_000,
    summary: "USDC transfer of 100 USDC from sender to 0xABCD...1234 on Arc Testnet. Transaction succeeded.",
    paid_by: payer,
    amount_usdc: usdcAmount,
    network,
  });
});

// $0.001 per call — USDC price oracle (GET, manual 402 gate)
app.get("/price", gate("$0.001"), (req: PaidRequest, res) => {
  res.json({
    usdc_usd: 1.0001,
    vol_30d: 0.0004,
    volume_24h: "1.42B",
    liquidity: "142.5M",
    confidence: 0.998,
    paid_by: req.payment?.payer ?? "unknown",
    amount_usdc: "0.001",
    network: "ARC-TESTNET",
    timestamp: new Date().toISOString(),
  });
});

// $0.002 per call — Crypto news feed (GET, manual 402 gate)
app.get("/news", gate("$0.002"), (req: PaidRequest, res) => {
  res.json({
    articles: [
      { title: "Circle launches Arc Testnet stablecoin API suite", sentiment: "positive", relevance_score: 0.96, published_at: new Date().toISOString() },
      { title: "x402 agent payment protocol reaches 10 000 daily calls", sentiment: "positive", relevance_score: 0.91, published_at: new Date().toISOString() },
      { title: "USDC 24h volume hits record on Arc", sentiment: "neutral", relevance_score: 0.85, published_at: new Date().toISOString() },
    ],
    fetched_at: new Date().toISOString(),
    paid_by: req.payment?.payer ?? "unknown",
    amount_usdc: "0.002",
    network: "ARC-TESTNET",
  });
});

// $0.003 per call: sentiment analysis (static sample output)
app.post("/pay/sentiment", gate("$0.003"), (req: PaidRequest, res) => {
  const { payer, amount, network } = req.payment!;
  res.json({
    polarity: 0.62, label: "positive", emotions: { fear: 0.12, greed: 0.74 }, confidence: 0.81,
    sample_data: true, paid_by: payer, amount_usdc: formatUnits(BigInt(amount), 6), network,
  });
});

// $0.002 per call: ENS resolver (static sample output)
app.post("/pay/ens", bodyShape({ query: ["string", 256] }), gate("$0.002"), (req: PaidRequest, res) => {
  const { query } = req.body as { query?: string };
  const { payer, amount, network } = req.payment!;
  res.json({
    query: query ?? "", address: null, name: null, avatar: null, records: {}, resolved_at: new Date().toISOString(),
    sample_data: true, paid_by: payer, amount_usdc: formatUnits(BigInt(amount), 6), network,
  });
});

// $0.001 per call: gas estimator (static sample output)
app.post("/pay/gas", gate("$0.001"), (req: PaidRequest, res) => {
  const { payer, amount, network } = req.payment!;
  res.json({
    gas_units: 65000, base_fee_gwei: 12.4, priority_fee_gwei: 1.5, total_eth: "0.000904", total_usd: "n/a", confidence: 0.9,
    sample_data: true, paid_by: payer, amount_usdc: formatUnits(BigInt(amount), 6), network,
  });
});

// ──────────────────────────────────────────
// Free info route
// ──────────────────────────────────────────
app.get("/info", (_req, res) => {
  res.json({
    name: "AgentPay Demo API",
    description: "Circle Gateway Nanopayments demo — gasless USDC pay-per-call",
    endpoints: [
      { path: "/pay/summarize", method: "POST", price: "$0.001", description: "Summarize text" },
      { path: "/pay/translate", method: "POST", price: "$0.005", description: "Translate text" },
      { path: "/pay/analyze",   method: "POST", price: "$0.010", description: "Analyze data"  },
    ],
    facilitator: FACILITATOR_URL,
    seller: SELLER_ADDRESS || "not configured",
  });
});

// ──────────────────────────────────────────
// Seller registry + 0.5% broker fee quotes
// ──────────────────────────────────────────
const PORT = process.env.PORT || 3001;

/** Where agents reach this server from outside. Comes from configuration only, never from a request header. */
function publicSiteUrl(): string {
  const explicit = process.env.PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NETLIFY && process.env.URL) return process.env.URL.replace(/\/$/, "");
  return `http://localhost:${PORT}`;
}
// On a serverless host the API is served under /api; on a normal server it is at the root.
const API_PREFIX = isServerless ? "/api" : "";
// ──────────────────────────────────────────
// Prepaid credit: buy any amount (price = the amount asked) while the pool lasts, then spend it by API key
// ──────────────────────────────────────────
app.get("/credits", rateLimit({ name: "credit-info", max: 120, windowMs: 60_000 }), infoHandler);
app.get("/credits/balance", rateLimit({ name: "credit-balance", max: 120, windowMs: 60_000 }), balanceHandler);
app.post(
  "/credits/buy",
  bodyShape({ amount: ["string", 32], key: ["string", 80] }),
  purchaseGuard(gate),
  (req: PaidRequest, res) => {
    const pay = req.payment;
    if (!pay?.verified) { res.status(400).json({ error: "Credit can only be bought with a real payment", code: "demo_not_allowed" }); return; }
    const existing = (req.body as { key?: string }).key;
    const out = issueCredit(BigInt(pay.amount), pay.payer, existing ? existing : undefined);
    res.json({
      api_key: out.key,
      balanceUsdc: formatUsdc(out.balance),
      note: out.key ? "Save this key now: it is shown once. Send it as 'Authorization: Bearer <key>' on any paid route." : "Added to your existing key.",
    });
  },
);

const registry = createRegistryRouter({
  demoBaseUrl: publicSiteUrl(),
  demoPath: `${API_PREFIX}/pay/summarize`,
  demoPayTo: SELLER_ADDRESS,
});
app.use("/registry", registry);
if (!isServerless) {
  registry.warm().catch(err => console.warn("[AgentPay] registry start-up failed:", err instanceof Error ? err.message : err));
}
app.use(createLedgerRouter());
app.use("/payments", createPaymentsRouter({ seller: SELLER_ADDRESS, facilitatorUrl: FACILITATOR_URL }));

// Health
app.get("/health", (_req, res) =>
  res.json({ status: "ok", storage: storeKind, sellerConfigured: Boolean(SELLER_ADDRESS), demoMode: DEMO_MODE, settlement: { ...pacer.stats(), pausedForSeconds: Math.max(0, Math.ceil((breaker.openUntil - Date.now()) / 1000)) } }),
);

app.use(notFound);
app.use(errorHandler);

// A normal server listens on a port. A serverless host calls the exported app directly.
if (!isServerless) {
  // One bad background task must not take the whole service down.
  process.on("unhandledRejection", reason => {
    console.error("[AgentPay] unhandled rejection:", reason instanceof Error ? reason.message : reason);
  });

  const server = app.listen(PORT, () => {
    console.log(`[AgentPay] server running on http://localhost:${PORT}`);
    console.log(`[AgentPay] seller=${SELLER_ADDRESS || "(not set)"}`);
  });

  // Finish in-flight payments before exiting, so a restart never cuts a settlement in half.
  const shutdown = (signal: string) => {
    console.log(`[AgentPay] ${signal} received, finishing open requests`);
    server.close(() => { flushCredits().finally(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

export default app;
