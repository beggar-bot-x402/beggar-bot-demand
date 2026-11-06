// pack68 (Kraken public API): obdepth (order-book depth within 0.5/1/2/5% + slippage for a USD market order), krakenohlc (candles + returns/volatility/range), cexspread (recent bid-ask spread stats in bps), krakenpair (pair specs: min order, tick, leverage, margin limits, status)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const K = "https://api.kraken.com/0/public/";
const pairOf = (p) => { p = String(p || "BTCUSD").toUpperCase().replace(/[^A-Z0-9]/g, ""); return p.replace(/^BTC/, "XBT"); };
const j = async (m, q) => { const r = await fetch(K + m + "?" + new URLSearchParams(q), { signal: AbortSignal.timeout(25000) }); const d = await r.json().catch(() => null); if (!d) throw new Error("upstream " + r.status); if (d.error?.length) { const e = new Error(d.error.join("; ")); e.st = /Unknown asset pair|Invalid arguments/i.test(e.message) ? 404 : 502; throw e; } return d.result; };
const first = (res) => { const k = Object.keys(res).find((x) => x !== "last"); return [k, res[k]]; };
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const err = (e, p) => (e.st === 404 ? R(404, { error: "unknown pair", pair: p }) : bad(e));

export async function obdepth(a) {
  const p = pairOf(a.pair); const usd = n(a.order_usd, 100000, 1, 1e9);
  try { const [k, b] = first(await j("Depth", { pair: p, count: 500 })); const asks = b.asks.map(([px, q]) => [+px, +q]), bids = b.bids.map(([px, q]) => [+px, +q]); const mid = (asks[0][0] + bids[0][0]) / 2;
    const band = (pc) => ({ band_pct: pc, bid_depth_quote: r2(bids.filter(([x]) => x >= mid * (1 - pc / 100)).reduce((s, [x, q]) => s + x * q, 0), 0), ask_depth_quote: r2(asks.filter(([x]) => x <= mid * (1 + pc / 100)).reduce((s, [x, q]) => s + x * q, 0), 0) });
    const fill = (side) => { let left = usd, qty = 0, cost = 0; for (const [x, q] of side) { const c = Math.min(left, x * q); cost += c; qty += c / x; left -= c; if (left <= 0) break; } const avg = qty ? cost / qty : null; return { filled_quote: r2(cost, 0), complete: left <= 1e-9, avg_price: r2(avg, 6), slippage_bps: avg ? r2((Math.abs(avg - mid) / mid) * 1e4) : null }; };
    return R(200, { pair: k, venue: "Kraken", mid: r2(mid, 6), best_bid: bids[0][0], best_ask: asks[0][0], spread_bps: r2(((asks[0][0] - bids[0][0]) / mid) * 1e4, 3), depth: [0.5, 1, 2, 5].map(band), order_quote: usd, market_buy: fill(asks), market_sell: fill(bids), imbalance_1pct: (() => { const x = band(1); const t = x.bid_depth_quote + x.ask_depth_quote; return t ? r2((x.bid_depth_quote - x.ask_depth_quote) / t, 3) : null; })(), levels_scanned: asks.length + bids.length });
  } catch (e) { return err(e, p); }
}

export async function krakenohlc(a) {
  const p = pairOf(a.pair); const iv = [1, 5, 15, 30, 60, 240, 1440, 10080].includes(+a.interval) ? +a.interval : 60;
  try { const [k, c] = first(await j("OHLC", { pair: p, interval: iv })); const s = c.map(([t, o, h, l, cl, vw, v, cnt]) => ({ time: new Date(t * 1000).toISOString(), open: +o, high: +h, low: +l, close: +cl, vwap: +vw, volume: +v, trades: cnt })).slice(-n(a.limit, 200, 2, 720));
    const rets = s.slice(1).map((x, i) => Math.log(x.close / s[i].close)); const sd = Math.sqrt(rets.reduce((q, r) => q + r * r, 0) / Math.max(1, rets.length) - (rets.reduce((q, r) => q + r, 0) / Math.max(1, rets.length)) ** 2);
    const last = s.at(-1).close;
    return R(200, { pair: k, venue: "Kraken", interval_min: iv, candles: s.length, from: s[0].time, to: s.at(-1).time, last, change_pct: r2(((last - s[0].open) / s[0].open) * 100), high: Math.max(...s.map((x) => x.high)), low: Math.min(...s.map((x) => x.low)), volume_base: r2(s.reduce((q, x) => q + x.volume, 0), 4), annualized_vol_pct: r2(sd * Math.sqrt((365 * 1440) / iv) * 100), series: s });
  } catch (e) { return err(e, p); }
}

export async function cexspread(a) {
  const p = pairOf(a.pair);
  try { const [k, s] = first(await j("Spread", { pair: p })); const b = s.map(([t, bid, ask]) => ({ t, bps: ((+ask - +bid) / ((+ask + +bid) / 2)) * 1e4 })); if (!b.length) return R(404, { error: "no spread data", pair: k });
    const v = b.map((x) => x.bps).sort((x, y) => x - y); const q = (f) => r2(v[Math.min(v.length - 1, Math.floor(f * v.length))], 3);
    return R(200, { pair: k, venue: "Kraken", samples: b.length, window_from: new Date(b[0].t * 1000).toISOString(), window_to: new Date(b.at(-1).t * 1000).toISOString(), current_bps: r2(b.at(-1).bps, 3), mean_bps: r2(v.reduce((x, y) => x + y, 0) / v.length, 3), median_bps: q(0.5), p90_bps: q(0.9), max_bps: r2(v.at(-1), 3), min_bps: r2(v[0], 3), last_bid: +s.at(-1)[1], last_ask: +s.at(-1)[2] });
  } catch (e) { return err(e, p); }
}

export async function krakenpair(a) {
  const p = pairOf(a.pair);
  try { const [[k, x], t] = await Promise.all([j("AssetPairs", { pair: p }).then(first), j("Ticker", { pair: p }).then(first).catch(() => [null, null])]); const tk = t[1];
    return R(200, { pair: k, altname: x.altname, wsname: x.wsname, base: x.base, quote: x.quote, status: x.status, order_min: +x.ordermin, cost_min: +x.costmin, tick_size: +x.tick_size, price_decimals: x.pair_decimals, lot_decimals: x.lot_decimals, max_leverage_long: Math.max(1, ...(x.leverage_buy || [])), max_leverage_short: Math.max(1, ...(x.leverage_sell || [])), margin_call_pct: x.margin_call, margin_stop_pct: x.margin_stop, long_position_limit: x.long_position_limit ?? null, short_position_limit: x.short_position_limit ?? null, ticker: tk ? { last: +tk.c[0], bid: +tk.b[0], ask: +tk.a[0], volume_24h: +tk.v[1], vwap_24h: +tk.p[1], trades_24h: tk.t[1], low_24h: +tk.l[1], high_24h: +tk.h[1], open_today: +tk.o } : null });
  } catch (e) { return err(e, p); }
}
