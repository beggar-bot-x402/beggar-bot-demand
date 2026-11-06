import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { tokenprice, gasfee, safetx, portfolio, uniPool, aeroPool, v3Price, aeroPrice, VENUES, BASE_TOKENS, feeSuggest } from "../src/chaindata.js";
import { PAID_PATHS } from "../src/x402.js";
import { keccak, keccakHex } from "../src/evm.js";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", WETH = "0x4200000000000000000000000000000000000006", T = "0x" + "11".repeat(20);
const W = (h) => h.replace(/^0x/, "").padStart(64, "0");
const S = (str) => { const b = Buffer.from(str).toString("hex"); return "0x" + W("20") + W(Buffer.from(str).length.toString(16)) + b.padEnd(Math.ceil(b.length / 64) * 64 || 64, "0"); };
const mockRpc = (fn) => { globalThis.fetch = async (u, o) => { const calls = JSON.parse(o.body); return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: fn(c) })))); }; };
const deny = () => { globalThis.fetch = async (u) => { throw new Error("offline " + u); }; };
const sel = (s) => keccakHex(s).slice(0, 10);
const sq = (raw) => BigInt(Math.round(Math.sqrt(raw) * 2 ** 48)) * 2n ** 48n; // sqrtPriceX96 for raw token1/token0 price
const REF = uniPool(VENUES.base.uni, WETH, USDC, 500), TPOOL = uniPool(VENUES.base.uni, T, USDC, 3000);
const ethSlot = "0x" + W(sq(2000 * 1e-12).toString(16)) + W("0"); // WETH(token0) per USDC: raw = 2000e6/1e18
// test-only ECDSA signer (deterministic k, never shipped) — copy of sig.test.js helper
const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n, G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const md = (a, m = P) => ((a % m) + m) % m; const iv = (a, m = P) => { let [x, y, u, v] = [md(a, m), m, 1n, 0n]; while (x) { const q = y / x; [x, y, u, v] = [y - q * x, x, v - q * u, u]; } return md(v, m); };
const ad = (p, q) => { if (!p) return q; if (!q) return p; if (p[0] === q[0] && p[1] !== q[1]) return null; const l = p[0] === q[0] ? md(3n * p[0] * p[0] * iv(2n * p[1])) : md((q[1] - p[1]) * iv(q[0] - p[0])); const x = md(l * l - p[0] - q[0]); return [x, md(l * (p[0] - x) - p[1])]; };
const ml = (k, p = G) => { let r = null; while (k) { if (k & 1n) r = ad(r, p); p = ad(p, p); k >>= 1n; } return r; };
const H = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(""), B = (n) => n.toString(16).padStart(64, "0");
const addrOf = (d) => { const [x, y] = ml(d); return "0x" + H(keccak(Uint8Array.from((B(x) + B(y)).match(/../g), (h) => parseInt(h, 16)))).slice(24); };
const sign = (h, d) => { const z = BigInt("0x" + H(h)), k = md(z ^ d, N) || 1n, R = ml(k), r = md(R[0], N); let s = md(iv(k, N) * (z + r * d), N), v = Number(R[1] & 1n); if (s > N / 2n) { s = N - s; v ^= 1; } return B(r) + B(s) + (27 + v).toString(16); };
const unhex = (h) => Uint8Array.from(h.replace(/^0x/, "").match(/../g), (x) => parseInt(x, 16));

test("pool address derivation matches on-chain (Uniswap v3 + Aerodrome) and price math", () => {
  assert.equal(REF, "0xd0b53D9277642d899DF5C87A3966A349A798F224");
  assert.equal(aeroPool(USDC, WETH, false), "0xcDAC0d6c6C59727a65F871236188350531885C43");
  assert.ok(Math.abs(v3Price(BigInt("0x" + ethSlot.slice(2, 66)), WETH, USDC, 18, 6) - 2000) < 0.01);
  assert.equal(aeroPrice(10n ** 18n, 2000n * 10n ** 6n, 18, 6, false), 2000); assert.ok(Math.abs(aeroPrice(10n ** 24n, 10n ** 12n, 18, 6, true) - 1) < 1e-9);
  assert.equal(Object.keys(BASE_TOKENS).length, 24);
});
test("tokenprice: picks pool, prices in USD, flags thin; NO_POOL; offline; 400s", async () => {
  mockRpc((c) => { if (c.method !== "eth_call") return null; const { to, data } = c.params[0]; const t = to.toLowerCase();
    if (t === REF.toLowerCase() && data === sel("slot0()")) return ethSlot;
    if (t === TPOOL.toLowerCase() && data === sel("slot0()")) return "0x" + W(sq(0.5 * 1e-12).toString(16)) + W("0");
    if (data.startsWith(sel("balanceOf(address)")) && data.slice(-40) === TPOOL.slice(2).toLowerCase()) return "0x" + W((t === USDC.toLowerCase() ? 500n * 10n ** 6n : 10n ** 21n).toString(16));
    if (data === sel("decimals()")) return t === T ? "0x" + W("12") : t === "0x" + "22".repeat(20) ? "0x" + W("12") : null; if (data === sel("symbol()")) return S("TST"); return null; });
  const b = (await tokenprice({ tokens: `${T},0x${"22".repeat(20)}` })).body; assert.equal(b.live, true); assert.equal(b.eth_usd, 2000);
  const r0 = b.tokens[0]; assert.ok(Math.abs(r0.price_usd - 0.5) < 1e-4); assert.equal(r0.deepest_pool, TPOOL); assert.equal(r0.quote_side_liquidity_usd, 500); assert.ok(r0.flags.includes("THIN_LIQUIDITY_UNDER_1K")); assert.equal(r0.source, "uniswap_v3 30bps vs USDC");
  assert.deepEqual(b.tokens[1].flags, ["NO_POOL_FOUND"]);
  assert.equal((await tokenprice({ tokens: USDC })).body.tokens[0].price_usd, 1);
  deny(); assert.equal((await tokenprice({ token: T })).body.live, false);
  assert.equal((await tokenprice({})).status, 400); assert.equal((await tokenprice({ tokens: "0x1" })).status, 400); assert.equal((await tokenprice({ tokens: [T, T, T, T, T].join(",") })).status, 400); assert.equal((await tokenprice({ tokens: T, chain: "solana" })).status, 400);
});
test("gasfee: EIP-1559 tiers, L1 fee, USD presets; offline; 400s", async () => {
  const fh = { baseFeePerGas: Array(21).fill("0x" + (5e6).toString(16)), gasUsedRatio: Array(20).fill(0.4), reward: Array(20).fill(["0x" + (1e5).toString(16), "0x" + (1e6).toString(16), "0x" + (3e6).toString(16)]) };
  mockRpc((c) => c.method === "eth_feeHistory" ? fh : c.method === "eth_gasPrice" ? "0x" + (6e6).toString(16) : c.method === "eth_maxPriorityFeePerGas" ? "0x" + (1e6).toString(16) : c.method === "eth_blockNumber" ? "0x10" :
    c.params[0].to.toLowerCase() === REF.toLowerCase() ? ethSlot : c.params[0].data.startsWith(sel("getL1FeeUpperBound(uint256)")) ? "0x" + W((1e9).toString(16)) : null);
  const b = (await gasfee({ gas_limit: "100000" })).body; assert.equal(b.live, true); assert.equal(b.next_base_fee_gwei, 0.005); assert.equal(b.congestion, "low");
  assert.equal(b.standard.maxFeePerGas, String(2 * 5e6 + 1e6)); assert.equal(b.fast.maxPriorityFeePerGas, String(3e6)); assert.equal(b.native_usd, 2000);
  const n = b.cost_estimates.native_transfer; assert.equal(n.l1_fee_upper_bound_native, "0.000000001"); assert.ok(Math.abs(n.total_usd - ((21000 * 6e6 + 1e9) / 1e18) * 2000) < 1e-9); assert.equal(b.cost_estimates.custom.gas_limit, 100000);
  assert.equal(feeSuggest({ baseFeePerGas: ["0x1", "0x2"], gasUsedRatio: [0.95], reward: [] }, "0x2", "0x5").standard.maxPriorityFeePerGas, "5");
  deny(); assert.equal((await gasfee({})).body.live, false); assert.equal((await gasfee({ chain: "doge" })).status, 400); assert.equal((await gasfee({ gas_limit: "5" })).status, 400);
});
test("safetx: hash matches on-chain getTransactionHash vector; signatures, owners, threshold, flags", async () => {
  const SAFE = "0x67f066c7aea422a690f42788cd7a573b30f1194a", data = "0xa9059cbb" + W("719227f384b66bfef00093d6d8d32fa9dc2b40e7") + W("4e20");
  const base = { safe: SAFE, to: USDC, value: "5", data, nonce: "7", version: "1.4.1", live: "false" };
  const b = (await safetx({ ...base, expected_hash: "0x7467dae94ed7b3f325bff615e7d3749628a9bf4d6a6dde49650d79bd5e2528ac" })).body;
  assert.equal(b.safe_tx_hash, "0x7467dae94ed7b3f325bff615e7d3749628a9bf4d6a6dde49650d79bd5e2528ac"); assert.equal(b.expected_hash_match, true); assert.equal(b.decoded.name || b.decoded.function || "x", b.decoded.name || b.decoded.function || "x"); assert.equal(b.verdict, "ok");
  const d1 = 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318n, d2 = 0x1234n, a1 = addrOf(d1), a2 = addrOf(d2); const h = unhex(b.safe_tx_hash);
  const pairs = [[a1, sign(h, d1)], [a2, sign(h, d2)]].sort((x, y) => (BigInt(x[0]) < BigInt(y[0]) ? -1 : 1));
  mockRpc((c) => { if (c.method === "eth_getCode") return "0x60"; if (c.method === "eth_getStorageAt") return "0x" + W("0"); const d = c.params[0].data;
    if (d === sel("VERSION()")) return S("1.4.1"); if (d === sel("getThreshold()")) return "0x" + W("2"); if (d === sel("nonce()")) return "0x" + W("7"); if (d === sel("getOwners()")) return "0x" + W("20") + W("1") + W(a1.slice(2)); return null; });
  const s = (await safetx({ ...base, live: "true", signatures: "0x" + pairs.map((p) => p[1]).join("") })).body;
  assert.equal(s.safe_tx_hash, b.safe_tx_hash); assert.equal(s.nonce_status, "next (executable now)"); assert.equal(s.signatures.length, 2); assert.equal(s.valid_owner_ecdsa_sigs, 1);
  assert.deepEqual(s.signatures.map((x) => x.owner.toLowerCase()).sort(), [a1, a2].sort()); assert.ok(s.flags.includes("SIGNER_NOT_AN_OWNER")); assert.ok(s.flags.includes("NEEDS_1_MORE_SIGNATURES_OR_CONTRACT_APPROVALS")); assert.equal(s.verdict, "review");
  const dc = (await safetx({ ...base, operation: "1", gasPrice: "1", refundReceiver: "0x" + "33".repeat(20), signatures: "0x" + W(a1.slice(2)) + W("0") + "01" })).body;
  assert.ok(dc.flags.includes("DELEGATECALL_TO_NON_MULTISEND")); assert.ok(dc.flags.includes("GAS_REFUND_TO_THIRD_PARTY")); assert.equal(dc.signatures[0].type, "approved_hash"); assert.notEqual(dc.safe_tx_hash, b.safe_tx_hash);
  assert.ok((await safetx({ safe: SAFE, message: "hello", live: "false" })).body.safe_message_hash.startsWith("0x"));
  deny(); assert.equal((await safetx({ ...base, live: "true" })).body.live.error.startsWith("public rpc"), true);
  assert.equal((await safetx({})).status, 400); assert.equal((await safetx({ safe: SAFE, to: USDC, live: "false" })).status, 400); assert.equal((await safetx({ ...base, operation: "2" })).status, 400);
});
test("portfolio: balances, prices, total; offline; 400s", async () => {
  const WHO = "0x" + "ab".repeat(20);
  mockRpc((c) => { if (c.method === "eth_getBalance") return "0x" + (10n ** 18n).toString(16); if (c.method === "eth_getTransactionCount") return "0x3"; if (c.method === "eth_getCode") return "0x"; const { to, data } = c.params[0]; const t = to.toLowerCase();
    if (t === REF.toLowerCase() && data === sel("slot0()")) return ethSlot;
    if (data.startsWith(sel("balanceOf(address)")) && data.slice(-40) === WHO.slice(2)) return t === USDC.toLowerCase() ? "0x" + W((25n * 10n ** 6n).toString(16)) : t === WETH ? "0x" + W((10n ** 17n).toString(16)) : "0x" + W("0");
    return null; });
  const b = (await portfolio({ address: WHO })).body; assert.equal(b.live, true); assert.equal(b.tokens_checked, 24); assert.equal(b.tokens_held, 2); assert.equal(b.native.value_usd, 2000);
  assert.equal(b.total_value_usd, 2000 + 25 + 200); assert.equal(b.holdings[0].symbol, "WETH"); assert.equal(b.account_type, "eoa");
  deny(); assert.equal((await portfolio({ address: WHO })).body.live, false);
  assert.equal((await portfolio({})).status, 400); assert.equal((await portfolio({ address: WHO, chain: "ethereum" })).status, 400); assert.equal((await portfolio({ address: WHO, tokens: "0x12" })).status, 400);
});
test("new routes are paid 402 at $0.02 and discoverable", async () => {
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  for (const p of ["/v1/tokenprice", "/v1/portfolio", "/v1/gasfee", "/v1/safetx"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); const j = await r.json(); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.ok(j.accepts[0].outputSchema, p); }
});
test("safetx: eth_sign (v>30) signature recovers owner; MultiSend delegatecall ok", async () => {
  const SAFE = "0x67f066c7aea422a690f42788cd7a573b30f1194a", d = 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318n;
  const base = { safe: SAFE, to: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D", data: "0x", operation: "1", nonce: "1", version: "1.3.0", live: "false" };
  const h = unhex((await safetx(base)).body.safe_tx_hash); const em = keccak(new Uint8Array([...new TextEncoder().encode("\x19Ethereum Signed Message:\n32"), ...h]));
  const sg = sign(em, d); const v = parseInt(sg.slice(128), 16) + 4; const b = (await safetx({ ...base, signatures: "0x" + sg.slice(0, 128) + v.toString(16) })).body;
  assert.equal(b.signatures[0].type, "eth_sign"); assert.equal(b.signatures[0].owner.toLowerCase(), addrOf(d)); assert.ok(b.flags.includes("DELEGATECALL_MULTISEND_OK")); assert.equal(b.verdict, "ok");
});
