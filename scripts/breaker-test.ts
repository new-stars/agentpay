/**
 * Proves the pause-and-recover behaviour when Circle's settlement service misbehaves. No real money moves:
 * a stand-in settlement service answers every settle call, and can be switched between a firewall block page and a success.
 * Needs AGENT_PRIVATE_KEY in .env (it only signs; nothing is sent to Circle's settle endpoint).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set in .env");
const REAL = "https://gateway-api-testnet.circle.com";
const SELLER = "0x5c800c4817C951d485D4F622920f41816060ec22";
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

let mode: "html" | "ok" = "html";
let settleCalls = 0;

const stub = createServer((req, res) => {
  const url = req.url ?? "";
  const respond = () => {
    if (process.env.VERBOSE) console.log(`    stub <- ${req.method} ${url}`);
    if (url.endsWith("/supported")) {
      fetch(`${REAL}${url}`).then(async r => {
        res.writeHead(r.status, { "content-type": "application/json" });
        res.end(await r.text());
      }, () => { res.writeHead(502); res.end(); });
      return;
    }
    if (url.endsWith("/settle")) {
      settleCalls += 1;
      if (mode === "html") { res.writeHead(429, { "content-type": "text/html" }); res.end("<html>blocked</html>"); return; }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ success: true, transaction: `stub-${settleCalls}`, network: "eip155:5042002", payer: "0x0000000000000000000000000000000000000001" }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ isValid: true }));
  };
  // A request without a body may never emit "end", so answer GETs straight away.
  if (req.method === "GET") { respond(); return; }
  req.on("data", () => undefined);
  req.on("end", respond);
});
await new Promise<void>(r => stub.listen(0, r));
const stubUrl = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

const PORT = 3090;
const backend = spawn("bun", ["run", join(process.cwd(), "server/index.ts")], {
  cwd: mkdtempSync(join(tmpdir(), "breaker-")),
  env: { ...process.env, PORT: String(PORT), FACILITATOR_URL: stubUrl, VITE_SELLER_ADDRESS: SELLER, RATE_LIMIT_MULTIPLIER: "50", SETTLE_RATE_PER_SECOND: "1000", SETTLE_BURST: "1000", FACILITATOR_TIMEOUT_MS: "3000" },
  stdio: "ignore",
});
const API = `http://localhost:${PORT}`;
for (let i = 0; i < 60; i++) {
  try { if ((await fetch(`${API}/health`)).ok) break; } catch { /* still starting */ }
  await sleep(250);
}

const client = new GatewayClient({ chain: "arcTestnet", privateKey: key });
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | "timeout"> =>
  Promise.race([p, new Promise<"timeout">(r => setTimeout(() => r("timeout"), ms))]);
const pay = async () => {
  const t0 = Date.now();
  const r = await withTimeout(client.pay(`${API}/pay/gas`, { method: "POST", body: "{}" }).then(() => "ok", (e: Error) => e.message), 20_000);
  const out = r === "timeout" ? "timeout (no answer in 20s)" : r;
  if (process.env.VERBOSE) console.log(`  attempt -> ${out.slice(0, 90)} [${Date.now() - t0} ms, settle calls so far ${settleCalls}]`);
  return out;
};
const paused = async () => ((await (await fetch(`${API}/health`)).json()) as { settlement: { pausedForSeconds: number } }).settlement.pausedForSeconds;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

console.log("Circuit breaker against a stand-in settlement service\n");

// 1. Firewall page on every settle call: three real attempts, the rest must not reach the service.
const first: string[] = [];
for (let i = 0; i < 8; i++) first.push(await pay());
check("every payment during the outage is refused", first.every(r => r !== "ok"), `${first.filter(r => r !== "ok").length}/8`);
check("refusal says it is temporary and nothing was charged", first.every(r => /temporarily unavailable|nothing was charged/i.test(r)), first[0]?.slice(0, 70));
// Each failed payment makes 3 calls (the first plus 2 automatic retries of a call the firewall turned away).
check("after 3 failures the service stops calling the settlement service", settleCalls === 3 * 3, `${settleCalls} calls for 8 attempts (3 failures x 3 tries, 5 held back)`);
const p1 = await paused();
check("the pause is reported on /health", p1 > 0 && p1 <= 10, `${p1}s`);
const challenge = await fetch(`${API}/pay/gas`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
check("while paused, a plain request still gets the 402 challenge", challenge.status === 402);

// 2. Settlement service healthy again: after the pause the very next payment goes through.
mode = "ok";
await sleep((p1 + 1) * 1000);
check("payment succeeds once the pause is over", (await pay()) === "ok");
check("pause is cleared after a success", (await paused()) === 0);

// 3. An outage that goes on (no success in between) pauses for longer each time. A success resets it, as checked above.
mode = "html";
settleCalls = 0;
for (let i = 0; i < 4; i++) await pay();
const q1 = await paused();
await sleep((q1 + 1) * 1000);
for (let i = 0; i < 4; i++) await pay();
const q2 = await paused();
check("a continuing outage pauses for longer the second time", q2 > q1 && q2 <= 20, `${q1}s then ${q2}s`);

backend.kill("SIGTERM");
stub.close();
console.log(failures === 0 ? "\nBREAKER BEHAVES" : `\n${failures} PROBLEM(S)`);
process.exit(failures === 0 ? 0 : 1);
