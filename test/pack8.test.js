import test from "node:test"; import assert from "node:assert/strict";
import { l2status, pairliq, mevstyle, vault4626, analyzeReceipt } from "../src/pack8.js";
import { PAID_PATHS } from "../src/x402.js"; import { handle } from "../src/index.js";
test("pack8 validation + pure", async () => {
  assert.equal((await pairliq({ pool: "0x1" })).status, 400); assert.equal((await mevstyle({ tx: "0x1" })).status, 400); assert.equal((await vault4626({})).status, 400); assert.equal((await l2status({ chains: "solana" })).status, 400);
  const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", p = (a) => "0x" + a.slice(2).padStart(64, "0"), A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40), C = "0x" + "c".repeat(40), K = "0x" + "1".repeat(40);
  const rc = { status: "0x1", logs: [{ address: K, topics: [T, p(A), p(B)], data: "0x" + (95n).toString(16).padStart(64, "0") }, { address: K, topics: [T, p(A), p(C)], data: "0x" + (5n).toString(16).padStart(64, "0") }] };
  const o = analyzeReceipt(rc, { from: A, to: B }); assert.equal(o.transfer_tax[0].tax_pct_estimate, 5); assert.ok(o.flags.includes("fee_on_transfer_pattern"));
});
test("pack8 routes: paid 402 at 20000", async () => {
  assert.ok(PAID_PATHS.size >= 63); const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  for (const p of ["/v1/l2status", "/v1/pairliq", "/v1/mevstyle", "/v1/vault4626"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
});
