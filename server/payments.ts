/**
 * Ledger of payments this seller has really received, and where each one is in Circle's batch settlement.
 * Circle accepts a payment right away and settles many of them onchain together later, so a seller
 * needs to see "received" and "completed" as two different moments.
 */
import express from "express";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { formatUsdc } from "../src/onchain-money";
import { buildTxExplorerUrl } from "../src/onchain-facts";
import { isTerminal, type Receipt, type ReceiptsResponse, type TransferStatus } from "../src/receipts";

const DATA_DIR = new URL("./data/", import.meta.url).pathname;
const DATA_FILE = `${DATA_DIR}payments.json`;
const MAX_ENTRIES = 300;
const RECHECK_MS = 10_000;
const MAX_CHECKS_PER_REQUEST = 25;
const CHAIN_ID = 5042002; // Arc Testnet, where this seller is paid
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID: ReadonlySet<string> = new Set(["received", "batched", "confirmed", "completed", "failed"]);

interface Entry extends Omit<Receipt, "explorerUrl"> {
  checkedAt: number;
}

let ledger: Entry[] = [];

function load(): void {
  try {
    if (existsSync(DATA_FILE)) ledger = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Entry[];
  } catch {
    ledger = [];
  }
}

function save(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(ledger));
    renameSync(tmp, DATA_FILE);
  } catch (e) {
    console.warn("[AgentPay] could not save payments ledger:", (e as Error).message);
  }
}

export function recordPayment(p: { id: string; route: string; payer: string; amountAtomic: string; network: string }): void {
  if (!UUID.test(p.id) || ledger.some(e => e.id === p.id)) return;
  let amount = "0";
  try {
    amount = formatUsdc(BigInt(p.amountAtomic));
  } catch {
    // Keep the receipt even if the amount cannot be formatted.
  }
  ledger.unshift({
    id: p.id, route: p.route, payer: p.payer, amount, network: p.network,
    receivedAt: new Date().toISOString(), status: "unknown", txHash: null, completedAt: null, checkedAt: 0,
  });
  if (ledger.length > MAX_ENTRIES) ledger.length = MAX_ENTRIES;
  save();
}

async function checkOne(facilitatorUrl: string, e: Entry): Promise<void> {
  try {
    const res = await fetch(`${facilitatorUrl}/v1/x402/transfers/${encodeURIComponent(e.id)}`, {
      headers: { Accept: "application/json", "User-Agent": "agentpay/1.0" },
      signal: AbortSignal.timeout(6000),
    });
    e.checkedAt = Date.now();
    if (!res.ok) return;
    const t = (await res.json()) as { status?: string; txHash?: string | null; updatedAt?: string };
    if (t.status && VALID.has(t.status)) e.status = t.status as TransferStatus;
    if (typeof t.txHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(t.txHash)) e.txHash = t.txHash;
    if (e.status === "completed" && t.updatedAt) e.completedAt = t.updatedAt;
  } catch {
    // Circle's status endpoint is best effort: keep the last known status and try again later.
  }
}

let inFlight: Promise<void> | null = null;

/** Re-check payments that are not final yet. Concurrent requests share one round of checks. */
function refresh(facilitatorUrl: string): Promise<void> {
  inFlight ??= (async () => {
    const due = ledger.filter(e => !isTerminal(e.status) && Date.now() - e.checkedAt > RECHECK_MS).slice(0, MAX_CHECKS_PER_REQUEST);
    if (due.length === 0) return;
    await Promise.all(due.map(e => checkOne(facilitatorUrl, e)));
    save();
  })().finally(() => { inFlight = null; });
  return inFlight;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? null;
}

export function createPaymentsRouter(opts: { seller?: string; facilitatorUrl: string }) {
  load();
  const router = express.Router();

  router.get("/", async (_req, res) => {
    await refresh(opts.facilitatorUrl);

    const receipts: Receipt[] = ledger.slice(0, 50).map(e => ({
      id: e.id, route: e.route, payer: e.payer, amount: e.amount, network: e.network, receivedAt: e.receivedAt,
      status: e.status, txHash: e.txHash, completedAt: e.completedAt,
      explorerUrl: e.txHash ? buildTxExplorerUrl(CHAIN_ID, e.txHash) : null,
    }));

    const counts: ReceiptsResponse["counts"] = { received: 0, batched: 0, confirmed: 0, completed: 0, failed: 0, unknown: 0 };
    let totalAtomic = 0n;
    for (const e of ledger) {
      counts[e.status]++;
      try { totalAtomic += BigInt(Math.round(Number(e.amount) * 1e6)); } catch { /* skip an unreadable amount */ }
    }
    const lags = ledger
      .filter(e => e.status === "completed" && e.completedAt)
      .slice(0, 50)
      .map(e => (Date.parse(e.completedAt as string) - Date.parse(e.receivedAt)) / 1000)
      .filter(n => Number.isFinite(n) && n >= 0);

    const body: ReceiptsResponse = {
      seller: opts.seller ?? null,
      receipts,
      counts,
      totalUsdc: formatUsdc(totalAtomic),
      medianSecondsToComplete: median(lags),
    };
    res.json(body);
  });

  return router;
}
