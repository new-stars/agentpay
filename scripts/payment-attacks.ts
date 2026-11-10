/**
 * Every cheating attempt below must be refused by the seller. Run it after changing the payment gate.
 * Needs AGENT_PRIVATE_KEY (throwaway testnet key with a Gateway balance) in .env and the backend running.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { generatePrivateKey } from "viem/accounts";

const API = process.env.API_BASE ?? "http://localhost:3001";
const key = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
if (!key) throw new Error("AGENT_PRIVATE_KEY is not set in .env");

let failures = 0;
const send = async (path: string, header: string | null, method = "POST") =>
  fetch(`${API}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(header ? { "Payment-Signature": header } : {}) },
    body: method === "POST" ? "{}" : undefined,
  });
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
const expectRefused = (name: string, res: Response): void => {
  const ok = res.status !== 200;
  if (!ok) failures++;
  console.log(`${ok ? "refused " : "ACCEPTED"}  HTTP ${res.status}  ${name}`);
};

/** Sign a real payment for `path` without spending it: a stand-in seller captures the header the client builds. */
async function signedHeaderFor(signerKey: `0x${string}`, path: string): Promise<string> {
  const real = await fetch(`${API}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const required = real.headers.get("payment-required") ?? "";
  let captured = "";
  const stub = createServer((req, res) => {
    const sig = req.headers["payment-signature"];
    if (typeof sig !== "string") {
      res.writeHead(402, { "PAYMENT-REQUIRED": required, "content-type": "application/json" });
      res.end("{}");
      return;
    }
    captured = sig;
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  await new Promise<void>(resolve => stub.listen(0, resolve));
  const port = (stub.address() as AddressInfo).port;
  try {
    await new GatewayClient({ chain: "arcTestnet", privateKey: signerKey }).pay(`http://localhost:${port}${path}`, { method: "POST", body: "{}" });
  } finally {
    stub.close();
  }
  return captured;
}

console.log("Cheating attempts (all must be refused):\n");

expectRefused("empty payload object", await send("/pay/summarize", b64({})));
expectRefused("payload without authorization", await send("/pay/summarize", b64({ x402Version: 2, accepted: { network: "eip155:5042002" }, payload: {} })));
expectRefused(
  "forged signature",
  await send("/pay/summarize", b64({
    x402Version: 2,
    accepted: { network: "eip155:5042002" },
    payload: { signature: "0x" + "11".repeat(65), authorization: { from: "0x000000000000000000000000000000000000dEaD", to: "0x5c800c4817C951d485D4F622920f41816060ec22", value: "1000", validAfter: "0", validBefore: "99999999999", nonce: "0x" + "22".repeat(32) } },
  })),
);

const cheap = await signedHeaderFor(key, "/pay/summarize"); // signed for 0.001 USDC
expectRefused("0.001 USDC payment replayed on a 0.05 USDC route (/risk)", await send("/risk", cheap));

const broke = await signedHeaderFor(generatePrivateKey(), "/pay/summarize"); // valid signature, wallet has nothing
expectRefused("valid signature from a wallet with no balance", await send("/pay/summarize", broke));

const once = await signedHeaderFor(key, "/pay/summarize");
const first = await send("/pay/summarize", once);
console.log(`${first.status === 200 ? "accepted" : "UNEXPECTED"}  HTTP ${first.status}  legitimate payment (first use)`);
if (first.status !== 200) failures++;
expectRefused("same payment replayed (second use)", await send("/pay/summarize", once));

console.log(failures === 0 ? "\nALL CHEATING ATTEMPTS REFUSED" : `\n${failures} PROBLEM(S)`);
process.exit(failures === 0 ? 0 : 1);
