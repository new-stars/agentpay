/**
 * Storage for the payment ledger: one line per settled payment, grouped by day.
 *  - Redis: counters in a hash and entries in a list per day (kept 100 days)
 *  - file:  server/data/ledger-YYYY-MM-DD.jsonl
 *  - memory: nothing is kept beyond this process (counters in ledger.ts still work)
 */
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { redisPipeline, storeKind } from "./store";

export interface LedgerEntry {
  id: string
  at: string
  route: string
  payer: string
  /** USDC in atomic units (6 decimals) */
  amount: string
  network: string
}

export interface DayTotals { count: number; atomic: bigint }

const DIR = join(process.cwd(), "server", "data");
const file = (day: string) => join(DIR, `ledger-${day}.jsonl`);
const KEEP_SECONDS = 100 * 24 * 3600;
const MAX_EXPORT = 200_000;

/** Never throws: a ledger problem must not turn a payment that already settled into an error. */
export async function appendEntry(day: string, e: LedgerEntry): Promise<void> {
  try {
    if (storeKind === "upstash") {
      const stats = `agentpay:stats:${day}`;
      const list = `agentpay:ledger:${day}`;
      await redisPipeline([
        ["HINCRBY", stats, "count", 1],
        ["HINCRBY", stats, "atomic", Number(e.amount)],
        ["RPUSH", list, JSON.stringify(e)],
        ["EXPIRE", stats, KEEP_SECONDS],
        ["EXPIRE", list, KEEP_SECONDS],
      ]);
    } else if (storeKind === "file") {
      await mkdir(DIR, { recursive: true });
      await appendFile(file(day), `${JSON.stringify(e)}\n`);
    }
  } catch (err) {
    console.warn("[Ledger] could not store an entry:", err instanceof Error ? err.message : err);
  }
}

export async function readEntries(day: string): Promise<LedgerEntry[]> {
  try {
    if (storeKind === "upstash") {
      const [rows] = await redisPipeline([["LRANGE", `agentpay:ledger:${day}`, 0, MAX_EXPORT - 1]]);
      return (Array.isArray(rows) ? rows : []).flatMap(r => {
        try { return [JSON.parse(String(r)) as LedgerEntry]; } catch { return []; }
      });
    }
    if (storeKind === "file") {
      const text = await readFile(file(day), "utf8");
      return text.split("\n").filter(Boolean).slice(0, MAX_EXPORT).flatMap(l => {
        try { return [JSON.parse(l) as LedgerEntry]; } catch { return []; }
      });
    }
  } catch {
    // No ledger for that day.
  }
  return [];
}

/** Totals for several days, used once at start-up to rebuild the counters. */
export async function readTotals(days: string[]): Promise<Record<string, DayTotals>> {
  const out: Record<string, DayTotals> = {};
  try {
    if (storeKind === "upstash") {
      const rows = await redisPipeline(days.map(d => ["HGETALL", `agentpay:stats:${d}`]));
      days.forEach((d, i) => {
        const flat = Array.isArray(rows[i]) ? (rows[i] as string[]) : [];
        const h: Record<string, string> = {};
        for (let k = 0; k + 1 < flat.length; k += 2) h[flat[k]] = flat[k + 1];
        if (h.count) out[d] = { count: Number(h.count), atomic: BigInt(Math.round(Number(h.atomic ?? 0))) };
      });
    } else if (storeKind === "file") {
      for (const d of days) {
        const entries = await readEntries(d);
        if (entries.length > 0) out[d] = { count: entries.length, atomic: entries.reduce((a, e) => a + BigInt(e.amount), 0n) };
      }
    }
  } catch {
    // Start from zero if the history cannot be read.
  }
  return out;
}
