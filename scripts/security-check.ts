/**
 * Probes the backend the way an attacker would. Every case must be refused or contained.
 *
 *   Functional checks (start the backend with RATE_LIMIT_MULTIPLIER=50 and ADMIN_TOKEN set):
 *     API_BASE=http://localhost:3002 ADMIN_TOKEN=<same token> bun run scripts/security-check.ts
 *   Rate-limit checks (against a backend with default limits):
 *     LIMITS=1 API_BASE=http://localhost:3001 bun run scripts/security-check.ts
 */
const API = process.env.API_BASE ?? "http://localhost:3001";
const ADMIN = process.env.ADMIN_TOKEN;
const LIMITS = process.env.LIMITS === "1";

let failed = 0;
let skipped = 0;
const check = (ok: boolean, name: string, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const skip = (name: string, why: string) => { skipped++; console.log(`skip  ${name}  (${why})`); };

const j = (body: unknown) => JSON.stringify(body);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : j(body) });
const code = async (res: Response) => ((await res.json().catch(() => ({}))) as { code?: string }).code;

if (LIMITS) {
  console.log("Rate limits (default settings)\n");
  const burst = async (path: string, n: number, init?: RequestInit) => {
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < n; i++) { last = await fetch(`${API}${path}`, init); statuses.push(last.status); }
    return { statuses, last };
  };

  let r = await burst("/payments", 75);
  const blocked = r.statuses.filter(s => s === 429).length;
  check(blocked >= 10 && r.statuses.slice(0, 55).every(s => s === 200), "GET /payments is limited to about 60 per minute", `${blocked} of 75 refused`);
  check(Boolean(r.last?.headers.get("retry-after")) && (await code(r.last as Response)) === "rate_limited", "refusal says when to retry and uses a stable code");

  r = await burst("/registry/discover?q=weather", 40);
  check(r.statuses.filter(s => s === 429).length >= 5, "Circle discovery proxy is limited (protects our upstream quota)", `${r.statuses.filter(s => s === 429).length} of 40 refused`);

  const sub = await Promise.all(Array.from({ length: 8 }, () => post("/registry", { name: "x" })));
  const subStatuses = sub.map(s => s.status).sort();
  check(subStatuses.filter(s => s === 429).length >= 3, "submitting listings is limited to 5 per hour per visitor", subStatuses.join(","));

  const pay = await Promise.all(Array.from({ length: 80 }, () => post("/pay/summarize", {}, { "Payment-Signature": Buffer.from(j({ x: 1 })).toString("base64") })));
  check(pay.filter(p => p.status === 429).length >= 10, "real payment attempts are limited to 60 per minute per visitor", `${pay.filter(p => p.status === 429).length} of 80 refused`);

  console.log(`\n${failed === 0 ? "RATE LIMITS HOLD" : `${failed} PROBLEM(S)`}`);
  process.exit(failed === 0 ? 0 : 1);
}

console.log("Functional security checks\n");

// ── response hygiene ──
{
  const res = await fetch(`${API}/health`);
  check(!res.headers.get("x-powered-by"), "no X-Powered-By header");
  check(res.headers.get("x-content-type-options") === "nosniff", "X-Content-Type-Options: nosniff");
  check((res.headers.get("cache-control") ?? "").includes("no-store"), "responses are never cached");
  check((res.headers.get("content-security-policy") ?? "").includes("default-src 'none'"), "API responses carry a locked-down CSP");
}
{
  const res = await fetch(`${API}/nope-${Date.now()}`);
  const text = await res.text();
  check(res.status === 404 && !/<html|at .*\.ts|node_modules/i.test(text), "unknown route: clean JSON 404, no HTML or stack");
  const bad = await post("/registry", "{not json");
  const badText = await bad.clone().text();
  check(bad.status === 400 && (await code(bad)) === "bad_json" && !/at .*\.(ts|js)|node_modules/.test(badText), "malformed JSON: 400 without a stack trace");
  const big = await post("/registry", j({ name: "x".repeat(300_000) }));
  check(big.status === 413 && (await code(big)) === "too_large", "oversized body: 413");
}

// ── cross-site abuse ──
{
  const res = await post("/registry", {}, { origin: "https://evil.example" });
  check(res.status === 403 && (await code(res)) === "origin", "registry write from another website is refused");
  const own = await post("/registry", {}, { origin: new URL(API).origin });
  check(own.status === 400, "registry write from the app's own page is allowed through to validation", `HTTP ${own.status}`);
  const pre = await fetch(`${API}/registry`, { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } });
  check(pre.status === 204 && !(pre.headers.get("access-control-allow-headers") ?? "").includes("*"), "CORS preflight lists exact headers, no wildcard");
}

// ── seller submission: SSRF and lies ──
const base = { name: "Probe seller", description: "security check", category: "Other", method: "POST", price: "0.01" };
const addr = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57";
const submit = async (over: Record<string, unknown>) => post("/registry", { ...base, payTo: addr, baseUrl: "https://2captcha.x402.paysponge.com", path: "/createTask", ...over });
{
  for (const [label, url] of [
    ["loopback IP", "https://127.0.0.1"], ["private IP", "https://10.0.0.5"], ["cloud metadata IP", "https://169.254.169.254"],
    ["IPv6 loopback", "https://[::1]"], ["localhost name", "https://localhost"], ["internal-looking name", "https://db.internal"],
    ["single-label host", "https://intranet"], ["plain http", "http://example.com"], ["credentials in URL", "https://user:pw@example.com"],
    ["custom port", "https://example.com:8443"],
  ] as const) {
    const res = await submit({ baseUrl: url });
    check(res.status === 400, `refuses ${label}`, `HTTP ${res.status}`);
  }
  const rebinding = await submit({ baseUrl: "https://localtest.me" }); // public name that resolves to 127.0.0.1
  check(rebinding.status === 400 && (await code(rebinding)) === "private_host", "refuses a public name that resolves to a private address");
  const notPaid = await submit({ baseUrl: "https://example.com", path: "/" });
  check(notPaid.status === 422 && ["not_402", "unreachable"].includes((await code(notPaid)) ?? ""), "refuses an endpoint that does not ask for payment");
}

// Only continue with the live-seller checks if that third-party endpoint still answers 402.
const live = await fetch("https://2captcha.x402.paysponge.com/createTask", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => undefined);
const liveOk = live?.status === 402;
if (!liveOk) {
  skip("payout address / price must match the seller's own 402", "reference seller unreachable right now");
} else {
  const wrongPayTo = await submit({ payTo: "0x000000000000000000000000000000000000dEaD" });
  check(wrongPayTo.status === 422 && (await code(wrongPayTo)) === "payto_mismatch", "refuses a listing whose payout address differs from the seller's 402");
  const wrongPrice = await submit({ price: "0.5" });
  check(wrongPrice.status === 422 && (await code(wrongPrice)) === "price_mismatch", "refuses a listing whose price differs from the seller's 402");
  const nasty = await submit({ name: "Safe\u202Ename\u0007 \u2066x" });
  const ok = nasty.status === 201;
  const listing = ok ? ((await nasty.json()) as { id: string; name: string }) : undefined;
  check(ok && listing !== undefined && !/[\u202a-\u202e\u2066-\u2069\u0000-\u001f]/.test(listing.name), "accepts a truthful listing and strips direction-override and control characters", listing?.name);
  const dup = await submit({});
  check(dup.status === 409 && (await code(dup)) === "duplicate", "refuses a duplicate listing");

  // ── operator takedown ──
  if (!ADMIN) {
    skip("admin takedown", "ADMIN_TOKEN not provided");
  } else if (listing) {
    const none = await fetch(`${API}/registry/${listing.id}`, { method: "DELETE" });
    check(none.status === 401, "takedown without a token is refused");
    const wrong = await fetch(`${API}/registry/${listing.id}`, { method: "DELETE", headers: { authorization: "Bearer wrong-token-wrong-token" } });
    check(wrong.status === 401, "takedown with a wrong token is refused");
    const demo = await fetch(`${API}/registry/demo-summarizer`, { method: "DELETE", headers: { authorization: `Bearer ${ADMIN}` } });
    check(demo.status === 403, "the operator's own listing cannot be removed");
    const good = await fetch(`${API}/registry/${listing.id}`, { method: "DELETE", headers: { authorization: `Bearer ${ADMIN}` } });
    check(good.status === 204, "takedown with the right token works");
  }
}
if (!ADMIN) {
  const res = await fetch(`${API}/registry/anything`, { method: "DELETE", headers: { authorization: "Bearer guess" } });
  check(res.status === 404 || res.status === 401, "takedown route gives nothing away without a token", `HTTP ${res.status}`);
}

// ── paid routes: bad input is refused before anyone is charged ──
{
  const unpaid = await post("/pay/summarize", {});
  check(unpaid.status === 402, "empty request still gets the 402 challenge");
  for (const [path, body] of [
    ["/pay/summarize", { text: 12345 }], ["/pay/summarize", { text: "x".repeat(20_000) }], ["/pay/translate", { target_lang: { a: 1 } }],
    ["/pay/analyze", { data: "nope" }], ["/pay/analyze", { data: Array.from({ length: 2000 }, () => 1) }], ["/risk", { address: ["a"] }],
    ["/decode-tx", { chainId: "1" }], ["/pay/ens", { query: "x".repeat(300) }],
  ] as const) {
    const res = await post(path, body);
    check(res.status === 400 && (await code(res)) === "bad_body", `${path} rejects a bad body before payment`, `HTTP ${res.status}`);
  }
  const arr = await post("/pay/summarize", [1, 2, 3]);
  check(arr.status === 400, "a JSON array instead of an object is refused");
  const sig = await post("/pay/summarize", {}, { "Payment-Signature": "%%%not-base64-json%%%" });
  check(sig.status === 400, "garbage Payment-Signature is a clean 400, not a 500");
}

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} PROBLEM(S)`}${skipped ? ` (${skipped} skipped)` : ""}`);
process.exit(failed === 0 ? 0 : 1);
