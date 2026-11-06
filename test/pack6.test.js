import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { basename, basenameNorm, permitcheck, contractrisk, txstatus, paycheck, siwe, scanBytecode, parseSiwe } from "../src/pack6.js";
import { PAID_PATHS } from "../src/x402.js";
import { keccak, checksum } from "../src/evm.js";
import { typedDigest } from "../src/sig.js";
// test-only signer (same as chaindata.test.js)
const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n, G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const md = (a, m = P) => ((a % m) + m) % m; const iv = (a, m = P) => { let [x, y, u, v] = [md(a, m), m, 1n, 0n]; while (x) { const q = y / x; [x, y, u, v] = [y - q * x, x, v - q * u, u]; } return md(v, m); };
const ad = (p, q) => { if (!p) return q; if (!q) return p; if (p[0] === q[0] && p[1] !== q[1]) return null; const l = p[0] === q[0] ? md(3n * p[0] * p[0] * iv(2n * p[1])) : md((q[1] - p[1]) * iv(q[0] - p[0])); const x = md(l * l - p[0] - q[0]); return [x, md(l * (p[0] - x) - p[1])]; };
const ml = (k, p = G) => { let r = null; while (k) { if (k & 1n) r = ad(r, p); p = ad(p, p); k >>= 1n; } return r; };
const H = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(""), B = (n) => n.toString(16).padStart(64, "0");
const addrOf = (d) => { const [x, y] = ml(d); return checksum("0x" + H(keccak(Uint8Array.from((B(x) + B(y)).match(/../g), (h) => parseInt(h, 16)))).slice(24)); };
const sign = (h, d) => { const z = BigInt("0x" + H(h)), k = md(z ^ d, N) || 1n, R = ml(k), r = md(R[0], N); let s = md(iv(k, N) * (z + r * d), N), v = Number(R[1] & 1n); if (s > N / 2n) { s = N - s; v ^= 1; } return "0x" + B(r) + B(s) + (27 + v).toString(16); };
const deny = () => { globalThis.fetch = async (u) => { throw new Error("offline " + u); }; };
const D = 0xabc123n, A = addrOf(D), te = new TextEncoder();
const personal = (m) => keccak(te.encode("\x19Ethereum Signed Message:\n" + te.encode(m).length + m));
const SIWE = `example.com wants you to sign in with your Ethereum account:\n${A}\n\nSign in to Example\n\nURI: https://example.com/login\nVersion: 1\nChain ID: 8453\nNonce: abcd1234XY\nIssued At: 2026-11-02T10:00:00Z\nExpiration Time: 2026-11-02T11:00:00Z\nResources:\n- https://example.com/a`;
const NOW = Date.parse("2026-11-02T10:30:00Z") / 1000;

test("siwe: parse, valid signature, expiry, domain/nonce mismatch, bad sig, 400", async () => {
  const f = parseSiwe(SIWE).fields; assert.equal(f.domain, "example.com"); assert.equal(f.chainId, "8453"); assert.equal(f.statement, "Sign in to Example"); assert.deepEqual(f.resources, ["https://example.com/a"]);
  const sig = sign(personal(SIWE), D);
  const ok = (await siwe({ message: SIWE, signature: sig, domain: "example.com", nonce: "abcd1234XY", now: NOW })).body; assert.equal(ok.valid, true, JSON.stringify(ok.errors)); assert.equal(ok.signer, A);
  const ex = (await siwe({ message: SIWE, signature: sig, now: NOW + 7200 })).body; assert.ok(ex.errors.includes("EXPIRED")); assert.equal(ex.valid, false);
  const mm = (await siwe({ message: SIWE, domain: "evil.com", nonce: "zzzzzzzz", now: NOW })).body; assert.ok(mm.errors.includes("DOMAIN_MISMATCH_PHISHING_RISK")); assert.ok(mm.errors.includes("NONCE_MISMATCH_REPLAY_RISK"));
  const wrong = (await siwe({ message: SIWE, signature: sign(personal(SIWE), 0x777n), now: NOW })).body; assert.ok(wrong.errors.includes("SIGNER_NOT_MESSAGE_ADDRESS_OR_EIP1271_WALLET"));
  assert.equal((await siwe({ message: "hello" })).status, 400); assert.equal((await siwe({})).status, 400);
});
const permitTD = (over = {}) => ({ types: { Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] }, primaryType: "Permit", domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }, message: { owner: A, spender: "0x" + "33".repeat(20), value: "1000000", nonce: "0", deadline: String(NOW + 3600), ...over } });
test("permitcheck: EIP-2612 signer match ok; unlimited+unknown spender caution; expired; wrong signer reject; Permit2 wrong contract", async () => {
  const td = permitTD(); const sig = sign(typedDigest(td).digest, D);
  const ok = (await permitcheck({ typed_data: td, signature: sig, now: NOW, chain: "base" })).body; assert.equal(ok.kind, "eip2612_permit"); assert.equal(ok.signer, A); assert.equal(ok.signer_matches_owner, true); assert.equal(ok.verdict, "caution"); assert.ok(ok.flags.includes("UNKNOWN_SPENDER"));
  const un = (await permitcheck({ typed_data: permitTD({ value: ((1n << 256n) - 1n).toString(), deadline: ((1n << 256n) - 1n).toString() }), now: NOW })).body; assert.ok(un.flags.includes("UNLIMITED_AMOUNT")); assert.ok(un.flags.includes("DEADLINE_OVER_1_YEAR_OR_NEVER"));
  const ex = (await permitcheck({ typed_data: permitTD({ deadline: String(NOW - 1) }), now: NOW })).body; assert.equal(ex.verdict, "expired");
  const bad = (await permitcheck({ typed_data: td, signature: sign(typedDigest(td).digest, 0x999n), now: NOW })).body; assert.equal(bad.verdict, "reject");
  const ch = (await permitcheck({ typed_data: td, chain: "ethereum", now: NOW })).body; assert.ok(ch.flags.includes("CHAIN_ID_MISMATCH"));
  const p2 = { types: { PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }], PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] }, primaryType: "PermitSingle", domain: { name: "Permit2", chainId: 8453, verifyingContract: "0x" + "44".repeat(20) }, message: { details: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: ((1n << 160n) - 1n).toString(), expiration: String(NOW + 100), nonce: "0" }, spender: "0x" + "55".repeat(20), sigDeadline: String(NOW + 100) } };
  const r2 = (await permitcheck({ typed_data: p2, now: NOW })).body; assert.equal(r2.kind, "permit2_allowance"); assert.ok(r2.flags.includes("PERMIT2_TYPE_BUT_VERIFYING_CONTRACT_NOT_PERMIT2")); assert.ok(r2.grants[0].unlimited); assert.equal(r2.verdict, "reject");
  assert.equal((await permitcheck({})).status, 400); assert.equal((await permitcheck({ typed_data: "nope" })).status, 400);
});
test("contractrisk: bytecode scan flags blacklist/fees/selfdestruct, skips PUSH data, EIP-1167, EOA, offline soft", async () => {
  const s = scanBytecode("0x63" + "44337ea1" + "63" + "69fe0e2d" + "ff" + "7f" + "ff".repeat(32)); assert.equal(s.opcodes.selfdestruct, 1); assert.ok(s.matched.some((x) => x.category === "blacklist")); assert.ok(s.matched.some((x) => x.category === "fee_setter"));
  const r = (await contractrisk({ bytecode: "0x63" + "44337ea1" + "63" + "69fe0e2d" + "ff" })).body; assert.ok(r.flags.includes("BLACKLIST")); assert.ok(r.flags.includes("MUTABLE_FEES")); assert.ok(r.flags.includes("SELFDESTRUCT_OPCODE")); assert.equal(r.verdict, "high_risk");
  const m = (await contractrisk({ bytecode: "0x363d3d373d3d3d363d73" + "ab".repeat(20) + "5af43d82803e903d91602b57fd5bf3" })).body; assert.ok(m.flags.includes("EIP1167_MINIMAL_PROXY"));
  deny(); const off = (await contractrisk({ address: "0x" + "12".repeat(20) })).body; assert.ok(off.error); assert.equal((await contractrisk({})).status, 400); assert.equal((await contractrisk({ address: "0x" + "12".repeat(20), chain: "solana" })).status, 400);
});
test("basename/txstatus/paycheck: normalize, 400s, fail soft offline", async () => {
  assert.equal(basenameNorm("Jesse"), "jesse.base.eth"); deny();
  const b = (await basename({ name: "jesse", resolve: "false" })).body; assert.equal(b.name, "jesse.base.eth"); assert.equal(b.live, false); assert.equal(b.token_id, BigInt(b.labelhash).toString());
  assert.equal((await basename({})).status, 400); const bo = (await basename({ name: "jesse" })).body; assert.ok(bo.error);
  assert.equal((await txstatus({})).status, 400); assert.equal((await txstatus({ tx_hash: "0x" + "1".repeat(64) })).body.live, false);
  assert.equal((await paycheck({})).status, 400); assert.equal((await paycheck({ address: A, amount: "1.1234567" })).status, 400);
  const p = (await paycheck({ address: A, amount: "0.02" })).body; assert.equal(p.can_pay, false); assert.equal(p.chains.length, 5); assert.equal(p.chains[0].live, false);
});
test("pack6 routes: 48 paid, each 402 at 20000 with outputSchema", async () => {
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  assert.ok(PAID_PATHS.size >= 60);
  for (const p of ["/v1/basename", "/v1/permitcheck", "/v1/contractrisk", "/v1/txstatus", "/v1/paycheck", "/v1/siwe"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
  const free = { BEGGAR_DEMAND_TESTS_ENABLED: "true" }; const r = await handle(new Request("https://w.test/v1/siwe", { method: "POST", body: JSON.stringify({ message: SIWE }) }), free); assert.equal(r.status, 200);
});
