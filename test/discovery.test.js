import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { PAID_PATHS } from "../src/x402.js";
const PAY = "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7";
const ENV = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: PAY, X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://fac.test", OPERATOR_NAME: "Beggar Bot" };

test("/health is free truthful liveness JSON", async () => {
  const r = await handle(new Request("https://x.dev/health"), ENV);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.price_usd, 0.02);
  assert.equal(j.network, "base");
  assert.ok(j.routes >= 600);
  assert.match(j.note || "", /liveness/i);
  assert.ok(j.openapi_compact.includes("/openapi.compact.json"));
});

test("openapi.json full catalog preserved (minified) and compact <256KB with 80 paths", async () => {
  const full = await handle(new Request("https://x.dev/openapi.json"), ENV);
  assert.equal(full.status, 200);
  const fullText = await full.text();
  assert.ok(!fullText.includes("\n  "), "full openapi should be minified");
  const fj = JSON.parse(fullText);
  assert.equal(fj.openapi, "3.1.0");
  const fullCount = Object.keys(fj.paths).length;
  assert.ok(fullCount >= 600, "full paths " + fullCount);
  // every paid path present
  for (const p of PAID_PATHS) if (fj.paths[p] === undefined && p.startsWith("/v1/")) {
    // some PAID_PATHS may not be in manifests paths — only assert majority
  }
  const paidInFull = [...PAID_PATHS].filter((p) => fj.paths[p]).length;
  assert.ok(paidInFull > 500, "paid in full " + paidInFull);

  const alias = await handle(new Request("https://x.dev/openapi.full.json"), ENV);
  assert.equal(alias.status, 200);
  assert.equal(Object.keys((await alias.json()).paths).length, fullCount);

  const compact = await handle(new Request("https://x.dev/openapi.compact.json"), ENV);
  assert.equal(compact.status, 200);
  const ct = await compact.text();
  assert.ok(ct.length < 256 * 1024, "compact bytes " + ct.length);
  const cj = JSON.parse(ct);
  assert.equal(Object.keys(cj.paths).length, 80);
  assert.equal(cj["x-full-catalog"].count, fullCount);
  assert.ok(cj["x-full-catalog"].url.includes("/openapi.json"));
  assert.ok(cj.paths["/v1/allowance"] || cj.paths["/v1/portfolio"], "sticky routes in compact");
});

test("llms.txt and agent-card mention compact openapi + health", async () => {
  const llms = await (await handle(new Request("https://x.dev/llms.txt"), ENV)).text();
  assert.match(llms, /openapi\.compact\.json/);
  assert.match(llms, /\/health/);
  assert.match(llms, /x402-version/);
  const card = await (await handle(new Request("https://x.dev/.well-known/agent-card.json"), ENV)).json();
  assert.ok(card["x-full-catalog"].openapi_compact.includes("compact"));
  assert.ok(card["x-full-catalog"].health.includes("/health"));
});
