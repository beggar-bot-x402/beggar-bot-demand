// packb64 (builder B, 2026-11-02): GMX v2 (Arbitrum) perps + GM/GLV liquidity: markets OI/funding/borrow, oracle tickers, GLV vaults, wallet GM/GLV holdings. $0 upstream (arbitrum-api.gmxinfra.io + keyless RPC).
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
const API = "https://arbitrum-api.gmxinfra.io", E30 = 1e30, cache = {};
async function g(p) { const c = cache[p]; if (c && Date.now() - c.t < 30000) return c.v; const r = await fetch(API + p, { headers: { accept: "application/json" } }); if (!r.ok) throw new Error("GMX API " + r.status); const v = await r.json(); cache[p] = { t: Date.now(), v }; return v; }
const U = (x) => Number(BigInt(x || 0)) / E30, R = (x) => Number(BigInt(x || 0)) / E30;
async function tick() { const [t, k] = await Promise.all([g("/prices/tickers"), g("/tokens")]); const dec = Object.fromEntries(k.tokens.map((x) => [x.address.toLowerCase(), x.decimals])); const m = {};
  for (const x of t) { const d = dec[x.tokenAddress.toLowerCase()] ?? 18, s = 10 ** (30 - d), lo = Number(x.minPrice) / s, hi = Number(x.maxPrice) / s; m[x.tokenAddress.toLowerCase()] = { address: x.tokenAddress, symbol: x.tokenSymbol, decimals: d, min: lo, max: hi, mid: (lo + hi) / 2, spread_bps: lo ? (hi - lo) / ((lo + hi) / 2) * 1e4 : null, updated_at: Math.floor(x.updatedAt / 1000) }; } return m; }
const chk = (q) => !q.chain || ck(q.chain) === "arbitrum";
function mk(x, apy, T) { const oiL = U(x.openInterestLong), oiS = U(x.openInterestShort), lt = T[x.longToken.toLowerCase()], st = T[x.shortToken.toLowerCase()], pl = lt ? Number(BigInt(x.poolAmountLong)) / 10 ** lt.decimals * lt.mid : null, ps = st ? Number(BigInt(x.poolAmountShort)) / 10 ** st.decimals * st.mid : null;
  return { name: x.name, market_token: x.marketToken, index_token: T[x.indexToken.toLowerCase()]?.symbol || x.indexToken, long_token: lt?.symbol || x.longToken, short_token: st?.symbol || x.shortToken, listed: x.isListed, oi_long_usd: oiL, oi_short_usd: oiS, oi_skew: oiL + oiS ? (oiL - oiS) / (oiL + oiS) : 0, avail_liq_long_usd: U(x.availableLiquidityLong), avail_liq_short_usd: U(x.availableLiquidityShort), pool_usd: pl != null && ps != null ? pl + ps : null,
    funding_apr_long: R(x.fundingRateLong), funding_apr_short: R(x.fundingRateShort), borrow_apr_long: R(x.borrowingRateLong), borrow_apr_short: R(x.borrowingRateShort), net_apr_long: R(x.netRateLong), net_apr_short: R(x.netRateShort), lp_apy: apy?.apy ?? null }; }
export async function gmxmarkets(q) {
  if (!chk(q)) return bad("GMX v2 pack covers arbitrum"); const s = String(q.symbol ?? q.market ?? "").trim().toUpperCase(); if (!s && !q.all && !q.sort) return bad("symbol (e.g. ETH, BTC, SOL) or all=true required");
  try { const [m, a, T] = await Promise.all([g("/markets/info"), g("/apy?period=" + (["7d", "30d", "90d", "180d", "1y", "total"].includes(q.period) ? q.period : "30d")), tick()]);
    let r = m.markets.filter((x) => x.isListed).map((x) => mk(x, a.markets[x.marketToken], T)); if (s) r = r.filter((x) => x.name.toUpperCase().split("/")[0].trim() === s || x.index_token.toUpperCase() === s || x.index_token.toUpperCase() === "W" + s);
    const k = { oi: (x) => x.oi_long_usd + x.oi_short_usd, apy: (x) => x.lp_apy ?? -1, funding: (x) => Math.abs(x.funding_apr_long), pool: (x) => x.pool_usd ?? 0 }[q.sort] || ((x) => x.oi_long_usd + x.oi_short_usd); r.sort((x, y) => k(y) - k(x));
    return ok({ chain: "arbitrum", count: r.length, markets: r.slice(0, Math.min(50, Number(q.limit) || 20)), rates_note: "rates are annualized fractions; positive funding = that side pays", source: "arbitrum-api.gmxinfra.io" }); } catch (e) { return err(e); }
}
export async function gmxprices(q) {
  if (!chk(q)) return bad("GMX v2 pack covers arbitrum"); const s = String(q.symbols ?? q.symbol ?? "").split(/[,\s]+/).filter(Boolean).map((x) => String(x).toUpperCase()); if (!s.length) return bad("symbols required (e.g. ETH,BTC)");
  try { const T = Object.values(await tick()), now = Date.now() / 1000; const r = s.map((x) => { const t = T.find((y) => y.symbol.toUpperCase() === x) || T.find((y) => y.symbol.toUpperCase() === "W" + x) || T.find((y) => y.address.toLowerCase() === x.toLowerCase()); return t ? { ...t, age_s: Math.round(now - t.updated_at) } : { symbol: x, error: "not a GMX oracle token" }; });
    return ok({ chain: "arbitrum", prices: r, note: "min/max are the GMX oracle bid/ask used for execution", source: "arbitrum-api.gmxinfra.io/prices/tickers" }); } catch (e) { return err(e); }
}
export async function gmxglv(q) {
  if (!chk(q)) return bad("GMX v2 pack covers arbitrum"); const s = String(q.symbol ?? q.glv ?? "").toUpperCase(); if (!s && !q.all) return bad("symbol (e.g. ETH, BTC) or all=true required");
  try { const [v, a, m] = await Promise.all([g("/glvs/info"), g("/apy?period=30d"), g("/markets/info")]); const nm = Object.fromEntries(m.markets.map((x) => [x.marketToken.toLowerCase(), x.name]));
    let r = v.glvs.filter((x) => x.isListed).map((x) => { const tv = x.markets.reduce((t, y) => t + U(y.balanceUsd), 0); return { name: x.name, glv_token: x.glvToken, tvl_usd: tv, apy_30d: a.glvs?.[x.glvToken]?.apy ?? null, markets: x.markets.map((y) => ({ market: nm[y.address.toLowerCase()] || y.address, address: y.address, usd: U(y.balanceUsd), weight: tv ? U(y.balanceUsd) / tv : 0, disabled: y.isDisabled })).sort((p, o) => o.usd - p.usd) }; });
    if (s) r = r.filter((x) => x.name.toUpperCase().includes(s)); return ok({ chain: "arbitrum", count: r.length, glvs: r, source: "arbitrum-api.gmxinfra.io/glvs" }); } catch (e) { return err(e); }
}
export async function gmxlp(q) {
  if (!chk(q)) return bad("GMX v2 pack covers arbitrum"); if (!isA(q.address)) return bad("address required");
  try { const [m, v, a, T] = await Promise.all([g("/markets/info"), g("/glvs/info"), g("/apy?period=30d"), tick()]), A = pad(q.address.slice(2).toLowerCase()), toks = [...m.markets.map((x) => ({ k: "GM", x, t: x.marketToken })), ...v.glvs.map((x) => ({ k: "GLV", x, t: x.glvToken }))];
    const px = {}; for (const gl of v.glvs) for (const y of gl.markets) if (BigInt(y.balance) > 0n) px[y.address.toLowerCase()] = U(y.balanceUsd) / (Number(BigInt(y.balance)) / 1e18);
    const out = [], B = 60; for (let i = 0; i < toks.length; i += B) { const ch = toks.slice(i, i + B), r = (await rpcBatch("arbitrum", ch.map((x) => ["eth_call", [{ to: x.t, data: "0x70a08231" + A }, "latest"]]))).results; ch.forEach((x, j) => { const b = r[j] && r[j].length >= 66 ? BigInt(r[j].slice(0, 66)) : 0n; if (b > 0n) out.push({ ...x, b }); }); }
    const tot = []; for (const o of out) { const s = [["eth_call", [{ to: o.t, data: "0x18160ddd" }, "latest"]]]; let p = o.k === "GM" ? px[o.t.toLowerCase()] : null;
      if (o.k === "GLV") { const tv = o.x.markets.reduce((t, y) => t + U(y.balanceUsd), 0), ts = BigInt((await rpcBatch("arbitrum", s)).results[0] || "0x0"); p = ts > 0n ? tv / (Number(ts) / 1e18) : null; }
      else if (p == null) { const lt = T[o.x.longToken.toLowerCase()], st = T[o.x.shortToken.toLowerCase()], ts = BigInt((await rpcBatch("arbitrum", s)).results[0] || "0x0"); if (lt && st && ts > 0n) p = (Number(BigInt(o.x.poolAmountLong)) / 10 ** lt.decimals * lt.mid + Number(BigInt(o.x.poolAmountShort)) / 10 ** st.decimals * st.mid) / (Number(ts) / 1e18); }
      const amt = Number(o.b) / 1e18; tot.push({ type: o.k, name: o.x.name, token: o.t, balance: fmt(o.b, 18), price_usd: p, value_usd: p != null ? amt * p : null, apy_30d: (o.k === "GM" ? a.markets : a.glvs)?.[o.t]?.apy ?? null }); }
    tot.sort((x, y) => (y.value_usd ?? 0) - (x.value_usd ?? 0)); return ok({ chain: "arbitrum", address: checksum(q.address), positions: tot, total_usd: tot.reduce((t, x) => t + (x.value_usd ?? 0), 0), scanned: toks.length, note: "GM value from GLV marks or pool composition (excludes trader PnL)", source: "keyless Arbitrum RPC + arbitrum-api.gmxinfra.io" }); } catch (e) { return err(e); }
}
