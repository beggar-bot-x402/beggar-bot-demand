import test from "node:test"; import assert from "node:assert/strict";
import * as L from "../src/lib.js";
const P = "0x" + "a".repeat(40), Q = "0x" + "b".repeat(40), U = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const log = (v, from = P, to = Q, blk = 100) => ({ address: U, topics: [L.TRANSFER_TOPIC, L.pad32(from), L.pad32(to)], data: "0x" + v.toString(16), transactionHash: "0x" + "1".repeat(64), blockNumber: "0x" + blk.toString(16) });
test("toUnits", () => { assert.equal(L.toUnits("0.10"), 100000n); assert.equal(L.toUnits("2"), 2000000n); assert.throws(() => L.toUnits("1.1234567")); assert.throws(() => L.toUnits("-1")); });
test("verdict confirmed/pending/mismatch/not_found", () => {
  const m = L.matchTransfers([log(100000n)], { payer: P, payTo: Q, units: 100000n, usdc: U });
  assert.equal(L.verdict(m, 105).status, "confirmed"); assert.equal(L.verdict(m, 100).status, "pending");
  assert.equal(L.verdict(L.matchTransfers([log(5n)], { payer: P, payTo: Q, units: 100000n, usdc: U }), 105).status, "mismatch");
  assert.equal(L.verdict(L.matchTransfers([log(100000n, Q, P)], { payer: P, payTo: Q, units: 100000n, usdc: U }), 105).status, "not_found");
});
test("wrong token ignored", () => { assert.equal(L.matchTransfers([{ ...log(1n), address: Q }], { payer: P, payTo: Q, units: 1n, usdc: U }).length, 0); });
test("x402 checks", () => {
  assert.ok(L.checkX402({}).reasons.includes("no_accepts_array"));
  const r = L.checkX402({ accepts: [{ network: "base", payTo: P, maxAmountRequired: "1000" }, { network: "base-sepolia", payTo: Q, maxAmountRequired: "999999999999" }] });
  assert.ok(r.reasons.includes("mainnet_endpoint") && r.reasons.includes("multiple_payTo_addresses") && r.reasons.includes("price_over_100_usdc"));
  assert.equal(L.checkX402({ accepts: [{ network: "base-sepolia", payTo: P, maxAmountRequired: "1000" }] }).score, 100);
});
test("ssrf guard", () => { for (const u of ["http://x.com", "https://127.0.0.1", "https://10.0.0.1", "https://192.168.1.1", "https://169.254.169.254", "https://localhost", "https://[::1]"]) assert.equal(L.safeUrl(u), null, u); assert.ok(L.safeUrl("https://example.com/x")); });
test("canon stable", () => assert.equal(L.canon({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}'));
test("traffic classes", () => {
  assert.equal(L.classifyTraffic({ selftestOk: true }), "self");
  assert.equal(L.classifyTraffic({ ipHash: "h", operatorHashes: ["h"] }), "self");
  assert.equal(L.classifyTraffic({ ua: "Googlebot/2.1", status: 200 }), "crawler");
  assert.equal(L.classifyTraffic({ path: "/wp-admin", status: 404 }), "crawler");
  assert.equal(L.classifyTraffic({ ua: "python-httpx", status: 400 }), "invalid");
  assert.equal(L.classifyTraffic({ ua: "Mozilla/5.0 Chrome/120.0", status: 200 }), "human_browser");
  assert.equal(L.classifyTraffic({ ua: "python-httpx/0.27", status: 200 }), "candidate_agent");
});
test("address score", () => { assert.ok(L.scoreAddress({ code: "0x", nonce: 0 }).reasons.includes("no_outgoing_txs")); assert.equal(L.scoreAddress({ code: "0x60", nonce: 0 }).is_contract, true); });
