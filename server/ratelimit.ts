/**
 * Abuse protection: fixed-window rate limits, per visitor and for the whole service.
 *
 * Counters live in Redis when it is configured (so every serverless instance shares them),
 * otherwise in memory (per instance: still useful, but weaker on a serverless host).
 * If Redis is unreachable the limiter falls back to memory instead of blocking everyone.
 */
import type { Request, RequestHandler } from "express";
import { isServerless, redisPipeline, storeKind } from "./store";

/** Operators of a private or trusted deployment can raise every limit at once (1 to 100). Default: 1. */
const SCALE = Math.min(100, Math.max(1, Math.floor(Number(process.env.RATE_LIMIT_MULTIPLIER)) || 1));

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Who is calling. Forwarding headers are trivially forged, so they are only believed where the
 * platform in front of us overwrites them (Vercel, Netlify) or when the operator names one explicitly.
 */
export function clientIp(req: Request): string {
  const trusted = process.env.TRUST_PROXY_HEADER?.toLowerCase();
  const candidates: Array<string | undefined> = [];
  if (trusted) candidates.push(first(req.headers[trusted]));
  if (isServerless) {
    candidates.push(
      first(req.headers["x-vercel-forwarded-for"]),
      first(req.headers["x-nf-client-connection-ip"]),
      first(req.headers["x-real-ip"]),
    );
  }
  for (const c of candidates) {
    const ip = c?.split(",")[0]?.trim();
    if (ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip)) return ip;
  }
  return req.socket.remoteAddress ?? "unknown";
}

// ── counters ───────────────────────────────────────────────────
const memoryCounts = new Map<string, { count: number; expiresAt: number }>();
let sinceSweep = 0;

function sweep(now: number) {
  if (++sinceSweep < 500 && memoryCounts.size < 20_000) return;
  sinceSweep = 0;
  for (const [k, v] of memoryCounts) if (v.expiresAt <= now) memoryCounts.delete(k);
  // Hard cap so a flood of distinct addresses cannot grow memory without bound.
  if (memoryCounts.size > 50_000) memoryCounts.clear();
}

async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  const windowIndex = Math.floor(now / windowMs);
  const resetAt = (windowIndex + 1) * windowMs;
  const windowKey = `rl:${key}:${windowIndex}`;

  if (storeKind === "upstash") {
    try {
      const [count] = await redisPipeline([["INCR", windowKey], ["PEXPIRE", windowKey, windowMs]]);
      if (typeof count === "number") return { count, resetAt };
    } catch (err) {
      console.warn("[RateLimit] Redis unavailable, using memory:", err instanceof Error ? err.message : err);
    }
  }
  sweep(now);
  const cur = memoryCounts.get(windowKey);
  if (cur && cur.expiresAt > now) {
    cur.count += 1;
    return { count: cur.count, resetAt };
  }
  memoryCounts.set(windowKey, { count: 1, expiresAt: resetAt });
  return { count: 1, resetAt };
}

export interface LimitOptions {
  /** Name of the bucket, so different route classes do not share a budget */
  name: string
  max: number
  windowMs: number
  /** Count everyone together instead of each visitor separately */
  global?: boolean
}

export function rateLimit({ name, max: baseMax, windowMs, global = false }: LimitOptions): RequestHandler {
  const max = baseMax * SCALE;
  return (req, res, next) => {
    const key = global ? `${name}:all` : `${name}:${clientIp(req)}`;
    hit(key, windowMs).then(
      ({ count, resetAt }) => {
        res.setHeader("RateLimit-Limit", String(max));
        res.setHeader("RateLimit-Remaining", String(Math.max(0, max - count)));
        if (count > max) {
          const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
          res.setHeader("Retry-After", String(retryAfter));
          res.status(429).json({ error: "Too many requests", code: "rate_limited", retryAfter });
          return;
        }
        next();
      },
      () => next(), // never lock everybody out because the limiter itself failed
    );
  };
}
