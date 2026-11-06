// packb52 (builder B, 2026-11-02): Uniswap v3 on-chain: uniquote, uniswapbuild, unipools, uniposition. $0 upstream (keyless RPCs only).
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
const L1 = { q: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", r: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", f: "0x1F98431c8aD98523631AE4a59f267346ea31F984", n: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88" };
const U3 = { ethereum: L1, arbitrum: L1, optimism: L1, polygon: L1, base: { q: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", r: "0x2626664c2603336E57B271c5C0b26F421741e481", f: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", n: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" } };
const FEES = [100, 500, 3000, 10000];
const chq = (q) => { const c = q.chain ? ck(q.chain) : null; return c && U3[c] ? c : null; };
const s256 = (v) => Number(BigInt.asIntN(256, BigInt(v)));
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const str = (h) => { try { if (!h || h.length < 66) return null; if (h.length === 66) return new TextDecoder().decode(unhex(h.slice(2)).filter((b) => b)); const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
async function meta(ch, ads) { const r = await rpcBatch(ch, ads.flatMap((a) => [call(a, "0x313ce567"), call(a, "0x95d89b41")])); return ads.map((a, i) => { const d = r.results[2 * i]; if (!d || d.length < 66) throw new Error("not an ERC20: " + a); return { address: checksum(a), decimals: Number(w(d, 0)), symbol: str(r.results[2 * i + 1]) }; }); }
const tk = (ch, t) => tok(ch, t);
async function quotes(ch, a, b, amt, fees) { const r = await rpcBatch(ch, fees.map((f) => call(U3[ch].q, sel("quoteExactInputSingle((address,address,uint256,uint24,uint160))") + pad(a.slice(2)) + pad(b.slice(2)) + pad(amt.toString(16)) + pad(f.toString(16)) + pad("0")))); return fees.map((f, i) => { const x = r.results[i]; return x && x.length >= 258 ? { fee: f, out: w(x, 0), ticks: Number(w(x, 2)), gas: Number(w(x, 3)) } : { fee: f, out: null }; }); }
async function prep(q) { const ch = chq(q); if (!ch) return [bad("chain required (ethereum, base, arbitrum, optimism, polygon)")]; const a = tk(ch, q.token_in), b = tk(ch, q.token_out); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return [bad("token_in and token_out required (address, USDC or WETH), distinct")]; if (!q.amount) return [bad("amount required")];
  const [mi, mo] = await meta(ch, [a, b]); const amt = toUnits(q.amount, mi.decimals); if (!amt) return [bad("bad amount")]; const fees = q.fee ? [Number(q.fee)].filter((f) => FEES.includes(f)) : FEES; if (!fees.length) return [bad("fee must be 100, 500, 3000 or 10000")];
  const qs = (await quotes(ch, mi.address, mo.address, amt, fees)).filter((x) => x.out); return [null, ch, mi, mo, amt, qs]; }
export async function uniquote(q) {
  try { const [e, ch, mi, mo, amt, qs] = await prep(q); if (e) return e; if (!qs.length) return ok({ chain: ch, token_in: mi.symbol, token_out: mo.symbol, routable: false, note: "no direct Uniswap v3 pool with liquidity for this pair" });
    qs.sort((x, y) => (y.out > x.out ? 1 : -1)); const px = (o) => Number(o) / 10 ** mo.decimals / (Number(amt) / 10 ** mi.decimals);
    return ok({ chain: ch, token_in: mi, token_out: mo, amount_in: q.amount, best_fee_tier: qs[0].fee, amount_out: fmt(qs[0].out, mo.decimals), price: px(qs[0].out), tiers: qs.map((x) => ({ fee: x.fee, fee_pct: x.fee / 10000, amount_out: fmt(x.out, mo.decimals), price: px(x.out), ticks_crossed: x.ticks, gas_estimate: x.gas })), build: "/v1/uniswapbuild", source: "Uniswap v3 QuoterV2 eth_call" });
  } catch (e) { return err(e); }
}
export async function uniswapbuild(q) {
  if (!isA(q.from)) return bad("from address required");
  try { const [e, ch, mi, mo, amt, qs] = await prep(q); if (e) return e; if (!qs.length) return bad("no direct Uniswap v3 pool with liquidity for this pair");
    qs.sort((x, y) => (y.out > x.out ? 1 : -1)); const b = qs[0], slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 5000), min = b.out * BigInt(10000 - slip) / 10000n, rcpt = isA(q.recipient) ? q.recipient : q.from;
    const data = sel("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))") + pad(mi.address.slice(2)) + pad(mo.address.slice(2)) + pad(b.fee.toString(16)) + pad(rcpt.slice(2)) + pad(amt.toString(16)) + pad(min.toString(16)) + pad("0");
    return await finish(ch, q.from, mi.address, amt, U3[ch].r, { to: U3[ch].r, data, value: 0 }, { chain: ch, aggregator: "uniswap-v3-direct", router: U3[ch].r, fee_tier: b.fee, token_in: mi.symbol, token_out: mo.symbol, amount_in: q.amount, amount_out: fmt(b.out, mo.decimals), min_out: fmt(min, mo.decimals), slippage_bps: slip, recipient: checksum(rcpt) });
  } catch (e) { return err(e); }
}
export async function unipools(q) {
  const ch = chq(q); if (!ch) return bad("chain required"); const a = tk(ch, q.token_a || q.token_in), b = tk(ch, q.token_b || q.token_out); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return bad("token_a and token_b required (address, USDC or WETH)");
  try { const [ma, mb] = await meta(ch, [a, b]); const [t0, t1] = BigInt(ma.address) < BigInt(mb.address) ? [ma, mb] : [mb, ma];
    const g = await rpcBatch(ch, FEES.map((f) => call(U3[ch].f, sel("getPool(address,address,uint24)") + pad(t0.address.slice(2)) + pad(t1.address.slice(2)) + pad(f.toString(16)))));
    const ps = FEES.map((f, i) => ({ fee: f, pool: "0x" + (g.results[i] || "0x").slice(-40) })).filter((p) => p.pool.length === 42 && !/^0x0{40}$/.test(p.pool));
    if (!ps.length) return ok({ chain: ch, token0: t0, token1: t1, pools: [] });
    const r = await rpcBatch(ch, ps.flatMap((p) => [call(p.pool, "0x3850c7bd"), call(p.pool, "0x1a686502"), call(t0.address, "0x70a08231" + pad(p.pool.slice(2))), call(t1.address, "0x70a08231" + pad(p.pool.slice(2)))]));
    const out = ps.map((p, i) => { const s = r.results[4 * i], sq = w(s, 0); const tick = s256(w(s, 1)); const price = (Number(sq) / 2 ** 96) ** 2 * 10 ** (t0.decimals - t1.decimals);
      return { fee: p.fee, pool: checksum(p.pool), tick, price_token1_per_token0: price, price_token0_per_token1: price ? 1 / price : null, liquidity: w(r.results[4 * i + 1], 0).toString(), reserve0: fmt(w(r.results[4 * i + 2], 0), t0.decimals), reserve1: fmt(w(r.results[4 * i + 3], 0), t1.decimals) }; });
    return ok({ chain: ch, token0: t0, token1: t1, factory: U3[ch].f, pools: out, source: "Uniswap v3 factory + pool slot0 eth_call" });
  } catch (e) { return err(e); }
}
export async function uniposition(q) {
  const ch = chq(q); if (!ch) return bad("chain required"); const id = String(q.token_id ?? q.id ?? ""); if (!/^\d+$/.test(id)) return bad("token_id required");
  try { const N = U3[ch].n, r = await rpcBatch(ch, [call(N, sel("positions(uint256)") + pad(BigInt(id).toString(16))), call(N, sel("ownerOf(uint256)") + pad(BigInt(id).toString(16)))]); const p = r.results[0]; if (!p || p.length < 2 + 64 * 12) return bad("position not found");
    const a = (i) => "0x" + p.slice(2 + 64 * i + 24, 66 + 64 * i), sn = s256;
    const t0 = a(2), t1 = a(3), fee = Number(w(p, 4)), tl = sn(w(p, 5)), tu = sn(w(p, 6)), liq = w(p, 7), [m0, m1] = await meta(ch, [t0, t1]);
    const g = await rpcBatch(ch, [call(U3[ch].f, sel("getPool(address,address,uint24)") + pad(t0.slice(2)) + pad(t1.slice(2)) + pad(fee.toString(16)))]), pool = "0x" + g.results[0].slice(-40), s = (await rpcBatch(ch, [call(pool, "0x3850c7bd")])).results[0];
    const sq = Number(w(s, 0)) / 2 ** 96; const tick = s256(w(s, 1)); const sa = Math.sqrt(1.0001 ** tl), sb = Math.sqrt(1.0001 ** tu), L = Number(liq), sp = Math.min(Math.max(sq, sa), sb);
    const amt0 = L * (sb - sp) / (sp * sb) / 10 ** m0.decimals, amt1 = L * (sp - sa) / 10 ** m1.decimals, dp = (t) => 1.0001 ** t * 10 ** (m0.decimals - m1.decimals);
    return ok({ chain: ch, token_id: id, owner: r.results[1] && r.results[1].length >= 66 ? checksum("0x" + r.results[1].slice(-40)) : null, pool: checksum(pool), token0: m0, token1: m1, fee, tick_lower: tl, tick_upper: tu, current_tick: tick, in_range: tick >= tl && tick < tu, liquidity: liq.toString(), price_lower: dp(tl), price_upper: dp(tu), price_current: dp(tick), amount0_est: amt0, amount1_est: amt1, tokens_owed0: fmt(w(p, 10), m0.decimals), tokens_owed1: fmt(w(p, 11), m1.decimals), closed: liq === 0n, note: "amounts are float estimates; owed excludes uncollected fees accrued since last poke", source: "Uniswap v3 NonfungiblePositionManager eth_call" });
  } catch (e) { return err(e); }
}
