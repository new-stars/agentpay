import express from "express";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { withQuote, BROKER_FEE_BPS, type Listing, type ListingStatus } from "../src/registry";

const DATA_DIR = new URL("./data/", import.meta.url).pathname;
const DATA_FILE = `${DATA_DIR}registry.json`;
const MAX_LISTINGS = 200;
const CATEGORIES = ["NLP", "Data", "DeFi", "Compliance", "Dev Tools", "Other"];
const PROBE_TIMEOUT_MS = 5_000;
const RECHECK_MIN_INTERVAL_MS = 10_000;

// ──────────────────────────────────────────
// Storage (JSON file, atomic write)
// ──────────────────────────────────────────
let listings: Listing[] = [];
/** Listings the operator seeded themselves (may point at localhost). Never user-submittable. */
const trusted = new Set<string>();

function load() {
  try {
    if (existsSync(DATA_FILE)) listings = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Listing[];
  } catch (err) {
    console.warn("[Registry] could not read registry.json, starting empty:", err);
    listings = [];
  }
}
function save() {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(listings, null, 2));
  renameSync(tmp, DATA_FILE);
}

// ──────────────────────────────────────────
// SSRF guard: sellers submit URLs the server will call
// ──────────────────────────────────────────
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

async function assertPublicHost(hostname: string) {
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Private or loopback addresses are not allowed");
    return;
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (addrs.length === 0 || addrs.some(a => isPrivateIp(a.address))) {
    throw new Error("Host resolves to a private or loopback address");
  }
}

async function probe(l: Listing): Promise<ListingStatus> {
  try {
    const url = new URL(l.path, l.baseUrl);
    if (!trusted.has(l.id)) await assertPublicHost(url.hostname);
    const res = await fetch(url, {
      method: l.method,
      redirect: "manual", // never follow redirects into internal hosts
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: l.method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: l.method === "POST" ? "{}" : undefined,
    });
    // A paid endpoint with no payment attached must answer 402.
    return res.status === 402 ? "healthy" : "unreachable";
  } catch {
    return "unreachable";
  }
}

// ──────────────────────────────────────────
// Validation
// ──────────────────────────────────────────
interface Submission {
  name?: unknown; description?: unknown; category?: unknown; baseUrl?: unknown;
  path?: unknown; method?: unknown; price?: unknown; payTo?: unknown;
}

function validate(b: Submission): { ok: true; value: Omit<Listing, "id" | "status" | "lastCheckedAt" | "createdAt"> } | { ok: false; error: string } {
  const str = (v: unknown, min: number, max: number) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
  if (!str(b.name, 3, 60)) return { ok: false, error: "name must be 3-60 characters" };
  if (!str(b.description, 0, 300)) return { ok: false, error: "description must be at most 300 characters" };
  if (typeof b.category !== "string" || !CATEGORIES.includes(b.category)) return { ok: false, error: `category must be one of: ${CATEGORIES.join(", ")}` };
  if (b.method !== "GET" && b.method !== "POST") return { ok: false, error: "method must be GET or POST" };
  if (typeof b.path !== "string" || !/^\/[A-Za-z0-9._~\-/]{0,99}$/.test(b.path)) return { ok: false, error: "path must start with / and use URL-safe characters" };
  if (typeof b.price !== "string" || !/^\d{1,4}(\.\d{1,6})?$/.test(b.price) || Number(b.price) <= 0) return { ok: false, error: "price must be a positive USDC amount with up to 6 decimals" };
  if (typeof b.payTo !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(b.payTo) || /^0x0{40}$/.test(b.payTo)) return { ok: false, error: "payTo must be a valid, non-zero EVM address" };
  let base: URL;
  try { base = new URL(String(b.baseUrl)); } catch { return { ok: false, error: "baseUrl must be a valid URL" }; }
  if (base.protocol !== "https:" || base.port !== "" || base.username || base.password) return { ok: false, error: "baseUrl must be https on the default port, without credentials" };
  return {
    ok: true,
    value: {
      name: String(b.name).trim(), description: String(b.description ?? "").trim(), category: b.category,
      baseUrl: base.origin, path: b.path, method: b.method, price: b.price, payTo: b.payTo,
    },
  };
}

// ──────────────────────────────────────────
// Router
// ──────────────────────────────────────────
export function createRegistryRouter(opts: { demoBaseUrl: string; demoPayTo?: string }) {
  load();
  if (!listings.some(l => l.id === "demo-summarizer")) {
    // The operator's own endpoint, so the catalog is never empty. Not a third-party seller.
    listings.push({
      id: "demo-summarizer", name: "AgentPay Demo: Text Summarizer", description: "Operator-hosted demo endpoint on this server.",
      category: "NLP", baseUrl: opts.demoBaseUrl, path: "/pay/summarize", method: "POST", price: "0.001",
      payTo: opts.demoPayTo ?? "not configured", status: "pending", lastCheckedAt: null, createdAt: new Date().toISOString(),
    });
  }
  trusted.add("demo-summarizer");
  void Promise.all(listings.map(async l => { l.status = await probe(l); l.lastCheckedAt = new Date().toISOString(); })).then(save);

  const router = express.Router();

  // Machine-readable catalog. Agents call this to discover supply.
  router.get("/", (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.toLowerCase() : "";
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const out = listings
      .filter(l => (!category || l.category === category) && (!status || l.status === status))
      .filter(l => !q || `${l.name} ${l.description} ${l.category}`.toLowerCase().includes(q))
      .map(withQuote);
    res.json({ broker_fee_bps: Number(BROKER_FEE_BPS), count: out.length, listings: out });
  });

  // Cheapest healthy listing in a category under a budget (buyer price, fee included).
  router.get("/select", (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : "";
    const maxPrice = typeof req.query.maxPrice === "string" ? Number(req.query.maxPrice) : Infinity;
    const candidates = listings
      .filter(l => l.status === "healthy" && (!category || l.category === category))
      .map(withQuote)
      .filter(l => Number(l.buyerPrice) <= maxPrice)
      .sort((a, b) => Number(a.buyerPrice) - Number(b.buyerPrice));
    if (candidates.length === 0) { res.status(404).json({ error: "No healthy listing matches" }); return; }
    res.json({ best: candidates[0], alternatives: candidates.slice(1, 4) });
  });

  router.post("/", async (req, res) => {
    if (listings.length >= MAX_LISTINGS) { res.status(429).json({ error: "Registry is full" }); return; }
    const v = validate((req.body ?? {}) as Submission);
    if (!v.ok) { res.status(400).json({ error: v.error }); return; }
    try {
      await assertPublicHost(new URL(v.value.baseUrl).hostname);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Host could not be verified as public" });
      return;
    }
    if (listings.some(l => l.baseUrl === v.value.baseUrl && l.path === v.value.path && l.method === v.value.method)) {
      res.status(409).json({ error: "This endpoint is already listed" }); return;
    }
    const listing: Listing = { ...v.value, id: randomUUID(), status: "pending", lastCheckedAt: null, createdAt: new Date().toISOString() };
    listing.status = await probe(listing);
    listing.lastCheckedAt = new Date().toISOString();
    listings.push(listing);
    save();
    res.status(201).json(withQuote(listing));
  });

  router.post("/:id/check", async (req, res) => {
    const l = listings.find(x => x.id === req.params.id);
    if (!l) { res.status(404).json({ error: "Not found" }); return; }
    if (l.lastCheckedAt && Date.now() - Date.parse(l.lastCheckedAt) < RECHECK_MIN_INTERVAL_MS) {
      res.status(429).json({ error: "Checked recently, try again in a few seconds" }); return;
    }
    l.status = await probe(l);
    l.lastCheckedAt = new Date().toISOString();
    save();
    res.json(withQuote(l));
  });

  return router;
}
