/**
 * Payment ledger: every settled payment is written down with its Circle settlement id, so the seller can
 * reconcile against Circle's batches and see daily totals. At tens of thousands of payments a day the lists Circle
 * returns (newest 50 per stage) are not enough, so this is the seller's own record.
 */
import express from "express";
import { formatUsdc } from "../src/onchain-money";
import { adminOnly } from "./security";
import { rateLimit } from "./ratelimit";
import { appendEntry, readEntries, readTotals, type DayTotals, type LedgerEntry } from "./ledger-store";

export type { LedgerEntry } from "./ledger-store";

const totals = new Map<string, DayTotals>();
let ready: Promise<void> | undefined;

const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const lastDays = (n: number) => Array.from({ length: n }, (_, i) => dayOf(new Date(Date.now() - i * 86_400_000)));

/** Rebuild the counters for the last week from storage, once per process. */
function init(): Promise<void> {
  ready ??= (async () => {
    const past = await readTotals(lastDays(7));
    for (const [day, t] of Object.entries(past)) totals.set(day, t);
  })();
  return ready;
}

export async function recordLedger(entry: LedgerEntry): Promise<void> {
  await init();
  const day = entry.at.slice(0, 10);
  const t = totals.get(day) ?? { count: 0, atomic: 0n };
  t.count += 1;
  t.atomic += BigInt(entry.amount);
  totals.set(day, t);
  await appendEntry(day, entry);
}

export interface DayStats { day: string; count: number; volumeUsdc: string }

const asStats = (day: string): DayStats => {
  const t = totals.get(day) ?? { count: 0, atomic: 0n };
  return { day, count: t.count, volumeUsdc: formatUsdc(t.atomic) };
};

export async function recentStats(days = 7): Promise<DayStats[]> {
  await init();
  return lastDays(days).map(asStats);
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function createLedgerRouter() {
  const router = express.Router();

  router.get("/stats", rateLimit({ name: "stats", max: 60, windowMs: 60_000 }), async (_req, res) => {
    res.json({ days: await recentStats(7) });
  });

  // Operator export for reconciliation. Disabled until ADMIN_TOKEN is set.
  router.get(
    "/admin/ledger",
    rateLimit({ name: "ledger-export", max: 10, windowMs: 60_000 }),
    adminOnly,
    async (req, res) => {
      const asked = req.query.day;
      if (asked !== undefined && !(typeof asked === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asked))) {
        res.status(400).json({ error: "day must look like 2026-11-12", code: "bad_day" });
        return;
      }
      const day = typeof asked === "string" ? asked : dayOf(new Date());
      const rows = await readEntries(day);
      if (req.query.format === "csv") {
        res.type("text/csv").send(
          ["id,at,route,payer,amount_usdc,network", ...rows.map(r =>
            [r.id, r.at, r.route, r.payer, formatUsdc(BigInt(r.amount)), r.network].map(csvCell).join(","))].join("\n"),
        );
        return;
      }
      res.json({ day, count: rows.length, entries: rows });
    },
  );

  return router;
}
