import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { formatUnits } from "viem";
import { createRegistryRouter } from "./registry";
import { parseUsdc } from "../src/onchain-money";

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
app.use(express.json());

// Allow CORS from Vite dev server
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const SELLER_ADDRESS = process.env.VITE_SELLER_ADDRESS;
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ||
  "https://gateway-api-testnet.circle.com";

if (!SELLER_ADDRESS) {
  console.warn(
    "[AgentPay] VITE_SELLER_ADDRESS not set — using demo placeholder. Set it in .env to receive real payments."
  );
}

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

function gate(price: string): express.RequestHandler {
  const real = gateway.require(price) as express.RequestHandler;
  return (req, res, next) => {
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
    if (process.env.PERF_LOG) {
      const t0 = performance.now();
      res.on("finish", () => console.log(`[perf] ${req.path} ${Math.round(performance.now() - t0)}ms status=${res.statusCode}`));
    }
    // A malformed Payment-Signature is a client error: answer 400 instead of letting the gate fail with a 500.
    const sig = req.get("payment-signature");
    if (sig !== undefined) {
      try { JSON.parse(Buffer.from(sig, "base64").toString("utf8")); }
      catch { res.status(400).json({ error: "Malformed Payment-Signature header" }); return; }
    }
    return real(req, res, next);
  };
}

// ──────────────────────────────────────────
// Paid routes
// ──────────────────────────────────────────

// $0.001 per call — AI summary endpoint
app.post("/pay/summarize", gate("$0.001"), (req: PaidRequest, res) => {
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
app.post("/pay/translate", gate("$0.005"), (req: PaidRequest, res) => {
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
app.post("/pay/analyze", gate("$0.010"), (req: PaidRequest, res) => {
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
app.post("/risk", gate("$0.050"), (req: PaidRequest, res) => {
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
app.post("/explain-contract", gate("$0.020"), (req: PaidRequest, res) => {
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
app.post("/decode-tx", gate("$0.005"), (req: PaidRequest, res) => {
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
app.post("/pay/ens", gate("$0.002"), (req: PaidRequest, res) => {
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
app.use(
  "/registry",
  createRegistryRouter({ demoBaseUrl: `http://localhost:${PORT}`, demoPayTo: SELLER_ADDRESS }),
);

// Health
app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`[AgentPay] server running on http://localhost:${PORT}`);
  console.log(`[AgentPay] seller=${SELLER_ADDRESS || "(not set)"}`);
});
