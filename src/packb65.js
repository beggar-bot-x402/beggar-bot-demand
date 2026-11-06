// packb65 (builder B, 2026-11-02): dYdX v4 perps market data: markets, orderbook depth/slippage, funding history/APR, candles. $0 upstream (indexer.dydx.trade public indexer; market endpoints only).
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
const IX = "https://indexer.dydx.trade/v4";
async function d(p) { const r = await fetch(IX + p, { headers: { accept: "application/json" } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error("dYdX indexer " + r.status + (j.errors?.[0]?.msg ? ": " + j.errors[0].msg.slice(0, 80) : "")); return j; }
const T = (s) => { const x = String(s ?? "").trim().toUpperCase(); return !x ? null : /^[A-Z0-9.]{1,15}-USD$/.test(x) ? x : /^[A-Z0-9.]{1,15}$/.test(x) ? x + "-USD" : null; };
const N = Number;
export async function dydxmarkets(q) {
  const t = q.ticker || q.symbol ? T(q.ticker ?? q.symbol) : null; if ((q.ticker || q.symbol) && !t) return bad("bad ticker (e.g. ETH or ETH-USD)"); if (!t && !q.all && !q.sort) return bad("ticker (e.g. ETH-USD) or all=true required");
  try { const j = await d("/perpetualMarkets" + (t ? "?ticker=" + t : "")); let r = Object.values(j.markets || {}).map((m) => ({ ticker: m.ticker, status: m.status, oracle_price: N(m.oraclePrice), change_24h_pct: N(m.oraclePrice) ? N(m.priceChange24H) / (N(m.oraclePrice) - N(m.priceChange24H)) * 100 : null, volume_24h_usd: N(m.volume24H), trades_24h: m.trades24H, open_interest: N(m.openInterest), open_interest_usd: N(m.openInterest) * N(m.oraclePrice), next_funding_rate_1h: N(m.nextFundingRate), funding_apr: N(m.nextFundingRate) * 24 * 365, max_leverage: N(m.initialMarginFraction) ? 1 / N(m.initialMarginFraction) : null, maintenance_margin: N(m.maintenanceMarginFraction), tick_size: N(m.tickSize), step_size: N(m.stepSize), market_type: m.marketType }));
    if (t && !r.length) return bad("unknown dYdX market " + t); const k = { volume: "volume_24h_usd", oi: "open_interest_usd", funding: "funding_apr", change: "change_24h_pct" }[q.sort] || "volume_24h_usd"; r.sort((a, b) => Math.abs(b[k] ?? 0) - Math.abs(a[k] ?? 0));
    return ok({ venue: "dYdX v4", count: r.length, markets: r.slice(0, Math.min(100, N(q.limit) || 25)), source: "indexer.dydx.trade" }); } catch (e) { return err(e); }
}
export async function dydxbook(q) {
  const t = T(q.ticker ?? q.symbol); if (!t) return bad("ticker required (e.g. ETH-USD)"); const sz = q.size_usd != null ? N(q.size_usd) : 10000; if (!(sz > 0)) return bad("size_usd must be > 0");
  try { const b = await d("/orderbooks/perpetualMarket/" + t), bid = (b.bids || []).map((x) => [N(x.price), N(x.size)]), ask = (b.asks || []).map((x) => [N(x.price), N(x.size)]); if (!bid.length || !ask.length) return bad("empty book for " + t);
    const mid = (bid[0][0] + ask[0][0]) / 2, walk = (L) => { let u = 0, qn = 0; for (const [p, s] of L) { const c = Math.min(s * p, sz - u); u += c; qn += c / p; if (u >= sz - 1e-9) break; } return u >= sz - 1e-9 ? { avg_price: u / qn, slippage_bps: Math.abs(u / qn - mid) / mid * 1e4 } : { filled_usd: u, note: "book too thin for size" }; };
    const dep = (L, f) => L.filter(([p]) => Math.abs(p - mid) / mid <= f).reduce((t, [p, s]) => t + p * s, 0);
    return ok({ venue: "dYdX v4", ticker: t, best_bid: bid[0][0], best_ask: ask[0][0], mid, spread_bps: (ask[0][0] - bid[0][0]) / mid * 1e4, depth_usd: { bid_10bps: dep(bid, 0.001), ask_10bps: dep(ask, 0.001), bid_50bps: dep(bid, 0.005), ask_50bps: dep(ask, 0.005), bid_1pct: dep(bid, 0.01), ask_1pct: dep(ask, 0.01) }, size_usd: sz, market_buy: walk(ask), market_sell: walk(bid), levels: { bids: bid.slice(0, 10), asks: ask.slice(0, 10) }, source: "indexer.dydx.trade" }); } catch (e) { return err(e); }
}
export async function dydxfunding(q) {
  const t = T(q.ticker ?? q.symbol); if (!t) return bad("ticker required (e.g. ETH-USD)"); const n = Math.min(1000, Math.max(1, N(q.hours) || 168));
  try { const j = await d(`/historicalFunding/${t}?limit=${n}`), h = (j.historicalFunding || []).map((x) => ({ at: x.effectiveAt, rate_1h: N(x.rate), price: N(x.price) })); if (!h.length) return bad("no funding history for " + t);
    const avg = h.reduce((s, x) => s + x.rate_1h, 0) / h.length, pos = h.filter((x) => x.rate_1h > 0).length;
    return ok({ venue: "dYdX v4", ticker: t, hours: h.length, latest_rate_1h: h[0].rate_1h, latest_apr: h[0].rate_1h * 8760, avg_rate_1h: avg, avg_apr: avg * 8760, cumulative: h.reduce((s, x) => s + x.rate_1h, 0), pct_hours_longs_paid: pos / h.length, max_rate_1h: Math.max(...h.map((x) => x.rate_1h)), min_rate_1h: Math.min(...h.map((x) => x.rate_1h)), history: h.slice(0, Math.min(h.length, N(q.limit) || 48)), note: "positive = longs pay shorts; settles hourly", source: "indexer.dydx.trade" }); } catch (e) { return err(e); }
}
export async function dydxcandles(q) {
  const t = T(q.ticker ?? q.symbol); if (!t) return bad("ticker required (e.g. ETH-USD)"); const RS = { "1m": "1MIN", "5m": "5MINS", "15m": "15MINS", "30m": "30MINS", "1h": "1HOUR", "4h": "4HOURS", "1d": "1DAY" }, res = RS[String(q.resolution ?? "1h").toLowerCase()]; if (!res) return bad("resolution one of " + Object.keys(RS).join(","));
  try { const j = await d(`/candles/perpetualMarkets/${t}?resolution=${res}&limit=${Math.min(100, Math.max(1, N(q.limit) || 48))}`), c = (j.candles || []).map((x) => ({ t: x.startedAt, o: N(x.open), h: N(x.high), l: N(x.low), c: N(x.close), volume_usd: N(x.usdVolume), trades: x.trades, open_interest: N(x.startingOpenInterest) })); if (!c.length) return bad("no candles for " + t);
    const hi = Math.max(...c.map((x) => x.h)), lo = Math.min(...c.map((x) => x.l)), r = c.slice(1).map((x, i) => Math.log(c[i].c / x.c)), sd = r.length > 1 ? Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length) : null;
    return ok({ venue: "dYdX v4", ticker: t, resolution: res, count: c.length, last: c[0].c, change_pct: (c[0].c / c[c.length - 1].o - 1) * 100, high: hi, low: lo, volume_usd: c.reduce((s, x) => s + x.volume_usd, 0), realized_vol_per_bar: sd, candles: c, source: "indexer.dydx.trade" }); } catch (e) { return err(e); }
}
