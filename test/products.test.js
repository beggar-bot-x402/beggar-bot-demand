import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js"; import { pad32, TRANSFER_TOPIC } from "../src/lib.js";
const P = "0x" + "a".repeat(40), Q = "0x" + "b".repeat(40), U = "0x036CbD53842c5426634e7929541eC2318f3dCF7e", TX = "0x" + "2".repeat(64);
const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.privateKey)), kid: "test" };
const tlog = { address: U, topics: [TRANSFER_TOPIC, pad32(P), pad32(Q)], data: "0x2710", transactionHash: TX, blockNumber: "0x64" };
const acc = { scheme: "exact", network: "base", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: Q, maxAmountRequired: "10000", extra: { name: "USD Coin" } };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith("https://rpc.test")) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { status: "0x1", logs: [tlog] } }));
  if (u === "https://good.test/.well-known/x402") return new Response(JSON.stringify({ resources: [{ accepts: [acc] }] }));
  if (u === "https://good.test/paid") return new Response(JSON.stringify({ x402Version: 1, accepts: [acc] }), { status: 402 });
  if (u.startsWith("https://bad.test")) return new Response("nope", { status: 404 });
  if (u.startsWith("https://down.test")) throw new TypeError("network");
  throw new Error("unexpected fetch " + u);
};
const mkEnv = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", DEFAULT_NETWORK: "base-sepolia", RPC_URL_SEPOLIA: "https://rpc.test", RPC_URL_MAINNET: "https://rpc.test", OPERATOR_NAME: "Beggar Bot", RECEIPT_SIGNING_KEY_JWK: JSON.stringify(jwk), ...o });
const get = async (p, env = mkEnv()) => { const r = await handle(new Request("https://w.test" + p), env); return [r.status, await r.json()]; };

test("seller-health healthy seller", async () => {
  const [s, j] = await get("/v1/seller-health?endpoint=https://good.test/paid");
  assert.equal(s, 200); assert.equal(j.healthy, true); assert.equal(j.schema_ok, true); assert.equal(j.challenge.status, 402);
  assert.equal(j.accepts[0].payTo, Q); assert.equal(j.accepts[0].price_usdc, 0.01); assert.equal(j.accepts[0].network, "base"); assert.equal(j.discovery.path, "/.well-known/x402");
});
test("seller-health unhealthy / unreachable / SSRF", async () => {
  const [, b] = await get("/v1/seller-health?endpoint=https://bad.test/x"); assert.equal(b.healthy, false); assert.ok(b.reasons.includes("unpaid_request_not_402"));
  const [, d] = await get("/v1/seller-health?endpoint=https://down.test/x"); assert.equal(d.reachable, false); assert.ok(d.reasons.includes("unreachable_or_tls_error"));
  for (const e of ["http://good.test/", "https://10.0.0.1/", "https://169.254.169.254/", "https://localhost/", "https://[::1]/"]) assert.equal((await get("/v1/seller-health?endpoint=" + encodeURIComponent(e)))[0], 400, e);
});
test("delivery-attest sign + free GET verify + tamper", async () => {
  const body = JSON.stringify({ seller_url: "https://good.test/paid", tx_hash: TX, payer: P, payee: Q, amount: "0.01", response_sha256: "ab".repeat(32) });
  const r = await handle(new Request("https://w.test/v1/delivery-attest", { method: "POST", body }), mkEnv()); assert.equal(r.status, 200);
  const j = await r.json(); assert.equal(j.attestation.settlement, "verified_onchain_receipt"); assert.ok(!JSON.stringify(j).includes(jwk.d));
  const [s, v] = await get(`/v1/delivery-attest/verify?token=${j.token}&signature=${j.signature}`); assert.equal(s, 200); assert.equal(v.valid, true);
  const forged = Buffer.from(JSON.stringify({ ...j.attestation, amount: "100" })).toString("base64url");
  assert.equal((await get(`/v1/delivery-attest/verify?token=${forged}&signature=${j.signature}`))[1].valid, false);
  const bad = (o) => handle(new Request("https://w.test/v1/delivery-attest", { method: "POST", body: JSON.stringify({ ...JSON.parse(body), ...o }) }), mkEnv());
  assert.equal((await bad({ amount: "5" })).status, 422); assert.equal((await bad({ seller_url: "https://127.0.0.1/" })).status, 400); assert.equal((await bad({ response_sha256: "zz" })).status, 400);
});
test("new routes paywalled at $0.02 mainnet; verify free", async () => {
  const env = mkEnv({ X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" });
  const r = await handle(new Request("https://w.test/v1/seller-health?endpoint=https://good.test/paid"), env); assert.equal(r.status, 402);
  const a = (await r.json()).accepts[0]; assert.equal(a.maxAmountRequired, "20000"); assert.equal(a.payTo, "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7"); assert.equal(a.extra.name, "USD Coin");
  assert.equal((await handle(new Request("https://w.test/v1/delivery-attest", { method: "POST", body: "{}" }), env)).status, 402);
  assert.equal((await handle(new Request("https://w.test/v1/delivery-attest/verify"), env)).status, 400);
  const x = JSON.parse(await (await handle(new Request("https://w.test/.well-known/x402.json"), env)).text());
  assert.ok(x.resources.some((r) => r.resource.endsWith("/v1/seller-health") && r.price === "0.02"));
});
