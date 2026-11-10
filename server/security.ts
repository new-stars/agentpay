/**
 * Cross-cutting security helpers: response headers, browser cross-site protection,
 * the operator token for takedowns, and error handlers that never leak internals.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { isServerless } from "./store";

/** Headers every API response carries. Answers are never cacheable: they hold payment and status data. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  next();
};

/**
 * CORS. Reading the catalog and calling paid routes is open to any origin: paid routes are protected
 * by payment, not by cookies. Changing the registry is not (see sameOriginOnly).
 */
export const cors: RequestHandler = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Payment-Signature, X-Demo-Mode, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE, Retry-After, RateLimit-Limit, RateLimit-Remaining");
  res.setHeader("Access-Control-Max-Age", "600");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
};

const extraOrigins = new Set(
  (process.env.ALLOWED_ORIGINS ?? "").split(",").map(s => s.trim()).filter(Boolean),
);

/** True when a browser request comes from this site (or an origin the operator allowed). */
export function originAllowed(req: Request): boolean {
  const origin = req.get("origin");
  if (!origin) return true; // not a browser: curl, a bot, another server. Cross-site tricks need a browser.
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.host === req.get("host")) return true;
  if (extraOrigins.has(u.origin)) return true;
  if (!isServerless) {
    // Local development: the page is served by Vite and proxied to this server.
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.hostname.endsWith(".preview.studio.arc.io")) return true;
  }
  return false;
}

/** Blocks a web page on another site from making a visitor's browser change the registry. */
export const sameOriginOnly: RequestHandler = (req, res, next) => {
  if (originAllowed(req)) {
    next();
    return;
  }
  res.status(403).json({ error: "Cross-site request refused", code: "origin" });
};

const digest = (v: string) => createHash("sha256").update(v).digest();

/** Operator-only routes. Disabled entirely until ADMIN_TOKEN is set. */
export const adminOnly: RequestHandler = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token || token.length < 16) {
    res.status(404).json({ error: "Not found", code: "not_found" });
    return;
  }
  const given = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!timingSafeEqual(digest(given), digest(token))) {
    res.status(401).json({ error: "Unauthorized", code: "unauthorized" });
    return;
  }
  next();
};

export const notFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Not found", code: "not_found" });
};

/** Bad JSON and oversized bodies get a clean 4xx. Anything else is logged here and hidden from the caller. */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const type = (err as { type?: string } | null)?.type;
  if (type === "entity.too.large") {
    res.status(413).json({ error: "Request too large", code: "too_large" });
    return;
  }
  if (type === "entity.parse.failed" || err instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON", code: "bad_json" });
    return;
  }
  console.error("[AgentPay] unhandled error:", err instanceof Error ? err.message : err);
  res.status(500).json({ error: "Internal error", code: "internal" });
};
