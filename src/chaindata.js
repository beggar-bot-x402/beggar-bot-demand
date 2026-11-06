// Sticky on-chain data pack 3: /v1/tokenprice (on-chain DEX spot price: Uniswap v3 + Aerodrome pools, CREATE2-derived, no indexer),
// /v1/gasfee (EIP-1559 fee suggestion + OP-stack L1 fee + USD cost presets), /v1/safetx (Safe tx hash / signature / owner-threshold check),
// /v1/portfolio (wallet token holdings across a curated Base token list + USD value). Keyless public RPC (one or two batch subrequests, fails soft).
import { keccak, keccakHex, checksum } from "./evm.js";
import { create2Address } from "./aa.js";
import { rpcBatch, LABELS } from "./walletintel.js";
import { decodeStr, fmtUnits, batchdecode } from "./onchain.js";
import { recover, HALF_N } from "./secp.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const unhex = (h) => Uint8Array.from(String(h).replace(/^0x/, "").match(/../g) || [], (x) => parseInt(x, 16));
const H = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const w32 = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
const aw = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);
const label = (a) => LABELS[String(a).toLowerCase()] || null;
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const r6 = (x) => (x == null || !isFinite(x) ? null : Number(x.toPrecision(6)));
const S_SLOT0 = sel("slot0()"), S_BAL = sel("balanceOf(address)"), S_RES = sel("getReserves()"), S_DEC = sel("decimals()"), S_SYM = sel("symbol()");
// ---- DEX venues (addresses verified on-chain 2026-11-01: computed pool == factory.getPool) ----
const UNI_INIT = unhex("e34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54");
const AERO_FACTORY = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da", AERO_IMPL = "a4e46b4f701c62e14df11b48dce76a7d793cd6d7";
const AERO_INIT = keccak(unhex("3d602d80600a3d3981f3363d3d373d3d3d363d73" + AERO_IMPL + "5af43d82803e903d91602b57fd5bf3"));
export const VENUES = {
  base: { uni: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", aero: true, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", weth: "0x4200000000000000000000000000000000000006" },
  ethereum: { uni: "0x1F98431c8aD98523631AE4a59f267346ea31F984", aero: false, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" },
};
const FEES = [100, 500, 3000, 10000];
const sort2 = (a, b) => (a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]);
export const uniPool = (factory, a, b, fee) => { const [t0, t1] = sort2(a, b); return create2Address(factory, keccak(unhex(aw(t0) + aw(t1) + w32(fee))), UNI_INIT); };
export const aeroPool = (a, b, stable) => { const [t0, t1] = sort2(a, b); return create2Address(AERO_FACTORY, keccak(unhex(t0.slice(2) + t1.slice(2) + (stable ? "01" : "00"))), AERO_INIT); };
// price of `token` in `quote` units from Uniswap v3 sqrtPriceX96
export function v3Price(sqrtX96, token, quote, decT, decQ) { const p = (Number(sqrtX96) / 2 ** 96) ** 2; const tIs0 = token.toLowerCase() < quote.toLowerCase(); const raw = tIs0 ? p : 1 / p; return raw * 10 ** (decT - decQ); }
// Aerodrome volatile (x*y=k) or stable (x3y+xy3=k) marginal price of token in quote
export function aeroPrice(rT, rQ, decT, decQ, stable) { const x = Number(rT) / 10 ** decT, y = Number(rQ) / 10 ** decQ; if (!x || !y) return null; return stable ? (3 * x * x * y + y ** 3) / (x ** 3 + 3 * x * y * y) : y / x; }
const CHAINS = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return ({ base: "base", "8453": "base", "eip155:8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", "eip155:1": "ethereum" })[s] || null; };
// Builds the pool-read calls for tokens; returns {calls, plan}. One batch subrequest.
function pricePlan(chain, tokens) {
  const v = VENUES[chain], calls = [], plan = [];
  const ref = uniPool(v.uni, v.weth, v.usdc, 500); const refI = calls.length; calls.push(call(ref, S_SLOT0));
  for (const t of tokens) {
    const p = { token: t, dec: calls.length, pools: [] }; calls.push(call(t, S_DEC), call(t, S_SYM));
    for (const [qn, q] of [["USDC", v.usdc], ["WETH", v.weth]]) { if (q.toLowerCase() === t.toLowerCase()) continue;
      for (const fee of FEES) { const pool = uniPool(v.uni, t, q, fee); p.pools.push({ venue: "uniswap_v3", fee, quote: qn, q, pool, i: calls.length }); calls.push(call(pool, S_SLOT0), call(t, S_BAL + aw(pool)), call(q, S_BAL + aw(pool))); }
      if (v.aero) for (const stable of [false, true]) { const pool = aeroPool(t, q, stable); p.pools.push({ venue: stable ? "aerodrome_stable" : "aerodrome_volatile", quote: qn, q, pool, i: calls.length }); calls.push(call(pool, S_RES)); } }
    plan.push(p);
  }
  return { calls, plan, refI, ref };
}
// compute price rows from batch results
function priceRows(r, plan, refI, chain) { const v = VENUES[chain]; const s0 = r[refI]; const eth = s0 && s0.length >= 66 && big(s0.slice(0, 66)) ? v3Price(big(s0.slice(0, 66)), v.weth, v.usdc, 18, 6) : null; return { eth_usd: r6(eth), rows: rowsFor(r, plan, chain, eth) }; }
function rowsFor(r, plan, chain, eth) {
  const v = VENUES[chain], qUsd = { USDC: 1, WETH: eth };
  return plan.map((p) => {
    const decH = r[p.dec], dec = decH && decH !== "0x" ? Number(big(decH)) : null, sym = decodeStr(r[p.dec + 1]);
    const o = { token: checksum(p.token), symbol: sym, decimals: dec, label: label(p.token) };
    if (p.token.toLowerCase() === v.usdc.toLowerCase()) return { ...o, price_usd: 1, source: "reference (native USDC, $1 peg assumed)", flags: [], pools: [] };
    if (dec == null || dec > 36) return { ...o, price_usd: null, flags: ["NO_DECIMALS_NOT_ERC20"], pools: [] };
    const pools = [];
    for (const q of p.pools) { const dq = q.quote === "USDC" ? 6 : 18; let price = null, depthQ = 0;
      if (q.venue === "uniswap_v3") { const s = r[q.i]; if (!s || s.length < 66) continue; const sq = big(s.slice(0, 66)); if (!sq) continue; price = v3Price(sq, p.token, q.q, dec, dq); depthQ = Number(big(r[q.i + 2])) / 10 ** dq; }
      else { const x = r[q.i]; if (!x || x.length < 130) continue; const r0 = big("0x" + x.slice(2, 66)), r1 = big("0x" + x.slice(66, 130)); if (!r0 || !r1) continue; const tIs0 = p.token.toLowerCase() < q.q.toLowerCase(); const [rT, rQ] = tIs0 ? [r0, r1] : [r1, r0]; price = aeroPrice(rT, rQ, dec, dq, q.venue.endsWith("stable")); depthQ = Number(rQ) / 10 ** dq; }
      const usd = qUsd[q.quote] != null && price != null ? price * qUsd[q.quote] : null, depthUsd = qUsd[q.quote] != null ? depthQ * qUsd[q.quote] : null;
      pools.push({ venue: q.venue, ...(q.fee ? { fee_bps: q.fee / 100 } : {}), quote: q.quote, pool: q.pool, price_in_quote: r6(price), price_usd: r6(usd), quote_side_liquidity_usd: depthUsd == null ? null : Math.round(depthUsd) }); }
    pools.sort((a, b) => (b.quote_side_liquidity_usd || 0) - (a.quote_side_liquidity_usd || 0));
    const best = pools.find((x) => x.price_usd != null);
    if (!best) return { ...o, price_usd: null, flags: ["NO_POOL_FOUND"], pools, note: "no Uniswap v3" + (v.aero ? "/Aerodrome" : "") + " pool vs USDC/WETH: illiquid, wrong chain or not a token" };
    const deep = pools.filter((x) => x.price_usd != null && (x.quote_side_liquidity_usd || 0) >= Math.max(1000, (best.quote_side_liquidity_usd || 0) * 0.1));
    const spread = deep.length > 1 ? (Math.max(...deep.map((x) => x.price_usd)) / Math.min(...deep.map((x) => x.price_usd)) - 1) * 100 : 0;
    const f = []; if ((best.quote_side_liquidity_usd || 0) < 1000) f.push("THIN_LIQUIDITY_UNDER_1K"); else if (best.quote_side_liquidity_usd < 25000) f.push("LOW_LIQUIDITY_UNDER_25K");
    if (spread > 3) f.push("POOL_PRICE_DIVERGENCE_OVER_3PCT");
    return { ...o, price_usd: best.price_usd, source: best.venue + (best.fee_bps ? " " + best.fee_bps + "bps" : "") + " vs " + best.quote, deepest_pool: best.pool, quote_side_liquidity_usd: best.quote_side_liquidity_usd, cross_pool_spread_pct: r6(spread), flags: f, confidence: f.length ? "low" : deep.length > 1 ? "high" : "medium", pools: pools.slice(0, 8) };
  });
}
// ---- 1. /v1/tokenprice ----
export async function tokenprice(a) {
  const toks = list(a.tokens ?? a.token ?? a.address); if (!toks.length) return bad("token (or tokens, ≤4 comma list) required");
  if (toks.length > 4) return bad("≤4 tokens per call"); const badA = toks.find((t) => !isA(t)); if (badA) return bad("invalid address: " + badA);
  const chain = CHAINS(a.chain || a.network); if (!chain) return bad("chain: base (default) or ethereum");
  const { calls, plan, refI } = pricePlan(chain, toks);
  try { const { results, rpc } = await rpcBatch(chain, calls); const { eth_usd, rows } = priceRows(results, plan, refI, chain);
    return { status: 200, body: { chain, live: true, rpc, method: "spot price from on-chain pool state (Uniswap v3 slot0" + (VENUES[chain].aero ? ", Aerodrome getReserves" : "") + "), deepest pool by quote-side liquidity; not a TWAP", eth_usd, count: rows.length, tokens: rows } };
  } catch (e) { return { status: 200, body: { chain, live: false, rpc_error: String(e.message || e).slice(0, 160), note: "public RPC unreachable; retry", tokens: toks.map((t) => ({ token: checksum(t), label: label(t) })) } }; }
}
// ---- 2. /v1/gasfee ----
const GPO = "0x420000000000000000000000000000000000000F";
const FEE_CHAINS = { base: { op: true, native: "ETH" }, optimism: { op: true, native: "ETH" }, "base-sepolia": { op: true, native: "ETH", testnet: true }, ethereum: { native: "ETH" }, arbitrum: { native: "ETH" }, polygon: { native: "POL" } };
const FEE_ALIAS = { "8453": "base", "eip155:8453": "base", "10": "optimism", op: "optimism", "84532": "base-sepolia", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "eip155:1": "ethereum", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
export const PRESETS = { native_transfer: [21000, 110], erc20_transfer: [65000, 180], usdc_eip3009_transfer: [90000, 400], erc20_approve: [46000, 180], uniswap_swap: [180000, 700], safe_exec: [120000, 600], nft_mint: [150000, 300] };
const gwei = (w) => r6(Number(w) / 1e9);
const median = (xs) => { const s = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); return s.length ? s[Math.floor(s.length / 2)] : 0n; };
export function feeSuggest(fh, gasPrice, prioHint) {
  const bases = (fh.baseFeePerGas || []).map(big), next = bases[bases.length - 1] || big(gasPrice), rew = fh.reward || [];
  const tier = (i) => median(rew.map((r) => big(r[i])).filter((x) => x > 0n)) || (i === 1 ? big(prioHint) : 0n);
  let [slow, std, fast] = [tier(0), tier(1), tier(2)]; const hint = big(prioHint); if (std < hint) std = hint; if (fast < std) fast = std; if (slow > std) slow = std;
  const util = (fh.gasUsedRatio || []).reduce((s, x) => s + x, 0) / Math.max(1, (fh.gasUsedRatio || []).length);
  const mk = (p, m) => ({ maxPriorityFeePerGas: p.toString(), maxFeePerGas: (next * m + p).toString(), maxPriorityFeePerGas_gwei: gwei(p), maxFeePerGas_gwei: gwei(next * m + p), expected_gas_price_gwei: gwei(next + p) });
  return { next_base_fee: next.toString(), next_base_fee_gwei: gwei(next), base_fee_trend: bases.length > 2 ? (next > bases[0] ? "rising" : next < bases[0] ? "falling" : "flat") : null, avg_block_utilization: r6(util), congestion: util > 0.9 ? "high" : util > 0.5 ? "normal" : "low", slow: mk(slow, 1n), standard: mk(std, 2n), fast: mk(fast, 2n), _exp: { slow: next + slow, standard: next + std, fast: next + fast } };
}
export async function gasfee(a) {
  const s = String(a.chain || a.network || "base").trim().toLowerCase(); const chain = FEE_CHAINS[s] ? s : FEE_ALIAS[s]; if (!chain) return bad("chain: base (default), optimism, base-sepolia, ethereum, arbitrum, polygon");
  const cfg = FEE_CHAINS[chain]; let gl = a.gas_limit ?? a.gas; if (gl != null && gl !== "") { gl = Number(gl); if (!Number.isInteger(gl) || gl < 21000 || gl > 30000000) return bad("gas_limit must be an integer 21000..30000000"); } else gl = null;
  let tb = a.tx_bytes != null && a.tx_bytes !== "" ? Number(a.tx_bytes) : null; if (tb != null && (!Number.isInteger(tb) || tb < 50 || tb > 131072)) return bad("tx_bytes must be an integer 50..131072");
  const presets = { ...PRESETS, ...(gl ? { custom: [gl, tb || 300] } : {}) };
  const calls = [["eth_feeHistory", ["0x14", "latest", [10, 50, 90]]], ["eth_gasPrice", []], ["eth_maxPriorityFeePerGas", []], ["eth_blockNumber", []]];
  const l1i = calls.length; if (cfg.op) for (const [, [, bytes]] of Object.entries(presets)) calls.push(call(GPO, sel("getL1FeeUpperBound(uint256)") + w32(bytes)));
  const usePrice = !cfg.testnet && cfg.native === "ETH", ref = uniPool(VENUES.base.uni, VENUES.base.weth, VENUES.base.usdc, 500);
  if (usePrice && chain === "base") calls.push(call(ref, S_SLOT0));
  let r, rpc; try { ({ results: r, rpc } = await rpcBatch(chain, calls)); } catch (e) { return { status: 200, body: { chain, live: false, rpc_error: String(e.message || e).slice(0, 160), note: "public RPC unreachable; retry" } }; }
  let ethS = chain === "base" && usePrice ? r[calls.length - 1] : null;
  if (usePrice && chain !== "base") { try { ethS = (await rpcBatch("base", [call(ref, S_SLOT0)])).results[0]; } catch {} }
  const eth = ethS && ethS.length >= 66 && big(ethS.slice(0, 66)) ? v3Price(big(ethS.slice(0, 66)), VENUES.base.weth, VENUES.base.usdc, 18, 6) : null;
  if (!r[0]) return { status: 200, body: { chain, live: true, rpc, gas_price_gwei: r[1] ? gwei(big(r[1])) : null, note: "eth_feeHistory unavailable on this RPC; legacy gasPrice only" } };
  const sug = feeSuggest(r[0], r[1], r[2] || "0x0"); const exp = sug._exp; delete sug._exp;
  const costs = {}; Object.entries(presets).forEach(([k, [g, bytes]], i) => {
    const l2 = BigInt(g) * exp.standard, l1 = cfg.op && r[l1i + i] ? big(r[l1i + i]) : 0n, tot = l2 + l1;
    costs[k] = { gas_limit: g, ...(cfg.op ? { tx_bytes_assumed: bytes, l1_fee_upper_bound_native: fmtUnits(l1, 18) } : {}), execution_fee_native: fmtUnits(l2, 18), total_native: fmtUnits(tot, 18), total_usd: eth != null ? r6((Number(tot) / 1e18) * eth) : null, fast_total_usd: eth != null ? r6((Number(BigInt(g) * exp.fast + l1) / 1e18) * eth) : null };
  });
  return { status: 200, body: { chain, live: true, rpc, block: r[3] ? Number(big(r[3])) : null, native: cfg.native, native_usd: r6(eth), price_source: eth != null ? "Uniswap v3 WETH/USDC 5bps (Base) slot0" : null, gas_price_gwei: r[1] ? gwei(big(r[1])) : null, node_priority_hint_gwei: r[2] ? gwei(big(r[2])) : null, ...sug, eip1559_tx_fields: { maxFeePerGas: "0x" + BigInt(sug.standard.maxFeePerGas).toString(16), maxPriorityFeePerGas: "0x" + BigInt(sug.standard.maxPriorityFeePerGas).toString(16) }, cost_estimates: costs, ...(cfg.op ? { l1_note: "OP-stack L1 data fee via GasPriceOracle.getL1FeeUpperBound (upper bound; real fee usually lower)" } : {}) } };
}
// ---- 3. /v1/safetx ----
const T_DOMAIN_CHAIN = keccakHex("EIP712Domain(uint256 chainId,address verifyingContract)"), T_DOMAIN_OLD = keccakHex("EIP712Domain(address verifyingContract)");
const T_SAFETX = keccakHex("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)");
const T_SAFEMSG = keccakHex("SafeMessage(bytes message)");
const CHAIN_IDS = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137, "base-sepolia": 84532 };
const ZERO = "0x0000000000000000000000000000000000000000";
const MULTISEND = new Set(["0x38869bf66a61cf6bdb996a6ae40d5853fd43b526", "0x9641d764fc13c8b624c04430c7356c1c7c8102e2", "0x40a2accbd92bca938b02010e17a5b8929b49130d", "0xa238cbeb142c10ef7ad8442c6d1f9e89e07e7761", "0xa1dabef33b3b82c7814b6d82a79e50f4ac44102b", "0x8d29be29923b68abfdd21e541b9374737b49cdad", "0x998739bfdaadde7c933b942a68053933098f9eda", "0x40a2accbd92bca938b02010e17a5b8929b49130d"]);
const verCmp = (v) => { const m = String(v || "").match(/(\d+)\.(\d+)\.(\d+)/); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : null; };
export function safeDomain(safe, chainId, version) { const old = verCmp(version) != null && verCmp(version) < 10300; return keccak(unhex(old ? T_DOMAIN_OLD.slice(2) + aw(safe) : T_DOMAIN_CHAIN.slice(2) + w32(chainId) + aw(safe))); }
export function safeTxHash(safe, chainId, version, t) {
  const sh = keccak(unhex(T_SAFETX.slice(2) + aw(t.to) + w32(t.value) + H(keccak(unhex(t.data))).slice(2) + w32(t.operation) + w32(t.safeTxGas) + w32(t.baseGas) + w32(t.gasPrice) + aw(t.gasToken) + aw(t.refundReceiver) + w32(t.nonce)));
  const dom = safeDomain(safe, chainId, version); return { domain_separator: H(dom), safe_tx_struct_hash: H(sh), safe_tx_hash: H(keccak(cat(new Uint8Array([0x19, 0x01]), dom, sh))) };
}
const te = new TextEncoder();
export function parseSafeSigs(sigHex, hash) {
  const b = unhex(sigHex), out = []; const h = unhex(hash); const n = Math.floor(b.length / 65);
  for (let i = 0; i < n && i < 50; i++) { const s = b.subarray(i * 65, i * 65 + 65), r = BigInt(H(s.subarray(0, 32))), ss = BigInt(H(s.subarray(32, 64))), v = s[64];
    if (v === 0) { out.push({ type: "contract_signature_eip1271", owner: checksum("0x" + H(s.subarray(12, 32)).slice(2)), data_offset: Number(ss), note: "validated on-chain by owner contract isValidSignature; not checked offline" }); continue; }
    if (v === 1) { out.push({ type: "approved_hash", owner: checksum("0x" + H(s.subarray(12, 32)).slice(2)), note: "valid only if owner called approveHash(safeTxHash) or is msg.sender" }); continue; }
    try { let dig = h, par, type = "ecdsa"; if (v > 30) { type = "eth_sign"; dig = keccak(cat(te.encode("\x19Ethereum Signed Message:\n32"), h)); par = v - 31; } else par = v - 27;
      if (par !== 0 && par !== 1) { out.push({ type: "invalid", v, error: "bad v" }); continue; }
      const [x, y] = recover(dig, r, ss, par); const addr = checksum("0x" + H(keccak(unhex(x.toString(16).padStart(64, "0") + y.toString(16).padStart(64, "0")))).slice(-40));
      out.push({ type, owner: addr, v, ...(ss > HALF_N ? { warning: "high-s (malleable)" } : {}) }); } catch (e) { out.push({ type: "invalid", v, error: String(e.message || e) }); } }
  const trailing = b.length - n * 65; return { sigs: out, extra_bytes: trailing };
}
const numS = (v, d = "0") => { const s = String(v ?? d).trim(); if (!/^(0x[0-9a-f]+|\d+)$/i.test(s)) throw new Error("bad number: " + s.slice(0, 40)); return BigInt(s); };
export async function safetx(a) {
  const t0 = a.tx && typeof a.tx === "object" ? { ...a, ...a.tx } : a;
  const safe = String(t0.safe || t0.safe_address || "").trim(); if (!isA(safe)) return bad("safe (Safe address) required; plus to, value?, data?, operation?, nonce, safeTxGas?, baseGas?, gasPrice?, gasToken?, refundReceiver?");
  const cs = String(t0.chain || t0.network || "base").trim().toLowerCase(); const chain = CHAIN_IDS[cs] ? cs : ({ "8453": "base", "1": "ethereum", mainnet: "ethereum", eth: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon", "84532": "base-sepolia" })[cs]; if (!chain) return bad("chain: base (default), ethereum, optimism, arbitrum, polygon, base-sepolia");
  const isMsg = t0.message != null || t0.message_hash != null;
  let tx; if (!isMsg) { try { tx = { to: String(t0.to || ""), value: numS(t0.value), data: String(t0.data || "0x"), operation: Number(numS(t0.operation)), safeTxGas: numS(t0.safeTxGas ?? t0.safe_tx_gas), baseGas: numS(t0.baseGas ?? t0.base_gas ?? t0.dataGas), gasPrice: numS(t0.gasPrice ?? t0.gas_price), gasToken: String(t0.gasToken || t0.gas_token || ZERO), refundReceiver: String(t0.refundReceiver || t0.refund_receiver || ZERO), nonce: t0.nonce == null || t0.nonce === "" ? null : numS(t0.nonce) }; } catch (e) { return bad(e.message); }
    if (!isA(tx.to) || !isA(tx.gasToken) || !isA(tx.refundReceiver)) return bad("to / gasToken / refundReceiver must be addresses"); if (!/^0x([0-9a-fA-F]{2})*$/.test(tx.data) || tx.data.length > 200000) return bad("data must be 0x hex (≤100KB)"); if (tx.operation !== 0 && tx.operation !== 1) return bad("operation must be 0 (CALL) or 1 (DELEGATECALL)"); }
  const sigHex = t0.signatures || t0.signature; if (sigHex && !/^0x([0-9a-fA-F]{2})*$/.test(String(sigHex))) return bad("signatures must be 0x hex (concatenated 65-byte sigs)");
  // live Safe state (fails soft)
  let live = null; if (String(t0.live ?? "true") !== "false") { try { const { results: r, rpc } = await rpcBatch(chain, [call(safe, sel("VERSION()")), call(safe, sel("getThreshold()")), call(safe, sel("nonce()")), call(safe, sel("getOwners()")), ["eth_getStorageAt", [safe, "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8", "latest"]], ["eth_getCode", [safe, "latest"]]]);
      const ownersRaw = r[3]; let owners = null; if (ownersRaw && ownersRaw.length >= 130) { const x = ownersRaw.slice(2); const n = Number(BigInt("0x" + x.slice(64, 128))); owners = []; for (let i = 0; i < n && i < 100; i++) owners.push(checksum("0x" + x.slice(128 + i * 64 + 24, 128 + i * 64 + 64))); }
      live = { rpc, is_contract: !!(r[5] && r[5] !== "0x"), version: decodeStr(r[0]), threshold: r[1] && r[1] !== "0x" ? Number(big(r[1])) : null, nonce: r[2] && r[2] !== "0x" ? big(r[2]).toString() : null, owners, guard: r[4] && big(r[4]) ? checksum("0x" + r[4].slice(-40)) : null };
    } catch (e) { live = { error: String(e.message || e).slice(0, 160) }; } }
  const version = t0.version || live?.version || "1.3.0"; const cid = CHAIN_IDS[chain]; const flags = [];
  let out;
  if (isMsg) { let mh; if (t0.message_hash) { if (!/^0x[0-9a-fA-F]{64}$/.test(t0.message_hash)) return bad("message_hash must be 32-byte hex"); mh = unhex(t0.message_hash); } else { const m = String(t0.message); const mb = /^0x([0-9a-fA-F]{2})+$/.test(m) ? unhex(m) : te.encode(m); mh = keccak(cat(te.encode("\x19Ethereum Signed Message:\n" + mb.length), mb)); }
    const dom = safeDomain(safe, cid, version), sh = keccak(unhex(T_SAFEMSG.slice(2) + H(keccak(mh)).slice(2))); out = { kind: "safe_message", message_hash: H(mh), domain_separator: H(dom), safe_message_hash: H(keccak(cat(new Uint8Array([0x19, 0x01]), dom, sh))) }; }
  else { if (tx.nonce == null) { if (live?.nonce) tx.nonce = BigInt(live.nonce); else return bad("nonce required (or reachable live Safe)"); }
    const hs = safeTxHash(safe, cid, version, tx); let inner = null; if (tx.data.length > 2) { const d = await batchdecode({ data: tx.data, to: tx.to }); if (d.status === 200) inner = { ...d.body.root, flags: d.body.flags }; }
    out = { kind: "safe_tx", ...hs, tx: { to: checksum(tx.to), to_label: label(tx.to), value: tx.value.toString(), value_native: fmtUnits(tx.value, 18), data_bytes: (tx.data.length - 2) / 2, operation: tx.operation ? "DELEGATECALL" : "CALL", safeTxGas: tx.safeTxGas.toString(), baseGas: tx.baseGas.toString(), gasPrice: tx.gasPrice.toString(), gasToken: checksum(tx.gasToken), refundReceiver: checksum(tx.refundReceiver), nonce: tx.nonce.toString() }, ...(inner ? { decoded: inner } : {}) };
    if (tx.operation === 1 && !MULTISEND.has(tx.to.toLowerCase())) flags.push("DELEGATECALL_TO_NON_MULTISEND"); if (tx.operation === 1 && MULTISEND.has(tx.to.toLowerCase())) flags.push("DELEGATECALL_MULTISEND_OK");
    if (tx.gasPrice > 0n && tx.refundReceiver.toLowerCase() !== ZERO) flags.push("GAS_REFUND_TO_THIRD_PARTY"); if (inner?.flags?.length) flags.push(...inner.flags.map((f) => "INNER_" + f));
    if (t0.expected_hash || t0.safeTxHash || t0.contractTransactionHash) { const e = String(t0.expected_hash || t0.safeTxHash || t0.contractTransactionHash).toLowerCase(); out.expected_hash_match = e === hs.safe_tx_hash; if (!out.expected_hash_match) flags.push("HASH_MISMATCH_CHECK_VERSION_CHAIN_OR_FIELDS"); }
    if (live?.nonce != null) { const ln = BigInt(live.nonce); out.nonce_status = tx.nonce < ln ? "stale (already used; tx executed or replaced)" : tx.nonce === ln ? "next (executable now)" : `queued (${(tx.nonce - ln).toString()} ahead)`; if (tx.nonce < ln) flags.push("STALE_NONCE"); } }
  const hashForSig = out.safe_tx_hash || out.safe_message_hash;
  if (sigHex && sigHex.length > 2) { const p = parseSafeSigs(sigHex, hashForSig); out.signatures = p.sigs; if (p.extra_bytes) out.signature_tail_bytes = p.extra_bytes;
    const addrs = p.sigs.filter((s) => s.owner).map((s) => s.owner.toLowerCase()); if (addrs.some((x, i) => i && BigInt(x) <= BigInt(addrs[i - 1]))) flags.push("SIGNATURES_NOT_SORTED_ASC_OR_DUPLICATE");
    if (live?.owners) { const os = new Set(live.owners.map((o) => o.toLowerCase())); p.sigs.forEach((s) => { if (s.owner) s.is_owner = os.has(s.owner.toLowerCase()); }); const valid = new Set(p.sigs.filter((s) => s.is_owner && (s.type === "ecdsa" || s.type === "eth_sign")).map((s) => s.owner.toLowerCase())).size; out.valid_owner_ecdsa_sigs = valid; if (live.threshold != null) { out.threshold_met_offline = valid >= live.threshold; if (!out.threshold_met_offline) flags.push(`NEEDS_${live.threshold - valid}_MORE_SIGNATURES_OR_CONTRACT_APPROVALS`); } if (p.sigs.some((s) => s.owner && s.is_owner === false)) flags.push("SIGNER_NOT_AN_OWNER"); } }
  if (live && live.is_contract === false) flags.push("SAFE_ADDRESS_HAS_NO_CODE_ON_CHAIN"); if (live?.guard) flags.push("TX_GUARD_SET");
  return { status: 200, body: { safe: checksum(safe), chain, chain_id: cid, version_used: version, ...out, ...(live ? { live } : {}), flags, verdict: flags.some((f) => /NON_MULTISEND|THIRD_PARTY|MISMATCH|NOT_AN_OWNER|NO_CODE|INNER_/.test(f)) ? "review" : "ok" } };
}
// ---- 4. /v1/portfolio ----
export const BASE_TOKENS = { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", WETH: "0x4200000000000000000000000000000000000006", USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", USDS: "0x820C137fa70C8691f0e44Dc420a5e53c168921Dc", sUSDS: "0x5875eEE11Cf8398102FdAd704C9E96607675467a", USDe: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  cbETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", wstETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", rETH: "0xB6fe221Fe9EeF5aBa221c348bA20A1Bf5e73624c", weETH: "0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A", cbBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
  AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", VIRTUAL: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b", DEGEN: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", BRETT: "0x532f27101965dd16442E59d40670FaF5eBB142E4", TOSHI: "0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4", ZORA: "0x1111111111166b7FE7bd91427724B487980aFc69", MORPHO: "0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842", WELL: "0xA88594D404727625A9437C3f886C7643872296AE", LINK: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196", KAITO: "0x98d0baa52b2D063E780DE12F615f963Fe8537553" };
const DEC = { USDC: 6, USDbC: 6, USDT: 6, EURC: 6, cbBTC: 8 };
export async function portfolio(a) {
  const who = String(a.address || a.wallet || a.owner || "").trim(); if (!isA(who)) return bad("address (wallet) required");
  const chain = CHAINS(a.chain || a.network); if (!chain) return bad("chain: base (default) or ethereum (ethereum needs tokens=...)");
  const extra = list(a.tokens); if (extra.length > 20) return bad("≤20 extra tokens"); const badA = extra.find((t) => !isA(t)); if (badA) return bad("invalid token: " + badA);
  if (chain !== "base" && !extra.length) return bad("on ethereum pass tokens= (comma list ≤20); curated list covers Base only");
  const cur = chain === "base" && String(a.curated ?? "true") !== "false" ? Object.entries(BASE_TOKENS) : [];
  const seen = new Set(cur.map(([, x]) => x.toLowerCase())); const toks = [...cur.map(([s, x]) => ({ sym: s, addr: x, dec: DEC[s] ?? 18 })), ...extra.filter((x) => !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).map((x) => ({ addr: x, dec: null }))];
  const v = VENUES[chain]; const calls = [["eth_getBalance", [who, "latest"]], ["eth_getTransactionCount", [who, "latest"]], ["eth_getCode", [who, "latest"]], call(uniPool(v.uni, v.weth, v.usdc, 500), S_SLOT0)];
  for (const t of toks) { calls.push(call(t.addr, S_BAL + aw(who))); if (t.dec == null) calls.push(call(t.addr, S_DEC), call(t.addr, S_SYM)); }
  let r, rpc; try { ({ results: r, rpc } = await rpcBatch(chain, calls)); } catch (e) { return { status: 200, body: { address: checksum(who), chain, live: false, rpc_error: String(e.message || e).slice(0, 160), note: "public RPC unreachable; retry" } }; }
  const eth = r[3] && r[3].length >= 66 && big(r[3].slice(0, 66)) ? v3Price(big(r[3].slice(0, 66)), v.weth, v.usdc, 18, 6) : null;
  let k = 4; const held = [];
  for (const t of toks) { const bal = big(r[k++]); if (t.dec == null) { const d = r[k++], s = r[k++]; t.dec = d && d !== "0x" ? Number(big(d)) : null; t.sym = decodeStr(s); } if (bal > 0n) held.push({ ...t, bal }); }
  const nat = big(r[0]); const MAXP = 8;
  // price non-stable holdings (≤8 per call, largest raw first is meaningless across decimals; keep curated order then extras)
  const STABLE = new Set(["USDC", "USDbC", "USDT", "DAI", "USDS", "USDe"]); const toPrice = held.filter((h) => !STABLE.has(h.sym) && h.sym !== "WETH" && h.dec != null).slice(0, MAXP);
  let prices = {}; let priceErr; if (toPrice.length) { try { const { calls: pc, plan, refI } = pricePlan(chain, toPrice.map((h) => h.addr)); const { results } = await rpcBatch(chain, pc); for (const row of priceRows(results, plan, refI, chain).rows) prices[row.token.toLowerCase()] = row; } catch (e) { priceErr = String(e.message || e).slice(0, 120); } }
  const rows = held.map((h) => { const amt = h.dec != null ? fmtUnits(h.bal, h.dec) : h.bal.toString(); const n = h.dec != null ? Number(h.bal) / 10 ** h.dec : null; let px = null, src = null, fl = [];
    if (STABLE.has(h.sym)) { px = 1; src = "stable peg assumed"; } else if (h.sym === "WETH") { px = r6(eth); src = "WETH/USDC pool"; } else { const p = prices[h.addr.toLowerCase()]; if (p) { px = p.price_usd; src = p.source; fl = p.flags || []; } }
    return { token: checksum(h.addr), symbol: h.sym, decimals: h.dec, balance_raw: h.bal.toString(), balance: amt, price_usd: px, value_usd: px != null && n != null ? Math.round(px * n * 100) / 100 : null, price_source: src, ...(fl.length ? { flags: fl } : {}), curated: !!cur.find(([, x]) => x === h.addr) }; }).sort((x, y) => (y.value_usd || 0) - (x.value_usd || 0));
  const natUsd = eth != null ? Math.round((Number(nat) / 1e18) * eth * 100) / 100 : null; const total = rows.reduce((s, x) => s + (x.value_usd || 0), 0) + (natUsd || 0);
  const code = r[2] || "0x"; const unpriced = rows.filter((x) => x.value_usd == null).length;
  return { status: 200, body: { address: checksum(who), chain, live: true, rpc, account_type: code === "0x" ? "eoa" : code.toLowerCase().startsWith("0xef0100") ? "eip7702_delegated_eoa" : "contract", nonce: r[1] ? Number(big(r[1])) : null, native: { symbol: "ETH", balance: fmtUnits(nat, 18), value_usd: natUsd }, eth_usd: r6(eth), tokens_checked: toks.length, tokens_held: rows.length, total_value_usd: Math.round(total * 100) / 100, unpriced_holdings: unpriced, holdings: rows, ...(priceErr ? { price_error: priceErr } : {}), ...(held.filter((h) => !STABLE.has(h.sym) && h.sym !== "WETH").length > MAXP ? { note: `priced first ${MAXP} volatile holdings; call /v1/tokenprice for the rest` } : {}), coverage: chain === "base" ? "curated top Base tokens (" + cur.length + ") + your tokens=; not a full indexer scan" : "your tokens= only" } };
}
