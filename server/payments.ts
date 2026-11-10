/**
 * Payments received by the seller, read straight from Circle's public transfers endpoint.
 * Nothing about the payments themselves is stored here, so this works the same on a normal server and on
 * a serverless host, and survives restarts. The only thing kept locally is which route each payment paid for
 * (Circle does not know that), and losing it just hides the route label.
 */
import express from "express";
import { formatUsdc } from "../src/onchain-money";
import { getChain, buildTxExplorerUrl } from "../src/onchain-facts";
import { isTerminal, STAGES, type Receipt, type ReceiptsResponse, type TransferStatus } from "../src/receipts";
import { loadJson, saveJson } from "./store";

const ALL_STATUSES: TransferStatus[] = [...STAGES, "failed"];
const PAGE = 50;
const CACHE_MS = 5_000;
const MAX_ROUTES = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface CircleTransfer {
  id: string;
  status: string;
  fromAddress: string;
  amount: string;
  sendingNetwork: string;
  txHash?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── route labels (best effort) ──────────────────────────────
let routes = new Map<string, string>();
let routesLoaded = false;

async function loadRoutes() {
  if (routesLoaded) return;
  routesLoaded = true;
  const saved = await loadJson<Array<[string, string]>>("payment-routes");
  if (saved) routes = new Map([...saved, ...routes]);
}

/** Remember which route a settled payment paid for. Called once per successful paid request. */
export function recordRoute(entry: { id: string; route: string }): void {
  if (!UUID.test(entry.id)) return;
  routes.set(entry.id, entry.route.slice(0, 80));
  while (routes.size > MAX_ROUTES) routes.delete(routes.keys().next().value as string);
  void saveJson("payment-routes", [...routes]);
}

// ── Circle ──────────────────────────────────────────────────
async function fetchByStatus(base: string, seller: string, network: string, status: TransferStatus): Promise<CircleTransfer[]> {
  const qs = new URLSearchParams({ to: seller, network, status, pageSize: String(PAGE) });
  const res = await fetch(`${base}/v1/x402/transfers?${qs}`, {
    headers: { Accept: "application/json", "User-Agent": "agentpay/1.0" },
    signal: AbortSignal.timeout(6_000),
  });
  if (!res.ok) throw new Error(`Circle transfers HTTP ${res.status}`);
  return ((await res.json()) as { transfers?: CircleTransfer[] }).transfers ?? [];
}

const emptyCounts = (): ReceiptsResponse["counts"] => ({ received: 0, batched: 0, confirmed: 0, completed: 0, failed: 0, unknown: 0 });

function toReceipt(t: CircleTransfer, explorerChainId: number | null): Receipt | null {
  if (!/^\d{1,18}$/.test(t.amount) || typeof t.id !== "string") return null;
  const status = (ALL_STATUSES as string[]).includes(t.status) ? (t.status as TransferStatus) : "unknown";
  const txHash = typeof t.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(t.txHash) ? t.txHash : null;
  return {
    id: t.id,
    route: routes.get(t.id) ?? "",
    payer: t.fromAddress,
    amount: formatUsdc(BigInt(t.amount)),
    network: t.sendingNetwork,
    receivedAt: t.createdAt,
    status,
    txHash,
    completedAt: status === "completed" ? t.updatedAt : null,
    explorerUrl: txHash && explorerChainId ? buildTxExplorerUrl(explorerChainId, txHash) : null,
  };
}

export function createPaymentsRouter(opts: { seller?: string; facilitatorUrl: string }) {
  const router = express.Router();
  const network = process.env.PAYMENTS_NETWORK ?? "eip155:5042002";
  const chainId = Number(network.split(":")[1]);
  const explorerChainId = Number.isInteger(chainId) && getChain(chainId) ? chainId : null;
  let cache: { at: number; body: ReceiptsResponse } | undefined;

  router.get("/", async (_req, res) => {
    const seller = opts.seller;
    if (!seller) {
      res.json({ seller: null, receipts: [], counts: emptyCounts(), totalUsdc: "0", medianSecondsToComplete: null, truncated: false } satisfies ReceiptsResponse);
      return;
    }
    if (cache && Date.now() - cache.at < CACHE_MS) { res.json(cache.body); return; }

    await loadRoutes();
    const settled = await Promise.allSettled(ALL_STATUSES.map(s => fetchByStatus(opts.facilitatorUrl, seller, network, s)));
    if (settled.every(r => r.status === "rejected")) {
      if (cache) { res.json(cache.body); return; } // stale is better than nothing
      res.status(502).json({ error: "Circle is unavailable", code: "payments" });
      return;
    }
    const all: Receipt[] = [];
    let truncated = false;
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      if (r.value.length >= PAGE) truncated = true;
      for (const t of r.value) {
        const receipt = toReceipt(t, explorerChainId);
        if (receipt) all.push(receipt);
      }
    }
    all.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));

    const counts = emptyCounts();
    let totalAtomic = 0n;
    const lags: number[] = [];
    for (const r of all) {
      counts[r.status]++;
      totalAtomic += BigInt(Math.round(Number(r.amount) * 1e6));
      if (r.completedAt) lags.push((Date.parse(r.completedAt) - Date.parse(r.receivedAt)) / 1000);
    }
    lags.sort((a, b) => a - b);

    const body: ReceiptsResponse = {
      seller,
      receipts: all.slice(0, PAGE),
      counts,
      totalUsdc: formatUsdc(totalAtomic),
      medianSecondsToComplete: lags.length ? Math.round(lags[Math.floor(lags.length / 2)] as number) : null,
      truncated,
    };
    cache = { at: Date.now(), body };
    res.json(body);
  });

  return router;
}

export { isTerminal };
