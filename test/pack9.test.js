import test from "node:test"; import assert from "node:assert/strict";
import { lstrate, lendrates, ghrepo } from "../src/pack9.js";
import { PAID_PATHS } from "../src/x402.js"; import { handle } from "../src/index.js"; import { mcpTools } from "../src/mcp.js";
test("pack9 validation", async () => {
  assert.equal((await lstrate({ tokens: "FOO" })).status, 400); assert.equal((await lendrates({ symbol: "bad sym!" })).status, 400); assert.equal((await ghrepo({ repo: "nope" })).status, 400);
});
test("pack9 routes: paid 402 at 20000 + mcp", async () => {
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  const names = mcpTools(0.02).map((t) => t.name); for (const n of ["lst_rate", "lend_rates", "github_repo", "restaking_tvl"]) assert.ok(names.includes(n));
  for (const p of ["/v1/lstrate", "/v1/lendrates", "/v1/ghrepo", "/v1/restaking"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
});
