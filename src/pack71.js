// pack71: cbtrades (Coinbase recent trades: buy/sell flow, VWAP, large prints), bitstampohlc (Bitstamp OHLCV with change/range/vol), krakenspreadhist (Kraken recent best bid/ask spread history: avg/max spread bps), deribitfutflow (Deribit BTC/ETH futures+perp trade flow: per-instrument buy/sell USD, imbalance, liquidations)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const nf = (e) => { if (e.code === 404 || e.code === 400) return null; throw e; };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USD, ETH/USD" });
const iso = (t) => new Date(t).toISOString();

export async function cbtrades(a) {
  const p = parse(a.pair); if (!p) return needP;
  try { const d = await g(`https://api.exchange.coinbase.com/products/${p[0]}-${p[1]}/trades?limit=1000`).catch(nf); if (!d) return R(404, { error: "pair not on Coinbase", pair: p.join("-") });
    // Coinbase "side" is the maker side: maker sell = taker buy
    const l = d.map((x) => ({ time: x.time, price: +x.price, size: +x.size, quote: +x.price * +x.size, taker_side: x.side === "sell" ? "buy" : "sell" })); const q = (s) => l.filter((x) => x.taker_side === s).reduce((t, x) => t + x.quote, 0); const B = q("buy"), S = q("sell"); const v = l.reduce((t, x) => t + x.size, 0);
    return R(200, { pair: p.join("-"), venue: "Coinbase", trades: l.length, window_from: l.at(-1)?.time, window_to: l[0]?.time, vwap: v ? r2((B + S) / v, 6) : null, taker_buy_quote: r2(B, 0), taker_sell_quote: r2(S, 0), imbalance: B + S ? r2((B - S) / (B + S), 3) : null, largest: [...l].sort((x, y) => y.quote - x.quote).slice(0, n(a.limit, 20, 1, 200)).map((x) => ({ ...x, quote: r2(x.quote) })) });
  } catch (e) { return bad(e); }
}

const ST = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400 };
export async function bitstampohlc(a) {
  const p = parse(a.pair); if (!p) return needP; const st = ST[a.interval || "1h"]; if (!st) return R(400, { error: "interval must be one of " + Object.keys(ST).join(",") });
  try { const d = await g(`https://www.bitstamp.net/api/v2/ohlc/${(p[0] + p[1]).toLowerCase()}/?step=${st}&limit=${n(a.limit, 100, 2, 1000)}`).catch(nf); const o = d?.data?.ohlc; if (!o?.length) return R(404, { error: "pair not on Bitstamp", pair: p.join("-") });
    const c = o.map((x) => ({ time: iso(x.timestamp * 1000), open: +x.open, high: +x.high, low: +x.low, close: +x.close, volume: +x.volume })); const rets = c.slice(1).map((x, i) => Math.log(x.close / c[i].close)); const m = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length); const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, rets.length - 1));
    const hi = Math.max(...c.map((x) => x.high)), lo = Math.min(...c.map((x) => x.low));
    return R(200, { pair: d.data.pair, venue: "Bitstamp", interval: a.interval || "1h", candles: c.length, change_pct: r2((c.at(-1).close / c[0].open - 1) * 100, 3), high: hi, low: lo, range_pct: r2((hi / lo - 1) * 100, 3), realized_vol_annualized_pct: r2(sd * Math.sqrt((365 * 86400) / st) * 100), total_volume: r2(c.reduce((s, x) => s + x.volume, 0), 4), list: c });
  } catch (e) { return bad(e); }
}

export async function krakenspreadhist(a) {
  const p = parse(a.pair); if (!p) return needP; const kp = (p[0] === "BTC" ? "XBT" : p[0]) + p[1];
  try { const d = await g(`https://api.kraken.com/0/public/Spread?pair=${kp}`); if (d.error?.length) return R(404, { error: "unknown pair", pair: p.join("-") }); const [k, s] = Object.entries(d.result).find(([x]) => x !== "last");
    const l = s.map(([t, b, ak]) => { const B = +b, A = +ak, mid = (A + B) / 2; return { time: iso(t * 1000), bid: B, ask: A, spread_bps: r2(((A - B) / mid) * 1e4, 4) }; }); const sp = l.map((x) => x.spread_bps).sort((x, y) => x - y);
    return R(200, { pair: k, venue: "Kraken", samples: l.length, window_from: l[0]?.time, window_to: l.at(-1)?.time, avg_spread_bps: r2(sp.reduce((t, x) => t + x, 0) / sp.length, 4), median_spread_bps: sp[sp.length >> 1], p95_spread_bps: sp[Math.floor(sp.length * 0.95)], max_spread_bps: sp.at(-1), widest: [...l].sort((x, y) => y.spread_bps - x.spread_bps).slice(0, 10), recent: l.slice(-n(a.limit, 50, 1, 1000)) });
  } catch (e) { return bad(e); }
}

export async function deribitfutflow(a) {
  const c = String(a.currency || "BTC").toUpperCase(); if (!["BTC", "ETH"].includes(c)) return R(400, { error: "currency must be BTC or ETH" });
  try { const d = await g(`https://www.deribit.com/api/v2/public/get_last_trades_by_currency?currency=${c}&kind=future&count=1000`); const t = d.result?.trades || []; const m = {};
    for (const x of t) { const usd = x.instrument_name.includes("USDC") ? x.amount * x.price : x.amount; const i = (m[x.instrument_name] ||= { instrument: x.instrument_name, trades: 0, buy_usd: 0, sell_usd: 0, liquidations: 0, last_price: x.price }); i.trades++; i[x.direction === "buy" ? "buy_usd" : "sell_usd"] += usd; if (x.liquidation) i.liquidations++; }
    const l = Object.values(m).map((x) => ({ ...x, buy_usd: r2(x.buy_usd, 0), sell_usd: r2(x.sell_usd, 0), imbalance: r2((x.buy_usd - x.sell_usd) / (x.buy_usd + x.sell_usd || 1), 3) })).sort((x, y) => y.buy_usd + y.sell_usd - x.buy_usd - x.sell_usd); const B = l.reduce((s, x) => s + x.buy_usd, 0), S = l.reduce((s, x) => s + x.sell_usd, 0);
    return R(200, { currency: c, venue: "Deribit", trades: t.length, window_from: t.length ? iso(t.at(-1).timestamp) : null, window_to: t.length ? iso(t[0].timestamp) : null, buy_usd: B, sell_usd: S, imbalance: B + S ? r2((B - S) / (B + S), 3) : null, liquidation_trades: t.filter((x) => x.liquidation).length, instruments: l });
  } catch (e) { return bad(e); }
}
