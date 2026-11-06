import test from "node:test"; import assert from "node:assert/strict";
import { PAID_PATHS } from "../src/x402.js"; import { handle } from "../src/index.js"; import { mcpTools } from "../src/mcp.js";
test("pack51 routes: paid 402 at 20000 + mcp + 400s", async () => {
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  const names = mcpTools(0.02).map((t) => t.name); for (const n of ["options_notional_volume", "perp_aggregator_volume", "perp_open_interest", "sol_stake_rewards"]) assert.ok(names.includes(n), n);
  for (const p of ["/v1/optionsnotional", "/v1/perpaggs", "/v1/perpoi", "/v1/solstakerewards"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
  const m = await import("../src/pack51.js"); for (const f of ["solstakerewards"]) assert.equal((await m[f]({ address: "0x1", addresses: "0x1", mint: "!", token: "0x1", chain: "solana" })).status, 400, f);
});
