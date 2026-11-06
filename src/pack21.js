// pack21: Hyperliquid market data — hlbook (depth/slippage), hlcandles (OHLCV+vol), hlspot (spot markets), fundinghist
const R = (status, body) => ({ status, body });
const err = (e) => /hyperliquid 500/.test(String(e.message)) ? R(404, { error: "unknown coin/market on hyperliquid" }) : R(502, { error: String(e.message || e).slice(0, 200) });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
const coinOf = (a) => { const c = (a.coin || "").trim(); if (!/^[A-Za-z0-9@:\/\-]{1,24}$/.test(c)) return null; return c.includes(":") || c.startsWith("@") ? c : c.toUpperCase(); };

export async function hlbook(a) {
  const coin = coinOf(a); if (!coin) return R(400, { error: "coin required e.g. BTC, ETH, HYPE" });
  try {
    const b = await hl({ type: "l2Book", coin }); if (!b || !b.levels) return R(404, { error: "unknown coin", coin });
    const [bids, asks] = b.levels.map((s) => s.map((l) => ({ px: +l.px, sz: +l.sz, n: l.n })));
    if (!bids.length || !asks.length) return R(404, { error: "empty book", coin });
    const mid = (bids[0].px + asks[0].px) / 2; const depth = (side, pct) => side.filter((l) => Math.abs(l.px / mid - 1) <= pct / 100).reduce((s, l) => s + l.px * l.sz, 0);
    const slip = (side, usd) => { let left = usd, q = 0; for (const l of side) { const v = l.px * l.sz; const take = Math.min(left, v); q += take / l.px; left -= take; if (left <= 0) break; } if (left > 0) return null; return +((Math.abs(usd / q / mid - 1)) * 100).toFixed(4); };
    const sizes = [10000, 100000, 1000000];
    return R(200, { venue: "hyperliquid", coin, mid, best_bid: bids[0].px, best_ask: asks[0].px, spread_bps: +(((asks[0].px - bids[0].px) / mid) * 1e4).toFixed(3),
      depth_usd: Object.fromEntries([0.1, 0.5, 1, 2].map((p) => [`${p}pct`, { bids: Math.round(depth(bids, p)), asks: Math.round(depth(asks, p)) }])),
      imbalance_1pct: +((depth(bids, 1) - depth(asks, 1)) / (depth(bids, 1) + depth(asks, 1) || 1)).toFixed(3),
      slippage_pct: Object.fromEntries(sizes.map((s) => [`$${s}`, { buy: slip(asks, s), sell: slip(bids, s) }])), levels_shown: { bids: bids.length, asks: asks.length }, book_note: "depth/slippage computed over the visible top levels (Hyperliquid returns ~20 per side); null slippage = exceeds visible depth", top_levels: { bids: bids.slice(0, n(a.levels, 5, 1, 20)), asks: asks.slice(0, n(a.levels, 5, 1, 20)) }, time: new Date(b.time).toISOString() });
  } catch (e) { return err(e); }
}

const IV = { "1m": 6e4, "5m": 3e5, "15m": 9e5, "1h": 3.6e6, "4h": 1.44e7, "1d": 8.64e7 };
export async function hlcandles(a) {
  const coin = coinOf(a); if (!coin) return R(400, { error: "coin required e.g. BTC" }); const iv = a.interval || "1h"; if (!IV[iv]) return R(400, { error: "interval must be " + Object.keys(IV).join("|") });
  try {
    const cnt = n(a.count, 48, 2, 500) | 0; const end = Date.now(); const c = await hl({ type: "candleSnapshot", req: { coin, interval: iv, startTime: end - cnt * IV[iv], endTime: end } });
    if (!Array.isArray(c) || !c.length) return R(404, { error: "no candles", coin });
    const rows = c.map((k) => ({ t: new Date(k.t).toISOString(), o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v, trades: k.n }));
    const rets = rows.slice(1).map((r, i) => Math.log(r.c / rows[i].c)); const mean = rets.reduce((s, x) => s + x, 0) / (rets.length || 1); const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1));
    const perYear = (365 * 8.64e7) / IV[iv]; const closes = rows.map((r) => r.c); const sma = (k) => (closes.length >= k ? +(closes.slice(-k).reduce((s, x) => s + x, 0) / k).toFixed(6) : null);
    let g = 0, l = 0; for (const x of rets.slice(-14)) x > 0 ? (g += x) : (l -= x); const rsi = g + l ? +((100 * g) / (g + l)).toFixed(1) : null;
    const hi = Math.max(...rows.map((r) => r.h)), lo = Math.min(...rows.map((r) => r.l)), last = closes[closes.length - 1];
    return R(200, { venue: "hyperliquid", coin, interval: iv, candles: rows.length, last, change_pct: +((last / rows[0].o - 1) * 100).toFixed(3), high: hi, low: lo, range_position_pct: +(((last - lo) / (hi - lo || 1)) * 100).toFixed(1),
      realized_vol_annualized_pct: +(sd * Math.sqrt(perYear) * 100).toFixed(2), rsi14: rsi, sma20: sma(20), sma50: sma(50), trend: sma(20) && last > sma(20) ? "above sma20" : "below sma20", volume_base: +rows.reduce((s, r) => s + r.v, 0).toFixed(4), volume_usd_est: Math.round(rows.reduce((s, r) => s + r.v * r.c, 0)), ohlcv: a.ohlcv === "false" ? undefined : rows.slice(-n(a.limit, 100, 1, 500)) });
  } catch (e) { return err(e); }
}

export async function hlspot(a) {
  try {
    const [meta, ctx] = await hl({ type: "spotMetaAndAssetCtxs" }); const tok = meta.tokens;
    let rows = meta.universe.map((u, i) => { const c = ctx.find((x) => x.coin === u.name) || ctx[i] || {}; const base = tok[u.tokens[0]], quote = tok[u.tokens[1]]; const px = +c.markPx || +c.midPx || 0;
      return { pair: `${base?.name}/${quote?.name}`, coin_id: u.name, base: base?.name, base_token_id: base?.tokenId, evm_contract: base?.evmContract?.address || null, price: px, change_24h_pct: c.prevDayPx && +c.prevDayPx ? +((px / +c.prevDayPx - 1) * 100).toFixed(2) : null, volume_24h_usd: Math.round(+c.dayNtlVlm || 0), circulating_supply: c.circulatingSupply ? +c.circulatingSupply : null, market_cap_usd: c.circulatingSupply ? Math.round(+c.circulatingSupply * px) : null, canonical: !!u.isCanonical }; });
    if (a.token) { const t = a.token.toUpperCase(); rows = rows.filter((r) => (r.base || "").toUpperCase() === t || r.coin_id === a.token); if (!rows.length) return R(404, { error: "token not found", token: a.token }); }
    const sort = a.sort || "volume"; const key = { volume: (r) => r.volume_24h_usd, mcap: (r) => r.market_cap_usd || 0, gainers: (r) => r.change_24h_pct ?? -1e9, losers: (r) => -(r.change_24h_pct ?? 1e9) }[sort]; if (!key) return R(400, { error: "sort must be volume|mcap|gainers|losers" });
    const active = rows.filter((r) => sort === "volume" || r.volume_24h_usd > 1000 || a.token); active.sort((p, q) => key(q) - key(p));
    return R(200, { venue: "hyperliquid-spot", pairs: rows.length, total_volume_24h_usd: rows.reduce((s, r) => s + r.volume_24h_usd, 0), sort, data: active.slice(0, n(a.limit, 25, 1, 200)) });
  } catch (e) { return err(e); }
}

export async function fundinghist(a) {
  const coin = coinOf(a); if (!coin) return R(400, { error: "coin required e.g. BTC" });
  try {
    const days = n(a.days, 7, 1, 30); const h = await hl({ type: "fundingHistory", coin, startTime: Date.now() - days * 8.64e7 }); if (!Array.isArray(h) || !h.length) return R(404, { error: "no funding history", coin });
    const f = h.map((x) => +x.fundingRate); const cum = f.reduce((s, x) => s + x, 0); const avg = cum / f.length; const pos = f.filter((x) => x > 0).length;
    const daily = {}; for (const x of h) { const d = new Date(x.time).toISOString().slice(0, 10); daily[d] = (daily[d] || 0) + +x.fundingRate; }
    const last24 = f.slice(-24).reduce((s, x) => s + x, 0);
    return R(200, { venue: "hyperliquid", coin, days, samples: f.length, current_hourly_pct: +(f[f.length - 1] * 100).toFixed(5), avg_apr_pct: +(avg * 24 * 365 * 100).toFixed(2), last24h_apr_pct: +(last24 * 365 * 100).toFixed(2), cumulative_pct: +(cum * 100).toFixed(4),
      positive_share_pct: +((100 * pos) / f.length).toFixed(1), max_hourly_pct: +(Math.max(...f) * 100).toFixed(5), min_hourly_pct: +(Math.min(...f) * 100).toFixed(5), regime: avg > 0.0000125 ? "persistently long-crowded" : avg < 0 ? "short-crowded" : "neutral",
      carry_note: "cumulative_pct ≈ what a short perp (long spot) earned per unit notional over the window", daily: Object.entries(daily).map(([date, r]) => ({ date, funding_pct: +(r * 100).toFixed(4) })) });
  } catch (e) { return err(e); }
}
