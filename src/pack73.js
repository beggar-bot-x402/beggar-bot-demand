// pack73: okxoi (OKX contracts open interest + volume history for a coin, USD), okxtakervol (OKX taker buy vs sell volume history), bfxfunding (Bitfinex margin funding/lending rates for a currency: FRR, bid/ask, APR, 30d daily history), kucoinbook (KuCoin order book depth, imbalance, slippage)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const coin = (c) => (/^[A-Za-z0-9]{2,10}$/.test(String(c || "")) ? String(c).toUpperCase() : null);
const needC = R(400, { error: "coin required, e.g. BTC, ETH" });
const iso = (t) => new Date(+t).toISOString();
const OKX = "https://www.okx.com/api/v5/rubik/stat";
const per = (p) => (["5m", "1H", "1D"].includes(p) ? p : "1H");

export async function okxoi(a) {
  const c = coin(a.coin); if (!c) return needC; const p = per(a.period);
  try { const d = await g(`${OKX}/contracts/open-interest-volume?ccy=${c}&period=${p}`); if (d.code !== "0" || !d.data?.length) return R(404, { error: "no OKX open interest for coin", coin: c, upstream: d.msg || null });
    const l = d.data.slice(0, n(a.limit, 48, 2, 500)).map(([t, oi, v]) => ({ time: iso(t), open_interest_usd: r2(+oi, 0), volume_usd: r2(+v, 0) }));
    return R(200, { coin: c, venue: "OKX", period: p, latest: l[0], oi_change_pct: r2((l[0].open_interest_usd / l.at(-1).open_interest_usd - 1) * 100, 3), oi_max: Math.max(...l.map((x) => x.open_interest_usd)), oi_min: Math.min(...l.map((x) => x.open_interest_usd)), total_volume_usd: l.reduce((s, x) => s + x.volume_usd, 0), list: l });
  } catch (e) { return bad(e); }
}

export async function okxtakervol(a) {
  const c = coin(a.coin); if (!c) return needC; const p = per(a.period); const it = String(a.market || "contracts").toLowerCase() === "spot" ? "SPOT" : "CONTRACTS";
  try { const d = await g(`${OKX}/taker-volume?ccy=${c}&instType=${it}&period=${p}`); if (d.code !== "0" || !d.data?.length) return R(404, { error: "no OKX taker volume for coin", coin: c, upstream: d.msg || null });
    const l = d.data.slice(0, n(a.limit, 48, 1, 500)).map(([t, s, b]) => ({ time: iso(t), sell_usd: r2(+s, 0), buy_usd: r2(+b, 0), buy_sell_ratio: +s ? r2(+b / +s, 3) : null })); const B = l.reduce((x, y) => x + y.buy_usd, 0), S = l.reduce((x, y) => x + y.sell_usd, 0);
    return R(200, { coin: c, venue: "OKX", market: it.toLowerCase(), period: p, points: l.length, total_buy_usd: B, total_sell_usd: S, imbalance: B + S ? r2((B - S) / (B + S), 3) : null, buy_dominant_periods: l.filter((x) => x.buy_usd > x.sell_usd).length, list: l });
  } catch (e) { return bad(e); }
}

export async function bfxfunding(a) {
  const c = coin(a.currency || "USD"); if (!c) return R(400, { error: "currency e.g. USD, USDT(UST), BTC, ETH" }); const s = "f" + (c === "USDT" ? "UST" : c);
  try { const [t, h] = await Promise.all([g(`https://api-pub.bitfinex.com/v2/ticker/${s}`).catch((e) => { if (e.code >= 400 && e.code <= 500) return null; throw e; }), g(`https://api-pub.bitfinex.com/v2/candles/trade:1D:${s}:p30/hist?limit=${n(a.days, 30, 1, 365)}`).catch(() => [])]); if (!Array.isArray(t) || t.length < 10) return R(404, { error: "no Bitfinex funding market", symbol: s });
    const apr = (x) => r2(x * 365 * 100, 3); const l = (h || []).map(([ts, o, cl, hi, lo, v]) => ({ date: iso(ts).slice(0, 10), close_daily_pct: r2(cl * 100, 5), close_apr_pct: apr(cl), high_apr_pct: apr(hi), low_apr_pct: apr(lo), volume: r2(v, 0) }));
    return R(200, { currency: c, symbol: s, venue: "Bitfinex", frr_daily_pct: r2(t[0] * 100, 5), frr_apr_pct: apr(t[0]), bid_apr_pct: apr(t[1]), bid_period_days: t[2], ask_apr_pct: apr(t[4]), ask_period_days: t[5], last_apr_pct: apr(t[9]), high_apr_pct: apr(t[11]), low_apr_pct: apr(t[12]), volume_24h: r2(t[10], 0), frr_amount_available: t[15] ?? null, history_30d_term: l });
  } catch (e) { return bad(e); }
}

export async function kucoinbook(a) {
  const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|BTC|ETH|EUR)$/i.exec(String(a.pair || "").trim()); if (!m) return R(400, { error: "pair required, e.g. BTC-USDT" }); const sym = `${m[1].toUpperCase()}-${m[2].toUpperCase() === "USD" ? "USDT" : m[2].toUpperCase()}`; const size = n(a.size_quote, 100000, 1, 1e10);
  try { const d = await g(`https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=${sym}`); const o = d.data; if (d.code !== "200000" || !o?.bids?.length) return R(404, { error: "pair not on KuCoin", pair: sym });
    const B = o.bids.map(([x, y]) => [+x, +y]), A = o.asks.map(([x, y]) => [+x, +y]); const mid = (B[0][0] + A[0][0]) / 2;
    const depth = (s, bps) => s.filter(([x]) => Math.abs(x - mid) / mid <= bps / 1e4).reduce((t, [x, y]) => t + x * y, 0);
    const walk = (s) => { let q = size, base = 0; for (const [x, y] of s) { const tk = Math.min(q, x * y); base += tk / x; q -= tk; if (q <= 0) break; } return q > 0 ? null : r2((Math.abs(size / base - mid) / mid) * 1e4, 3); };
    return R(200, { pair: sym, venue: "KuCoin", time: iso(o.time), best_bid: B[0][0], best_ask: A[0][0], mid: r2(mid, 8), spread_bps: r2(((A[0][0] - B[0][0]) / mid) * 1e4, 3), levels: { bids: B.length, asks: A.length }, depth_top100: { bid_quote: r2(depth(B, 1e4), 0), ask_quote: r2(depth(A, 1e4), 0) }, depth: [10, 50, 100].map((b) => { const bd = depth(B, b), ad = depth(A, b); return { band_bps: b, bid_quote: r2(bd, 0), ask_quote: r2(ad, 0), imbalance: bd + ad ? r2((bd - ad) / (bd + ad), 3) : null }; }), slippage_for_size: { size_quote: size, buy_bps: walk(A), sell_bps: walk(B), note: "null = size exceeds top-100 levels" } });
  } catch (e) { return bad(e); }
}
