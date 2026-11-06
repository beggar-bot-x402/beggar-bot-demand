import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { x402check, eip3009, paymentheader, usdcamount } from "../src/x402tools.js";
import { PAID_PATHS } from "../src/x402.js";
globalThis.fetch = async (u) => { throw new Error("no outbound allowed: " + u); };
const PAY = "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
// vector signed with viem 2.x signTypedData (privkey 0x11..11), Base USDC domain "USD Coin"/"2"
const AU = { from: "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A", to: PAY, value: "20000", validAfter: "0", validBefore: "1893456000", nonce: "0x" + "ab".repeat(32) };
const SIG = "0xf95904aec35ff8dda38dd0baf4b85837380756ccafbb4782b85fa963029904c14897beafba09c656e05a5e3274d68d88720640abee5a2b663c66219b550719b61c";
const NOW = 1893456000 - 60;
const REQ = { scheme: "exact", network: "base", maxAmountRequired: "20000", asset: USDC, payTo: PAY, resource: "https://w.test/v1/verify", maxTimeoutSeconds: 120, extra: { name: "USD Coin", version: "2" } };
const b64 = (o) => btoa(JSON.stringify(o));
test("eip3009: viem vector recovers signer, window, wrong-domain detection", async () => {
  const b = (await eip3009({ authorization: AU, signature: SIG, now: NOW })).body;
  assert.equal(b.valid, true); assert.equal(b.recovered_signer, AU.from); assert.equal(b.time_status, "valid_now"); assert.equal(b.value_usdc, "0.02");
  const exp = (await eip3009({ authorization: AU, signature: SIG, now: 1893456001 })).body; assert.equal(exp.time_status, "expired"); assert.equal(exp.valid, false);
  const wrong = (await eip3009({ authorization: AU, signature: SIG, chain: "base-sepolia", now: NOW })).body;
  assert.equal(wrong.signer_matches_from, false); assert.deepEqual(wrong.matching_other_domains, [{ chain: "base", name: "USD Coin" }]);
  const tam = (await eip3009({ authorization: { ...AU, value: "20001" }, signature: SIG, now: NOW })).body; assert.equal(tam.valid, false);
  assert.equal((await eip3009({})).status, 400); assert.equal((await eip3009({ authorization: AU, signature: SIG, chain: "solana" })).status, 400);
  assert.equal((await eip3009({ payload: JSON.stringify({ authorization: AU, signature: SIG }), now: NOW })).body.valid, true);
});
test("paymentheader: v1 + v2 decode and match requirements", async () => {
  const h1 = b64({ x402Version: 1, scheme: "exact", network: "base", payload: { authorization: AU, signature: SIG } });
  const ok = (await paymentheader({ header: h1, requirements: { x402Version: 1, accepts: [REQ] }, now: NOW })).body;
  assert.equal(ok.valid, true, JSON.stringify(ok.issues)); assert.equal(ok.payer, AU.from); assert.equal(ok.matched_requirement.amount_atomic, "20000");
  const hi = (await paymentheader({ header: h1, requirements: [{ ...REQ, maxAmountRequired: "50000" }], now: NOW })).body;
  assert.equal(hi.valid, false); assert.match(hi.requirement_results[0].mismatches.join(), /value_below_required/);
  const other = (await paymentheader({ header: h1, requirements: b64({ accepts: [{ ...REQ, payTo: USDC }] }), now: NOW })).body; assert.match(other.requirement_results[0].mismatches.join(), /to_not_payTo/);
  const A2 = { scheme: "exact", network: "eip155:8453", amount: "20000", asset: USDC, payTo: PAY, maxTimeoutSeconds: 120, extra: { name: "USD Coin", version: "2" } };
  const v2 = (await paymentheader({ "PAYMENT-SIGNATURE": b64({ x402Version: 2, accepted: A2, payload: { authorization: AU, signature: SIG } }), now: NOW })).body;
  assert.equal(v2.x402Version, 2); assert.equal(v2.valid, true, JSON.stringify(v2.issues));
  assert.equal((await paymentheader({ header: "%%%" })).status, 400); assert.equal((await paymentheader({})).status, 400);
});
test("x402check: good, broken, base64 header, discovery doc", async () => {
  const g = (await x402check({ challenge: { x402Version: 1, accepts: [REQ] } })).body; assert.equal(g.valid, true); assert.equal(g.score, 100); assert.equal(g.accepts[0].price_usdc, "0.02");
  const broken = (await x402check({ challenge: JSON.stringify({ x402Version: 1, accepts: [{ ...REQ, maxAmountRequired: 20000.5, payTo: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40E7", extra: { name: "USDC", version: "2" } }] }) })).body;
  assert.equal(broken.valid, false); const iss = broken.accepts[0].issues.join(); assert.match(iss, /amount_not_atomic/); assert.match(iss, /bad_checksum/); assert.match(iss, /extra.name_mismatch/);
  const v2 = (await x402check({ challenge: b64({ x402Version: 2, resource: { url: "https://w.test/x" }, accepts: [{ ...REQ, maxAmountRequired: undefined, amount: "20000", network: "eip155:8453" }] }), expect: { payTo: PAY, amount: "0.02" } })).body;
  assert.equal(v2.kind, "payment_required_v2"); assert.equal(v2.valid, true, JSON.stringify(v2.accepts));
  const ex = (await x402check({ challenge: { accepts: [REQ] }, expect: { amount: "0.01" } })).body; assert.match(ex.accepts[0].issues.join(), /amount_differs/);
  const d = (await x402check({ challenge: { resources: [{ resource: "https://w.test/a", accepts: [REQ] }] } })).body; assert.equal(d.kind, "discovery_doc");
  assert.equal((await x402check({})).status, 400); assert.equal((await x402check({ challenge: "nope" })).status, 400);
});
test("usdcamount: both directions, precision guard, chains, checksum", async () => {
  assert.equal((await usdcamount({ amount: "0.02" })).body.atomic, "20000");
  assert.equal((await usdcamount({ atomic: "1234567" })).body.decimal, "1.234567");
  assert.equal((await usdcamount({ amount: "0.0000001" })).status, 400); assert.equal((await usdcamount({ amount: "abc" })).status, 400);
  const all = (await usdcamount({ amount: "1", chain: "all" })).body; assert.equal(all.tokens.length, 9); assert.ok(all.tokens.filter((t) => t.address_checksum !== "n/a (base58)").every((t) => t.address_checksum === "valid"));
  assert.equal((await usdcamount({ chain: "eip155:84532", amount: "1" })).body.tokens[0].usdc, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  const c = (await usdcamount({ address: USDC.toLowerCase() })).body.address_check; assert.equal(c.state, "unchecksummed"); assert.equal(c.checksummed, USDC); assert.deepEqual(c.is_usdc_on, ["base"]);
  assert.equal((await usdcamount({ chain: "dogechain" })).status, 400);
});
const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: PAY, X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const NEW = ["/v1/x402check", "/v1/eip3009", "/v1/paymentheader", "/v1/usdcamount"];
test("routes: 34 paid, new routes 402 at 20000, free mode serves, discovery order money-first", async () => {
  assert.ok(PAID_PATHS.size >= 60); for (const p of NEW) assert.ok(PAID_PATHS.has(p));
  for (const p of NEW) { const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
  const free = { BEGGAR_DEMAND_TESTS_ENABLED: "true" };
  const r = await handle(new Request("https://w.test/v1/usdcamount?amount=0.02"), free); assert.equal(r.status, 200); assert.equal((await r.json()).atomic, "20000");
  const w = await (await handle(new Request("https://w.test/.well-known/x402"), PAID)).json();
  const paidOrder = w.endpoints.map((e) => new URL(e.resource).pathname); assert.deepEqual(paidOrder.slice(0, 6), ["/v1/portfolio", "/v1/erc20balances", "/v1/nativebalances", "/v1/addrprofile", "/v1/walletlabels", "/v1/gasfee"]);
  assert.ok(w.endpoints.length >= 55); assert.equal(w.resources.find((x) => x.resource.endsWith("/v1/receipt/verify")).accepts.length, 0);
  const o = await (await handle(new Request("https://w.test/openapi.json"), PAID)).json(); assert.deepEqual(Object.keys(o.paths).slice(0, 2), ["/v1/portfolio", "/v1/erc20balances"]);
});
test("receipt/verify: GET + aliases return 200 usage with a verifiable live sample (validator-friendly), stays free", async () => {
  const kp = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]); const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const env = { ...PAID, RECEIPT_SIGNING_KEY_JWK: JSON.stringify(jwk) };
  for (const p of ["/v1/receipt/verify", "/v1/receipts/verify", "/v1/verify-receipt"]) { const r = await handle(new Request("https://w.test" + p), env); assert.equal(r.status, 200, p); }
  const u = await (await handle(new Request("https://w.test/v1/receipt/verify"), env)).json(); assert.ok(u.example.signature);
  const v = await (await handle(new Request("https://w.test/v1/receipt/verify", { method: "POST", body: JSON.stringify(u.example) }), env)).json(); assert.equal(v.valid, true);
  const q = await (await handle(new Request("https://w.test/v1/receipt/verify?receipt=" + encodeURIComponent(JSON.stringify(u.example.receipt)) + "&signature=" + u.example.signature), env)).json(); assert.equal(q.valid, true);
  const e = await handle(new Request("https://w.test/v1/receipt/verify", { method: "POST", body: "" }), env); assert.equal(e.status, 200); assert.equal(e.headers.get("payment-required"), null);
});
