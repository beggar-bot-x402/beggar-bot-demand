// packb57 (builder B, 2026-11-02): Uniswap v4 on-chain: v4pools, v4quote, v4swapbuild (UniversalRouter V4_SWAP), v4position. $0 upstream (keyless RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
import { txbuild } from "./packb24.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { const s = String(h).replace(/^0x/, ""); if (!/^([0-9a-fA-F]{2})*$/.test(s)) throw new Error("bad hex"); return Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16)); };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const be = (v) => { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
const sel = (s) => keccakHex(s).slice(0, 10);
const w = (x, i) => BigInt("0x" + ((x || "0x").slice(2 + 64 * i, 66 + 64 * i) || "0"));
const toUnits = (a, dec) => { a = String(a ?? ""); if (!/^\d+(\.\d+)?$/.test(a)) return null; const [i, f = ""] = a.split("."); if (f.length > dec) return null; return BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0"); };
const WETH = { base: "0x4200000000000000000000000000000000000006", optimism: "0x4200000000000000000000000000000000000006", ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", polygon: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" };
const pick = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, max_cost_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const f = s.slice(s.length - d).replace(/0+$/, ""); return s.slice(0, s.length - d) + (f ? "." + f : ""); };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const arr = (xs) => pad(xs.length.toString(16)) + xs.join("");
import { finish } from "./packb40.js";
import { keccak } from "./evm.js";
const V4 = { ethereum: { sv: "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227", qt: "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203", pm: "0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e", ur: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af" },
  base: { sv: "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71", qt: "0x0d5e0F971ED27FBfF6c2837bf31316121532048D", pm: "0x7C5f5A4bBd8fD63184577525326123B519429bDc", ur: "0x6fF5693b99212Da76ad316178A184AB56D299b43" } };
const P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3", Z = "0x0000000000000000000000000000000000000000";
const TIERS = [[100, 1], [500, 10], [3000, 60], [10000, 200]];
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], S = (s) => sel(s);
const s256 = (v) => Number(BigInt.asIntN(256, BigInt(v))), i24 = (n) => pad((BigInt.asUintN(256, BigInt(n))).toString(16));
const str = (h) => { try { if (!h || h.length < 130) return null; const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain); return c && V4[c] ? c : null; };
const isEth = (t) => /^(eth|native|0x0{40})$/i.test(String(t || ""));
const cur = (ch, t) => isEth(t) ? Z : tok(ch, t);
async function meta(ch, ads) { const real = ads.filter((a) => a !== Z); const r = real.length ? await rpcBatch(ch, real.flatMap((a) => [call(a, "0x313ce567"), call(a, "0x95d89b41")])) : { results: [] }; let k = 0; return ads.map((a) => { if (a === Z) return { address: Z, decimals: 18, symbol: "ETH" }; const d = r.results[2 * k], s = r.results[2 * k + 1]; k++; if (!d || d.length < 66) throw new Error("not an ERC20: " + a); return { address: checksum(a), decimals: Number(w(d, 0)), symbol: str(s) || (s && s.length === 66 ? new TextDecoder().decode(unhex(s.slice(2)).filter((b) => b)) : null) }; }); }
const keyEnc = (c0, c1, fee, ts, hooks) => pad(c0.slice(2)) + pad(c1.slice(2)) + pad(fee.toString(16)) + i24(ts) + pad(hooks.slice(2));
const pid = (k) => "0x" + [...keccak(unhex(k))].map((b) => b.toString(16).padStart(2, "0")).join("");
const sort2 = (a, b) => (BigInt(a) < BigInt(b) ? [a, b] : [b, a]);
function tiers(q) { const hooks = isA(q.hooks) ? q.hooks : Z; if (q.fee != null || q.tick_spacing != null) { const f = Number(q.fee), t = Number(q.tick_spacing ?? (TIERS.find((x) => x[0] === f) || [])[1]); if (!(f >= 0 && f <= 1000000) || !Number.isInteger(t) || t < 1) return null; return [[f, t, hooks]]; } return TIERS.map(([f, t]) => [f, t, hooks]); }
const bytesEnc = (h) => { h = h.replace(/^0x/, ""); const L = h.length / 2; return pad(L.toString(16)) + h.padEnd(Math.ceil(L / 32) * 64, "0"); };
const dynArr = (items) => { let off = 32 * items.length, hd = ""; for (const it of items) { hd += pad(off.toString(16)); off += it.length / 2; } return pad(items.length.toString(16)) + hd + items.join(""); };
async function quoteAll(ch, a, b, amt, ts) { const [c0, c1] = sort2(a, b), zf = a.toLowerCase() === c0.toLowerCase();
  const r = await rpcBatch(ch, ts.map(([f, t, h]) => call(V4[ch].qt, S("quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))") + pad("20") + keyEnc(c0, c1, f, t, h) + pad(zf ? "1" : "0") + pad(amt.toString(16)) + pad("100") + pad("0"))));
  return ts.map(([f, t, h], i) => { const x = r.results[i]; return { fee: f, tick_spacing: t, hooks: h, c0, c1, zf, out: x && x.length >= 130 ? w(x, 0) : null, gas: x && x.length >= 130 ? Number(w(x, 1)) : null }; }).filter((x) => x.out); }
async function prepq(q) { const ch = chq(q); if (!ch) return [bad("chain required (ethereum or base)")]; const a = cur(ch, q.token_in), b = cur(ch, q.token_out); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return [bad("token_in and token_out required (address, ETH, USDC, WETH), distinct")]; if (!q.amount) return [bad("amount required")]; const ts = tiers(q); if (!ts) return [bad("bad fee/tick_spacing")];
  const [mi, mo] = await meta(ch, [a, b]); const amt = toUnits(q.amount, mi.decimals); if (!amt) return [bad("bad amount")]; const qs = (await quoteAll(ch, a, b, amt, ts)).sort((x, y) => (y.out > x.out ? 1 : -1)); return [null, ch, mi, mo, amt, qs]; }
export async function v4quote(q) {
  try { const [e, ch, mi, mo, amt, qs] = await prepq(q); if (e) return e; const px = (o) => Number(o) / 10 ** mo.decimals / (Number(amt) / 10 ** mi.decimals);
    if (!qs.length) return ok({ chain: ch, token_in: mi, token_out: mo, routable: false, note: "no v4 pool with liquidity at the standard fee tiers (pass fee, tick_spacing, hooks for custom pools)" });
    return ok({ chain: ch, token_in: mi, token_out: mo, amount_in: q.amount, best: { fee: qs[0].fee, tick_spacing: qs[0].tick_spacing, hooks: qs[0].hooks, amount_out: fmt(qs[0].out, mo.decimals), price: px(qs[0].out) }, tiers: qs.map((x) => ({ fee: x.fee, tick_spacing: x.tick_spacing, hooks: x.hooks, amount_out: fmt(x.out, mo.decimals), price: px(x.out), gas_estimate: x.gas })), build: "/v1/v4swapbuild", source: "Uniswap v4 V4Quoter eth_call" });
  } catch (e) { return err(e); }
}
export async function v4swapbuild(q) {
  if (!isA(q.from)) return bad("from address required");
  try { const [e, ch, mi, mo, amt, qs] = await prepq(q); if (e) return e; if (!qs.length) return bad("no v4 pool with liquidity for this pair/tier");
    const b = qs[0], slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 5000), min = b.out * BigInt(10000 - slip) / 10000n, cin = mi.address, cout = mo.address;
    const p0 = pad("20") + keyEnc(b.c0, b.c1, b.fee, b.tick_spacing, b.hooks) + pad(b.zf ? "1" : "0") + pad(amt.toString(16)) + pad(min.toString(16)) + pad("120") + pad("0");
    const p1 = pad(cin.slice(2)) + pad(amt.toString(16)), p2 = pad(cout.slice(2)) + pad(min.toString(16));
    const input = pad("40") + pad((0x40 + bytesEnc("060c0f").length / 2).toString(16)) + bytesEnc("060c0f") + dynArr([bytesEnc(p0), bytesEnc(p1), bytesEnc(p2)]);
    const dl = Math.floor(Date.now() / 1000) + Math.min(Math.max(Number(q.deadline_s) || 1200, 60), 86400);
    const data = S("execute(bytes,bytes[],uint256)") + pad("60") + pad("a0") + pad(dl.toString(16)) + bytesEnc("10") + dynArr([bytesEnc(input)]);
    const extra = { chain: ch, aggregator: "uniswap-v4-direct", router: checksum(V4[ch].ur), fee: b.fee, tick_spacing: b.tick_spacing, hooks: b.hooks, token_in: mi.symbol, token_out: mo.symbol, amount_in: q.amount, amount_out: fmt(b.out, mo.decimals), min_out: fmt(min, mo.decimals), slippage_bps: slip, deadline: dl, recipient: checksum(q.from), note: "output is paid to the sender (TAKE_ALL)", calldata: data };
    if (cin === Z) { const t = await txbuild({ chain: ch, from: q.from, to: V4[ch].ur, data, value: amt.toString() }); return ok({ ...extra, ...pick(t) }); }
    const pa = (await rpcBatch(ch, [call(P2, S("allowance(address,address,address)") + pad(q.from.slice(2)) + pad(cin.slice(2)) + pad(V4[ch].ur.slice(2)))])).results[0], pAmt = pa ? w(pa, 0) : 0n, pExp = pa ? Number(w(pa, 1)) : 0;
    const p2ok = pAmt >= amt && pExp > Date.now() / 1000 + 300, p2tx = p2ok ? null : { to: P2, data: S("approve(address,address,uint160,uint48)") + pad(cin.slice(2)) + pad(V4[ch].ur.slice(2)) + pad(((1n << 160n) - 1n).toString(16)) + pad((Math.floor(Date.now() / 1000) + 30 * 86400).toString(16)), value: "0", note: "Permit2 -> UniversalRouter allowance (30 days); send after the ERC20 approval to Permit2" };
    return await finish(ch, q.from, cin, amt, P2, { to: V4[ch].ur, data, value: 0 }, { ...extra, permit2_allowance_ok: p2ok, permit2_approve_tx: p2tx });
  } catch (e) { return err(e); }
}
export async function v4pools(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); const a = cur(ch, q.token_a || q.token_in), b = cur(ch, q.token_b || q.token_out); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return bad("token_a and token_b required (address, ETH, USDC, WETH)"); const ts = tiers(q); if (!ts) return bad("bad fee/tick_spacing");
  try { const [c0, c1] = sort2(a, b), [m0, m1] = await meta(ch, [c0, c1]), ids = ts.map(([f, t, h]) => pid(keyEnc(c0, c1, f, t, h)));
    const r = await rpcBatch(ch, ids.flatMap((id) => [call(V4[ch].sv, S("getSlot0(bytes32)") + id.slice(2)), call(V4[ch].sv, S("getLiquidity(bytes32)") + id.slice(2))]));
    const out = ts.map(([f, t, h], i) => { const s = r.results[2 * i], sq = s ? w(s, 0) : 0n; if (!sq) return null; const p = (Number(sq) / 2 ** 96) ** 2 * 10 ** (m0.decimals - m1.decimals); return { pool_id: ids[i], fee: f, tick_spacing: t, hooks: h, tick: s256(w(s, 1)), lp_fee: Number(w(s, 3)), protocol_fee: Number(w(s, 2)), price_token1_per_token0: p, price_token0_per_token1: p ? 1 / p : null, liquidity: (r.results[2 * i + 1] ? w(r.results[2 * i + 1], 0) : 0n).toString() }; }).filter(Boolean);
    return ok({ chain: ch, currency0: m0, currency1: m1, pools: out, checked: ts.length, note: "standard hookless tiers unless fee/tick_spacing/hooks passed", source: "Uniswap v4 StateView eth_call" });
  } catch (e) { return err(e); }
}
export async function v4position(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); const id = String(q.token_id ?? ""); if (!/^\d+$/.test(id)) return bad("token_id required");
  try { const T = pad(BigInt(id).toString(16)), r = await rpcBatch(ch, [call(V4[ch].pm, S("getPoolAndPositionInfo(uint256)") + T), call(V4[ch].pm, S("getPositionLiquidity(uint256)") + T), call(V4[ch].pm, S("ownerOf(uint256)") + T)]);
    const x = r.results[0]; if (!x || x.length < 2 + 64 * 6 || /^0x0+$/.test(x)) return bad("position not found"); const c0 = "0x" + x.slice(26, 66), c1 = "0x" + x.slice(90, 130), fee = Number(w(x, 2)), ts = s256(w(x, 3)), hooks = "0x" + x.slice(2 + 64 * 4 + 24, 66 + 64 * 4), info = w(x, 5);
    const sx = (v) => Number(BigInt.asIntN(24, v)), tl = sx((info >> 8n) & 0xffffffn), tu = sx((info >> 32n) & 0xffffffn), liq = r.results[1] ? w(r.results[1], 0) : 0n, [m0, m1] = await meta(ch, [c0, c1]);
    const poolId = pid(keyEnc(c0, c1, fee, ts, hooks)), s = (await rpcBatch(ch, [call(V4[ch].sv, S("getSlot0(bytes32)") + poolId.slice(2))])).results[0], tick = s256(w(s, 1)), sq = Number(w(s, 0)) / 2 ** 96;
    const sa = Math.sqrt(1.0001 ** tl), sb = Math.sqrt(1.0001 ** tu), sp = Math.min(Math.max(sq, sa), sb), L = Number(liq), dp = (t) => 1.0001 ** t * 10 ** (m0.decimals - m1.decimals);
    return ok({ chain: ch, token_id: id, owner: r.results[2] && r.results[2].length >= 66 ? checksum("0x" + r.results[2].slice(-40)) : null, pool_id: poolId, currency0: m0, currency1: m1, fee, tick_spacing: ts, hooks: checksum(hooks), tick_lower: tl, tick_upper: tu, current_tick: tick, in_range: tick >= tl && tick < tu, liquidity: liq.toString(), price_lower: dp(tl), price_upper: dp(tu), price_current: dp(tick), amount0_est: L * (sb - sp) / (sp * sb) / 10 ** m0.decimals, amount1_est: L * (sp - sa) / 10 ** m1.decimals, subscriber: (info & 0xffn) === 1n, source: "Uniswap v4 PositionManager + StateView eth_call" });
  } catch (e) { return err(e); }
}
