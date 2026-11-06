import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { paymentRequiredV2 } from "../src/x402.js";
const PAY = "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ENV = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: PAY, X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://fac.test", OPERATOR_NAME: "Beggar Bot" };
const dec = (h) => JSON.parse(decodeURIComponent(escape(atob(h))));
const enc = (o) => btoa(JSON.stringify(o));
const ROUTES = [["/v1/verify", "GET"], ["/v1/risk", "GET"], ["/v1/receipt", "POST"]];
const REQ2 = { scheme: "exact", network: "eip155:8453", amount: "20000", asset: USDC, payTo: PAY, maxTimeoutSeconds: 120, extra: { name: "USD Coin", version: "2" } };
function mockFetch(handler) { const calls = []; const orig = globalThis.fetch; globalThis.fetch = async (u, init) => { calls.push({ u: String(u), body: init?.body && JSON.parse(init.body) }); return handler(String(u), calls.at(-1).body); }; return { calls, restore: () => (globalThis.fetch = orig) }; }

test("402 has v2 PAYMENT-REQUIRED header per spec; body stays v1", async () => {
  for (const [p, m] of ROUTES) {
    const r = await handle(new Request("https://x.dev" + p, { method: m }), ENV);
    assert.equal(r.status, 402);
    const v2 = dec(r.headers.get("payment-required"));
    assert.equal(v2.x402Version, 2); assert.equal(v2.resource.url, "https://x.dev" + p);
    assert.equal(v2.resource.mimeType, "application/json"); assert.ok(v2.resource.serviceName.length <= 32); assert.ok(v2.resource.tags.length <= 5);
    assert.deepEqual(v2.accepts, [REQ2]);
    const bz = v2.extensions.bazaar; assert.equal(bz.info.input.type, "http"); assert.equal(bz.info.input.method, m);
    assert.equal(bz.schema.properties.input.properties.method.enum.includes(m), true);
    assert.match(r.headers.get("access-control-expose-headers"), /PAYMENT-REQUIRED/);
    const b = await r.json(); assert.equal(b.x402Version, 1); assert.equal(b.accepts[0].network, "base"); assert.equal(b.accepts[0].maxAmountRequired, "20000");
  }
});
test("v2 bazaar examples satisfy their own schema required fields", () => {
  for (const [p, m] of ROUTES) {
    const bz = paymentRequiredV2({ caip: "eip155:8453", atomic: "10000", usdc: USDC, payTo: PAY }, "https://x.dev" + p, "d").extensions.bazaar;
    const key = m === "GET" ? "queryParams" : "body";
    for (const k of bz.schema.properties.input.properties[key].required || []) assert.ok(k in bz.info.input[key], p + " " + k);
  }
});
test("v2 PAYMENT-SIGNATURE: verify+settle with x402Version 2 and v2 requirements, PAYMENT-RESPONSE set", async () => {
  const f = mockFetch((u) => new Response(JSON.stringify(u.endsWith("/verify") ? { isValid: true } : u.endsWith("/settle") ? { success: true, transaction: "0xabc", network: "eip155:8453", payer: "0x1" } : { jsonrpc: "2.0", id: 1, result: "0x0" })));
  try {
    const pl = { x402Version: 2, resource: { url: "https://x.dev/v1/receipt/verify" }, accepted: REQ2, payload: { signature: "0x", authorization: { from: "0x1" } } };
    const r = await handle(new Request("https://x.dev/v1/risk?address=0x" + "a".repeat(40), { headers: { "PAYMENT-SIGNATURE": enc(pl) } }), ENV);
    const fac = f.calls.filter((c) => c.u.startsWith("https://fac.test"));
    assert.deepEqual(fac.map((c) => c.u), ["https://fac.test/verify", "https://fac.test/settle"]);
    for (const c of fac) { assert.equal(c.body.x402Version, 2); assert.deepEqual(c.body.paymentRequirements, REQ2); }
    assert.equal(r.status, 200); assert.equal(dec(r.headers.get("payment-response")).transaction, "0xabc");
    assert.equal(r.headers.get("x-payment-response"), null);
  } finally { f.restore(); }
});
test("v2 payload with tampered accepted (payTo/amount/network) rejected before facilitator", async () => {
  const f = mockFetch(() => new Response(JSON.stringify({ isValid: true })));
  try {
    for (const bad of [{ payTo: "0x" + "b".repeat(40) }, { amount: "1" }, { network: "eip155:84532" }, { asset: "0x" + "c".repeat(40) }]) {
      const pl = { x402Version: 2, accepted: { ...REQ2, ...bad }, payload: {} };
      const r = await handle(new Request("https://x.dev/v1/risk", { headers: { "PAYMENT-SIGNATURE": enc(pl) } }), ENV);
      assert.equal(r.status, 402); assert.ok(r.headers.get("payment-required"));
    }
    const r = await handle(new Request("https://x.dev/v1/risk", { headers: { "PAYMENT-SIGNATURE": enc({ x402Version: 1, accepted: REQ2 }) } }), ENV);
    assert.equal(r.status, 402);
    assert.equal(f.calls.length, 0);
  } finally { f.restore(); }
});
test("v1 X-PAYMENT still verified/settled as v1 with X-PAYMENT-RESPONSE", async () => {
  const f = mockFetch((u) => new Response(JSON.stringify(u.endsWith("/verify") ? { isValid: true } : u.endsWith("/settle") ? { success: true, transaction: "0xdef", network: "base" } : { jsonrpc: "2.0", id: 1, result: "0x0" })));
  try {
    const r = await handle(new Request("https://x.dev/v1/risk?address=0x" + "a".repeat(40), { headers: { "X-PAYMENT": enc({ x402Version: 1, scheme: "exact", network: "base", payload: {} }) } }), ENV);
    const fac = f.calls.filter((c) => c.u.startsWith("https://fac.test"));
    assert.equal(fac.length, 2);
    for (const c of fac) { assert.equal(c.body.x402Version, 1); assert.equal(c.body.paymentRequirements.network, "base"); assert.equal(c.body.paymentRequirements.maxAmountRequired, "20000"); assert.equal(c.body.paymentRequirements.payTo, PAY); }
    assert.equal(r.status, 200); assert.ok(r.headers.get("x-payment-response")); assert.equal(r.headers.get("payment-response"), null);
  } finally { f.restore(); }
});
test("invalid v2 payment and garbage header -> 402 with PAYMENT-REQUIRED; free routes unaffected", async () => {
  const f = mockFetch(() => new Response(JSON.stringify({ isValid: false, invalidReason: "insufficient_funds" })));
  try {
    const r = await handle(new Request("https://x.dev/v1/risk", { headers: { "PAYMENT-SIGNATURE": enc({ x402Version: 2, accepted: REQ2, payload: {} }) } }), ENV);
    assert.equal(r.status, 402); assert.match(dec(r.headers.get("payment-required")).error, /insufficient_funds/);
    const g = await handle(new Request("https://x.dev/v1/risk", { headers: { "PAYMENT-SIGNATURE": "%%%" } }), ENV);
    assert.equal(g.status, 402);
    const free = await handle(new Request("https://x.dev/v1/receipt/verify", { method: "POST", body: "{}" }), ENV);
    assert.equal(free.headers.get("payment-required"), null);
  } finally { f.restore(); }
});
test("abidecode 402 bazaar includes concrete example queryParams.data", () => {
  const bz = paymentRequiredV2({ caip: "eip155:8453", atomic: "20000", usdc: USDC, payTo: PAY }, "https://x.dev/v1/abidecode", "d").extensions.bazaar;
  assert.equal(bz.info.input.method, "GET");
  assert.ok(bz.info.input.queryParams && typeof bz.info.input.queryParams.data === "string");
  assert.match(bz.info.input.queryParams.data, /^0xa9059cbb/);
  assert.ok(bz.schema.properties.input.properties.queryParams.required.includes("data"));
});
