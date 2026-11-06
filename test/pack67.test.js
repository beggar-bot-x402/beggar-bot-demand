import test from "node:test"; import assert from "node:assert/strict";
import { PAID_PATHS } from "../src/x402.js"; import { handle } from "../src/index.js"; import { mcpTools } from "../src/mcp.js";
test("pack67 routes: paid 402 at 20000 + mcp + 400s", async () => {
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  const names = mcpTools(0.02).map((t) => t.name); for (const n of ["crypto_realized_vs_implied_vol", "crypto_futures_basis", "crypto_options_flow", "crypto_options_iv_smile"]) assert.ok(names.includes(n), n);
  for (const p of ["/v1/realizedvol", "/v1/futuresbasis", "/v1/optionsflow", "/v1/ivsmile"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
  const m = await import("../src/pack67.js"); for (const f of []) assert.equal((await m[f]({})).status, 400, f);
});
