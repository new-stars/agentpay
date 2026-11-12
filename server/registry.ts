import express from "express";
import { promises as dns, lookup as dnsLookup } from "node:dns";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { randomUUID } from "node:crypto";
import { withQuote, BROKER_FEE_BPS, type Listing, type ListingStatus } from "../src/registry";
import { formatUsdc, parseUsdc } from "../src/onchain-money";
import { isServerless, loadJson, saveJson } from "./store";
import { rateLimit } from "./ratelimit";
import { adminOnly, sameOriginOnly } from "./security";

const MAX_LISTINGS = 200;
const CATEGORIES = ["NLP", "Data", "DeFi", "Compliance", "Dev Tools", "Other"];
const PROBE_TIMEOUT_MS = 5_000;
const RECHECK_MIN_INTERVAL_MS = 10_000;
const STALE_AFTER_MS = 10 * 60_000;
const SWEEP_EVERY_MS = 5 * 60_000;
const MAX_PER_PAYOUT = 5;
const MAX_PROBE_BYTES = 64 * 1024;
const PROBE_DEADLINE_MS = 8_000;

// Abuse limits. Per visitor unless marked global.
const submitPerIp = rateLimit({ name: "reg-submit", max: 5, windowMs: 3_600_000 });
const submitGlobal = rateLimit({ name: "reg-submit", max: 100, windowMs: 3_600_000, global: true });
const checkPerIp = rateLimit({ name: "reg-check", max: 20, windowMs: 60_000 });
const readPerIp = rateLimit({ name: "reg-read", max: 120, windowMs: 60_000 });
const discoverPerIp = rateLimit({ name: "reg-discover", max: 30, windowMs: 60_000 });
const discoverGlobal = rateLimit({ name: "reg-discover", max: 600, windowMs: 60_000, global: true });
const adminPerIp = rateLimit({ name: "reg-admin", max: 10, windowMs: 60_000 });

/** Remove control characters and the bidirectional overrides that can make text display as something it is not. */
const stripUnsafe = (v: string) => v.replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ");

// Storage (see ./store.ts: file, Redis over HTTPS, or memory)
// ──────────────────────────────────────────
let listings: Listing[] = [];
/** Listings the operator seeded themselves (may point at localhost). Never user-submittable. */
const trusted = new Set<string>();

const save = (): Promise<void> => saveJson("registry", listings);

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

/**
 * Resolve a name and refuse private answers at connection time. Checking once and connecting later would let
 * a hostile DNS server answer "public" first and "10.0.0.1" second (DNS rebinding); here the address that is
 * checked is the address that is used.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, options.all ? [] : "", 0);
      return;
    }
    if (addresses.length === 0 || addresses.some(a => isPrivateIp(a.address))) {
      callback(new Error("Host resolves to a private or loopback address"), options.all ? [] : "", 0);
      return;
    }
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
};

interface ProbeReply { status: number; paymentRequired?: string; body: string }

/** One bounded request to a seller-supplied URL: https only, no redirects, size and time capped, public addresses only. */
function safeRequest(url: URL, method: "GET" | "POST"): Promise<ProbeReply> {
  return new Promise((resolve, reject) => {
    if (url.protocol !== "https:") { reject(new Error("https only")); return; }
    if (isIP(url.hostname) && isPrivateIp(url.hostname)) { reject(new Error("private address")); return; }
    const payload = method === "POST" ? "{}" : undefined;
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; clearTimeout(deadline); fn(); } };
    const req = https.request(url, {
      method,
      lookup: publicOnlyLookup,
      timeout: PROBE_TIMEOUT_MS,
      headers: {
        accept: "application/json",
        "user-agent": "agentpay-health/1.0",
        ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
      },
    }, res => {
      const chunks: Buffer[] = [];
      let size = 0;
      const reply = (): ProbeReply => {
        const h = res.headers["payment-required"];
        return {
          status: res.statusCode ?? 0,
          paymentRequired: Array.isArray(h) ? h[0] : h,
          body: Buffer.concat(chunks).toString("utf8"),
        };
      };
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_PROBE_BYTES) { finish(() => resolve(reply())); req.destroy(); return; }
        chunks.push(c);
      });
      res.on("end", () => finish(() => resolve(reply())));
      res.on("error", e => finish(() => reject(e)));
    });
    const deadline = setTimeout(() => req.destroy(new Error("deadline")), PROBE_DEADLINE_MS);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", e => finish(() => reject(e)));
    if (payload) req.write(payload);
    req.end();
  });
}

/** The operator's own endpoint (may be http on localhost). Only ever used for trusted listings. */
async function trustedRequest(url: URL, method: "GET" | "POST"): Promise<ProbeReply> {
  const res = await fetch(url, {
    method,
    redirect: "manual",
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    body: method === "POST" ? "{}" : undefined,
  });
  return { status: res.status, paymentRequired: res.headers.get("payment-required") ?? undefined, body: (await res.text()).slice(0, MAX_PROBE_BYTES) };
}

interface Requirement { payTo: string; amount: string }

/** What the seller says it will charge: x402 v2 sends it in a header, v1 in the body. */
function readRequirements(reply: ProbeReply): Requirement[] {
  const out: Requirement[] = [];
  const add = (a: unknown) => {
    const o = (a ?? {}) as { payTo?: unknown; amount?: unknown; maxAmountRequired?: unknown };
    const amount = typeof o.amount === "string" ? o.amount : typeof o.maxAmountRequired === "string" ? o.maxAmountRequired : undefined;
    if (typeof o.payTo === "string" && amount && /^\d{1,30}$/.test(amount)) out.push({ payTo: o.payTo.toLowerCase(), amount });
  };
  const fromJson = (text: string) => {
    try {
      const j = JSON.parse(text) as { accepts?: unknown };
      if (Array.isArray(j.accepts)) j.accepts.slice(0, 50).forEach(add);
    } catch {
      // Not JSON: no requirements found here.
    }
  };
  if (reply.paymentRequired) fromJson(Buffer.from(reply.paymentRequired, "base64").toString("utf8"));
  if (out.length === 0) fromJson(reply.body);
  return out;
}

export type RejectReason = "unreachable" | "not_402" | "no_requirements" | "payto_mismatch" | "price_mismatch";

/**
 * A listing is healthy only if the endpoint demands payment AND asks for the payout address and price the
 * listing advertises. Otherwise a seller could list a cheap price and charge more, or name one address and
 * collect at another.
 */
async function inspect(l: Listing): Promise<{ ok: true } | { ok: false; reason: RejectReason }> {
  let reply: ProbeReply;
  try {
    const url = new URL(l.path, l.baseUrl);
    reply = trusted.has(l.id) ? await trustedRequest(url, l.method) : await safeRequest(url, l.method);
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (reply.status !== 402) return { ok: false, reason: "not_402" };
  const reqs = readRequirements(reply);
  if (reqs.length === 0) return { ok: false, reason: "no_requirements" };
  const forUs = reqs.filter(q => q.payTo === l.payTo.toLowerCase());
  if (forUs.length === 0) return { ok: false, reason: "payto_mismatch" };
  if (!forUs.some(q => q.amount === parseUsdc(l.price).toString())) return { ok: false, reason: "price_mismatch" };
  return { ok: true };
}

async function probe(l: Listing): Promise<ListingStatus> {
  return (await inspect(l)).ok ? "healthy" : "unreachable";
}

// ──────────────────────────────────────────
// Validation
// ──────────────────────────────────────────
interface Submission {
  name?: unknown; description?: unknown; category?: unknown; baseUrl?: unknown;
  path?: unknown; method?: unknown; price?: unknown; payTo?: unknown;
}

function validate(b: Submission): { ok: true; value: Omit<Listing, "id" | "status" | "lastCheckedAt" | "createdAt"> } | { ok: false; error: string; code: string } {
  const cleaned = (v: unknown) => (typeof v === "string" ? stripUnsafe(v).replace(/\s+/g, " ").trim() : "");
  const str = (v: unknown, min: number, max: number) => typeof v === "string" && cleaned(v).length >= min && cleaned(v).length <= max;
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
  // A real public name: no IP literals, no single-label or internal-looking hosts.
  const host = base.hostname;
  if (isIP(host) || !host.includes(".") || /\.(local|localhost|internal|lan|home|corp|intranet)$/i.test(host)) return { ok: false, error: "baseUrl must be a public domain name", code: "baseUrl" };
  return {
    ok: true,
    value: {
      name: cleaned(b.name), description: cleaned(b.description), category: b.category,
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
  typeof v === "string" ? stripUnsafe(v).trim().slice(0, max) : "";

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
export function createRegistryRouter(opts: { demoBaseUrl: string; demoPath: string; demoPayTo?: string }) {
  let ready: Promise<void> | undefined;

  /** Runs once per server or serverless instance: load saved listings, then (re)seed the operator's own one. */
  const init = (): Promise<void> => {
    ready ??= (async () => {
      listings = (await loadJson<Listing[]>("registry")) ?? [];
      // The operator's own endpoint, so the catalog is never empty. Not a third-party seller.
      // Re-synced on every start: the payout address and URL come from the current config, not from a saved copy.
      // The URL comes from trusted configuration only, never from a request header.
      const existing = listings.find(l => l.id === "demo-summarizer");
      if (existing) {
        existing.payTo = opts.demoPayTo ?? "not configured";
        existing.baseUrl = opts.demoBaseUrl;
        existing.path = opts.demoPath;
      } else {
        listings.push({
          id: "demo-summarizer", name: "AgentPay Demo: Text Summarizer", description: "Operator-hosted demo endpoint on this server.",
          category: "NLP", baseUrl: opts.demoBaseUrl, path: opts.demoPath, method: "POST", price: "0.001",
          payTo: opts.demoPayTo ?? "not configured", status: "pending", lastCheckedAt: null, createdAt: new Date().toISOString(),
        });
      }
      trusted.add("demo-summarizer");
      await refreshStale(isServerless ? 5 : MAX_LISTINGS);
      // A normal server has no request-time re-checks, so look again every few minutes. This is what catches a
      // seller who changes the price or payout address after being listed.
      if (!isServerless) {
        setInterval(() => {
          refreshStale(25).catch(err => console.warn("[Registry] periodic check failed:", err instanceof Error ? err.message : err));
        }, SWEEP_EVERY_MS).unref();
      }
    })();
    return ready;
  };

  /** Health-check listings nobody has looked at for a while. Bounded, so one request never fans out far. */
  async function refreshStale(max: number): Promise<void> {
    const now = Date.now();
    const due = listings
      .filter(l => !l.lastCheckedAt || now - Date.parse(l.lastCheckedAt) > STALE_AFTER_MS)
      .slice(0, max);
    if (due.length === 0) return;
    await Promise.all(due.map(async l => {
      // On a serverless host the operator's own endpoint is this very function: do not call ourselves over HTTP.
      l.status = isServerless && l.id === "demo-summarizer"
        ? (opts.demoPayTo ? "healthy" : "unreachable")
        : await probe(l);
      l.lastCheckedAt = new Date().toISOString();
    }));
    await save();
  }

  const router = express.Router();

  router.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/discover")) readPerIp(req, res, next);
    else next();
  });

  router.use((req, _res, next) => {
    const work = req.path.startsWith("/discover")
      ? init()
      : init().then(() => (req.method === "GET" && isServerless ? refreshStale(5) : undefined));
    work.then(() => next(), next);
  });

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

  router.post("/", sameOriginOnly, submitPerIp, submitGlobal, async (req, res) => {
    if (listings.length >= MAX_LISTINGS) { res.status(429).json({ error: "Registry is full", code: "full" }); return; }
    const v = validate((req.body ?? {}) as Submission);
    if (!v.ok) { res.status(400).json({ error: v.error, code: v.code }); return; }
    try {
      await assertPublicHost(new URL(v.value.baseUrl).hostname);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Host could not be verified as public", code: "private_host" });
      return;
    }
    const sameEndpoint = (l: Listing) => l.baseUrl === v.value.baseUrl && l.path === v.value.path && l.method === v.value.method;
    if (listings.some(sameEndpoint)) { res.status(409).json({ error: "This endpoint is already listed", code: "duplicate" }); return; }
    const payout = v.value.payTo.toLowerCase();
    if (listings.filter(l => !trusted.has(l.id) && l.payTo.toLowerCase() === payout).length >= MAX_PER_PAYOUT) {
      res.status(409).json({ error: "Too many listings for this payout address", code: "payout_limit" }); return;
    }
    const listing: Listing = { ...v.value, id: randomUUID(), status: "pending", lastCheckedAt: null, createdAt: new Date().toISOString() };
    // Only endpoints that really ask for this payout address and price are accepted. Nothing dead is stored.
    const verdict = await inspect(listing);
    if (!verdict.ok) { res.status(422).json({ error: `Listing rejected: ${verdict.reason}`, code: verdict.reason }); return; }
    if (listings.some(sameEndpoint)) { res.status(409).json({ error: "This endpoint is already listed", code: "duplicate" }); return; } // lost a race
    listing.status = "healthy";
    listing.lastCheckedAt = new Date().toISOString();
    listings.push(listing);
    await save();
    res.status(201).json(withQuote(listing));
  });

  router.post("/:id/check", sameOriginOnly, checkPerIp, async (req, res) => {
    const l = listings.find(x => x.id === req.params.id);
    if (!l) { res.status(404).json({ error: "Not found", code: "not_found" }); return; }
    if (l.lastCheckedAt && Date.now() - Date.parse(l.lastCheckedAt) < RECHECK_MIN_INTERVAL_MS) {
      res.status(429).json({ error: "Checked recently, try again in a few seconds", code: "rate" }); return;
    }
    l.status = await probe(l);
    l.lastCheckedAt = new Date().toISOString();
    await save();
    res.json(withQuote(l));
  });

  // Operator takedown. Disabled until ADMIN_TOKEN is set; the operator's own listing cannot be removed.
  router.delete("/:id", adminPerIp, adminOnly, async (req, res) => {
    const id = String(req.params.id);
    if (trusted.has(id)) { res.status(403).json({ error: "This listing is managed by the operator", code: "forbidden" }); return; }
    const before = listings.length;
    listings = listings.filter(l => l.id !== id);
    if (listings.length === before) { res.status(404).json({ error: "Not found", code: "not_found" }); return; }
    await save();
    res.status(204).end();
  });

  // ── Read-only proxy for Circle's public Agent Marketplace discovery (no API key needed) ──
  router.get("/discover", discoverPerIp, discoverGlobal, async (req, res) => {
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

  return Object.assign(router, { warm: init });
}
