import test from "node:test"; import assert from "node:assert/strict";
import { DISCOVERY } from "../src/x402.js"; import { SEARCH_COPY } from "../src/searchcopy.js"; import { symbolMap, tokenprice } from "../src/chaindata.js";
test("search copy applied to DISCOVERY with ≤5 tags", () => {
  for (const p of Object.keys(SEARCH_COPY)) { const d = DISCOVERY[p]; assert.ok(d, p); assert.ok(d.description.startsWith(SEARCH_COPY[p].d), p); assert.ok(d.tags.length <= 5 && d.tags.length >= 3, p); assert.ok(d.description.length < 600, p); }
});
test("tokenprice symbol map", () => {
  assert.equal(symbolMap("base").ETH, "0x4200000000000000000000000000000000000006");
  assert.equal(symbolMap("base").BTC, "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf");
  assert.equal(symbolMap("ethereum").USDC, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
});
test("tokenprice unknown symbol -> 400 with hint (not charged)", async () => {
  const o = await tokenprice({ tokens: "NOTATOKEN" }); assert.equal(o.status, 400); assert.match(JSON.stringify(o.body), /ETH, BTC, USDC/);
  const e = await tokenprice({}); assert.equal(e.status, 400);
});
