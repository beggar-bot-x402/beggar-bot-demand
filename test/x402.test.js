import test from "node:test"; import assert from "node:assert/strict";
import { paidConfig } from "../src/x402.js";
const A = "0x" + "c".repeat(40);
test("off by default", () => assert.equal(paidConfig({}).enabled, false));
test("testnet needs payTo + price range", () => {
  assert.equal(paidConfig({ X402_MODE: "testnet", X402_PRICE_USD: "0.001" }).enabled, false);
  assert.equal(paidConfig({ X402_MODE: "testnet", X402_PAY_TO: A, X402_PRICE_USD: "0.5" }).enabled, false);
  const c = paidConfig({ X402_MODE: "testnet", X402_PAY_TO: A, X402_PRICE_USD: "0.005" }); assert.equal(c.enabled, true); assert.equal(c.atomic, "5000"); assert.equal(c.network, "base-sepolia");
});
test("mainnet requires second key", () => {
  assert.equal(paidConfig({ X402_MODE: "mainnet", X402_PAY_TO: A, X402_PRICE_USD: "0.001" }).enabled, false);
  assert.equal(paidConfig({ X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: A, X402_PRICE_USD: "0.001" }).network, "base");
});

import { handle as __h } from "../src/index.js";
const MAIN = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.001", X402_FACILITATOR_URL: "https://facilitator.payai.network", OPERATOR_NAME: "Beggar Bot" };
test("mainnet 402 challenge well-formed for paid paths", async () => {
  for (const [p, m] of [["/v1/verify", "GET"], ["/v1/risk", "GET"], ["/v1/receipt", "POST"]]) {
    const r = await __h(new Request("https://x.dev" + p, { method: m }), MAIN);
    assert.equal(r.status, 402);
    const b = await r.json(); const a = b.accepts[0];
    assert.equal(b.x402Version, 1); assert.equal(a.scheme, "exact"); assert.equal(a.network, "base");
    assert.equal(a.asset, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); assert.equal(a.payTo, MAIN.X402_PAY_TO);
    assert.equal(a.maxAmountRequired, "1000"); assert.equal(a.resource, "https://x.dev" + p);
  }
});
test("receipt/verify and discovery stay free; manifest shows mainnet price", async () => {
  const r = await __h(new Request("https://x.dev/v1/receipt/verify", { method: "POST", body: "{}" }), MAIN);
  assert.notEqual(r.status, 402);
  const w = await (await __h(new Request("https://x.dev/.well-known/x402"), MAIN)).json();
  const v = w.resources.find((x) => x.resource.endsWith("/v1/verify"));
  assert.equal(v.price, "0.001"); assert.equal(v.accepts[0].network, "base");
  assert.equal(w.resources.find((x) => x.resource.endsWith("/receipt/verify")).accepts.length, 0);
});
test("mainnet blocked without second key", async () => {
  const r = await __h(new Request("https://x.dev/v1/risk"), { ...MAIN, X402_MAINNET_ALLOWED: "false" });
  assert.notEqual(r.status, 402);
});

import { challenge as _ch } from "../src/x402.js";
test("402 carries discovery metadata, payTo/price unchanged", async () => {
  const cfg = { network: "base", atomic: "20000", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7" };
  for (const p of ["/v1/verify", "/v1/risk", "/v1/receipt"]) {
    const j = await _ch(cfg, "https://x.example" + p, "d").json();
    const a = j.accepts[0];
    if (a.payTo !== cfg.payTo || a.maxAmountRequired !== "20000") throw new Error("price/payTo changed");
    if (!a.outputSchema?.input?.discoverable || a.mimeType !== "application/json" || !j.extensions?.bazaar?.info?.input) throw new Error("missing discovery " + p);
  }
});
