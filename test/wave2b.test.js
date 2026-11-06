import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { PAID_PATHS } from "../src/x402.js";
import { encodeCall, decodeReturn, decodeRevert, parseFeed, simcall, nonce, tokenholders, solbalance, whois, feedparse } from "../src/wave2b.js";
const R = ["/v1/simcall", "/v1/nonce", "/v1/tokenholders", "/v1/solbalance", "/v1/whois", "/v1/feedparse"];
const env = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PRICE_USD: "0.02", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_FACILITATOR_URL: "https://fac.test" };
test("wave2b: paid 402 at 20000", async () => {
  for (const p of R) { assert.ok(PAID_PATHS.has(p), p); const r = await handle(new Request("https://w.test" + p), env); assert.equal(r.status, 402, p); assert.match(JSON.stringify(await r.json()), /20000/); }
});
test("wave2b: helpers + validation", async () => {
  assert.equal(encodeCall("balanceOf(address)", ["0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7"]).slice(0, 10), "0x70a08231");
  assert.deepEqual(decodeReturn("0x" + "0".repeat(63) + "a", ["uint256"]), ["10"]);
  assert.equal(decodeRevert("0x4e487b71" + "0".repeat(62) + "11").reason, "overflow");
  const f = parseFeed(`<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><entry><title>A &amp; B</title><link rel="alternate" href="https://x.y/a"/><updated>2026-11-02T09:00:00Z</updated></entry></feed>`);
  assert.equal(f.format, "atom"); assert.equal(f.items[0].title, "A & B"); assert.equal(f.items[0].url, "https://x.y/a");
  for (const [fn, a] of [[simcall, {}], [nonce, { address: "x" }], [tokenholders, {}], [solbalance, { address: "0x1" }], [whois, { domain: "nope" }], [feedparse, { url: "http://localhost/x" }]]) assert.equal((await fn(a)).status, 400);
});
