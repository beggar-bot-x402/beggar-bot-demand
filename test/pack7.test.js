import test from "node:test"; import assert from "node:assert/strict";
import { evmrpc, erc20balances, walletlabels, defistats } from "../src/pack7.js";
import { PAID_PATHS } from "../src/x402.js"; import { handle } from "../src/index.js";
test("pack7 validation", async () => {
  assert.equal((await evmrpc({ method: "debug_traceTransaction" })).status, 400); assert.equal((await evmrpc({})).status, 400);
  assert.equal((await evmrpc({ method: "eth_getLogs", params: [{}] })).status, 400); assert.equal((await evmrpc({ method: "eth_chainId", chain: "solana" })).status, 400);
  assert.equal((await erc20balances({ addresses: "0x1" })).status, 400); assert.equal((await walletlabels({})).status, 400);
  const l = (await walletlabels({ addresses: "0x28C6c06298d514Db089934071355E5743bf21d60", live: "false" })).body; assert.equal(l.results[0].category, "cex");
  assert.equal((await defistats({ protocol: "bad slug!" })).status, 400);
});
test("pack7 routes: paid 402 at 20000", async () => {
  assert.ok(PAID_PATHS.size >= 59); const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  for (const p of ["/v1/evmrpc", "/v1/erc20balances", "/v1/walletlabels", "/v1/defistats"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
});
