import express from "express";
import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { withQuote, BROKER_FEE_BPS, type Listing, type ListingStatus } from "../src/registry";
import { formatUsdc } from "../src/onchain-money";

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

function validate(b: Submission): { ok: true; value: Omit<Listing, "id" | "status" | "lastCheckedAt" | "createdAt"> } | { ok: false; error: string; code: string } {
  const str = (v: unknown, min: number, max: number) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
  if (!str(b.name, 3, 60)) return { ok: false, error: "name must be 3-60 characters", code: "name" };
  if (!str(b.description, 0, 300)) return { ok: false, error: "description must be at most 300 characters", code: "description" };
  if (typeof b.category !== "string" || !CATEGORIES.includes(b.category)) return { ok: false, error: `category must be one of: ${CATEGORIES.join(", ")}`, code: "category" };
  if (b.method !== "GET" && b.method !== "POST") return { ok: false, error: "method must be GET or POST", code: "method" };
  if (typeof b.path !== "string" || !/^\/[A-Za-z0-9._~\-/]{0,99}$/.test(b.path)) return { ok: false, error: "path must start with / and use URL-safe characters", code: "path" };
  if (typeof b.price !== "string" || !/^\d{1,4}(\.\d{1,6})?$/.test(b.price) || Number(b.price) <= 0) return { ok: false, error: "price must be a positive USDC amount with up to 6 decimals", code: "price" };
  if (typeof b.payTo !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(b.payTo) || /^0x0{40}$/.test(b.payTo)) return { ok: false, error: "payTo must be a valid, non-zero EVM address", code: "payTo" };
  let base: URL;
  try { base = new URL(String(b.baseUrl)); } catch { return { ok: false, error: "baseUrl must be a valid URL", code: "baseUrl" }; }
  if (base.protocol !== "https:" || base.port !== "" || base.username || base.password) return { ok: false, error: "baseUrl must be https on the default port, without credentials", code: "baseUrl" };
  return {
    ok: true,
    value: {
      name: String(b.name).trim(), description: String(b.description ?? "").trim(), category: b.category,
      baseUrl: base.origin, path: b.path, method: b.method, price: b.price, payTo: b.payTo,
    },
  };
}

// ──────────────────────────────────────────
// Circle discovery mapping. All upstream fields are untrusted text.
// ──────────────────────────────────────────
const DISCOVERY_URL = "https://api.circle.com/v2/x402/discovery/resources";
const DISCOVERY_CATEGORIES = ["SOCIAL_INTELLIGENCE", "FINANCIAL_ANALYSIS", "WEB_SEARCH_RESEARCH", "PREDICTION_MARKETS", "CREATIVE", "INFRASTRUCTURE"];
const DISCOVERY_TTL_MS = 60_000;
const discoveryCache = new Map<string, { at: number; body: unknown }>();
const USDC_NAMES = new Set(["USD Coin", "USDC", "GatewayWalletBatched"]);

const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";

interface RawAccept { amount?: unknown; network?: unknown; extra?: { name?: unknown } }
interface RawItem { resource?: unknown; accepts?: RawAccept[]; metadata?: { provider?: { name?: unknown; category?: unknown }; method?: unknown; description?: unknown; supportsCircleGateway?: unknown } }

function mapDiscovery(raw: unknown) {
  const r = raw as { items?: RawItem[]; pagination?: { total?: unknown } };
  const items = Array.isArray(r.items) ? r.items : [];
  const out = items.flatMap(it => {
    const resource = clean(it.resource, 300);
    if (!resource.startsWith("https://")) return [];
    // Cheapest USDC-denominated option, in atomic units (6 decimals).
    let cheapest: bigint | null = null;
    for (const a of it.accepts ?? []) {
      const name = typeof a.extra?.name === "string" ? a.extra.name : "";
      if (!USDC_NAMES.has(name) || typeof a.amount !== "string" || !/^\d{1,18}$/.test(a.amount)) continue;
      const v = BigInt(a.amount);
      if (cheapest === null || v < cheapest) cheapest = v;
    }
    const m = it.metadata ?? {};
    return [{
      resource,
      provider: clean(m.provider?.name, 80),
      description: clean(m.description, 240),
      category: clean(m.provider?.category, 40),
      method: m.method === "POST" ? "POST" : "GET",
      priceUsdc: cheapest === null ? null : formatUsdc(cheapest),
      gateway: m.supportsCircleGateway === true,
    }];
  });
  const total = Number(r.pagination?.total);
  return { items: out, total: Number.isFinite(total) ? total : out.length };
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
    if (candidates.length === 0) { res.status(404).json({ error: "No healthy listing matches", code: "none" }); return; }
    res.json({ best: candidates[0], alternatives: candidates.slice(1, 4) });
  });

  router.post("/", async (req, res) => {
    if (listings.length >= MAX_LISTINGS) { res.status(429).json({ error: "Registry is full", code: "full" }); return; }
    const v = validate((req.body ?? {}) as Submission);
    if (!v.ok) { res.status(400).json({ error: v.error, code: v.code }); return; }
    try {
      await assertPublicHost(new URL(v.value.baseUrl).hostname);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Host could not be verified as public", code: "private_host" });
      return;
    }
    if (listings.some(l => l.baseUrl === v.value.baseUrl && l.path === v.value.path && l.method === v.value.method)) {
      res.status(409).json({ error: "This endpoint is already listed", code: "duplicate" }); return;
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
    if (!l) { res.status(404).json({ error: "Not found", code: "not_found" }); return; }
    if (l.lastCheckedAt && Date.now() - Date.parse(l.lastCheckedAt) < RECHECK_MIN_INTERVAL_MS) {
      res.status(429).json({ error: "Checked recently, try again in a few seconds", code: "rate" }); return;
    }
    l.status = await probe(l);
    l.lastCheckedAt = new Date().toISOString();
    save();
    res.json(withQuote(l));
  });

  // ── Read-only proxy for Circle's public Agent Marketplace discovery (no API key needed) ──
  router.get("/discover", async (req, res) => {
    const qs = new URLSearchParams({ type: "http", limit: "12" });
    const q = typeof req.query.q === "string" ? req.query.q.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 64) : "";
    if (q) qs.set("query", q);
    const category = typeof req.query.category === "string" ? req.query.category : "";
    if (DISCOVERY_CATEGORIES.includes(category)) qs.set("category", category);
    const offset = Number(req.query.offset);
    if (Number.isInteger(offset) && offset >= 0 && offset <= 5000) qs.set("offset", String(offset));

    const key = qs.toString();
    const hit = discoveryCache.get(key);
    if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) { res.json(hit.body); return; }
    try {
      const upstream = await fetch(`${DISCOVERY_URL}?${key}`, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
      if (!upstream.ok) { res.status(502).json({ error: "Discovery unavailable", code: "discovery" }); return; }
      const body = mapDiscovery(await upstream.json());
      discoveryCache.set(key, { at: Date.now(), body });
      res.json(body);
    } catch {
      res.status(502).json({ error: "Discovery unavailable", code: "discovery" });
    }
  });

  return router;
}
