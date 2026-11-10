/**
 * Small JSON key-value store with three backends, picked from the environment:
 *  - upstash: a Redis database reached over HTTPS (works on Vercel, Netlify and any serverless host)
 *  - file:    server/data/*.json (a normal server)
 *  - memory:  serverless host with no database configured. Data lives only as long as the instance does.
 * Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or the KV_REST_API_* names that Vercel adds
 * when you attach a Redis/KV store) to get durable storage on a serverless host.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Relative to where the server is started (the project root), so it also works once bundled.
const DATA_DIR = `${join(process.cwd(), "server", "data")}/`;
const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const isServerless = Boolean(process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME);
export type StoreKind = "upstash" | "file" | "memory";
export const storeKind: StoreKind = REST_URL && REST_TOKEN ? "upstash" : isServerless ? "memory" : "file";

const memory = new Map<string, string>();
const KEY = /^[a-z0-9-]{1,40}$/;

async function redis(command: string[]): Promise<unknown> {
  const res = await fetch(REST_URL as string, {
    method: "POST",
    headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

export async function loadJson<T>(name: string): Promise<T | undefined> {
  if (!KEY.test(name)) throw new Error("invalid store key");
  try {
    if (storeKind === "upstash") {
      const text = await redis(["GET", `agentpay:${name}`]);
      return typeof text === "string" ? (JSON.parse(text) as T) : undefined;
    }
    if (storeKind === "file") {
      const file = `${DATA_DIR}${name}.json`;
      return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as T) : undefined;
    }
    const text = memory.get(name);
    return text ? (JSON.parse(text) as T) : undefined;
  } catch (err) {
    console.warn(`[Store] could not read "${name}", starting empty:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

export async function saveJson(name: string, value: unknown): Promise<void> {
  if (!KEY.test(name)) throw new Error("invalid store key");
  const text = JSON.stringify(value);
  memory.set(name, text); // always keep a copy so a failed write does not lose data for this instance
  try {
    if (storeKind === "upstash") {
      await redis(["SET", `agentpay:${name}`, text]);
    } else if (storeKind === "file") {
      mkdirSync(DATA_DIR, { recursive: true });
      const file = `${DATA_DIR}${name}.json`;
      writeFileSync(`${file}.tmp`, text);
      renameSync(`${file}.tmp`, file);
    }
  } catch (err) {
    console.warn(`[Store] could not save "${name}":`, err instanceof Error ? err.message : err);
  }
}
