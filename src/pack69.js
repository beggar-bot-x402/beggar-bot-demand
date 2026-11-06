// pack69: cexarb (same pair across Kraken/Coinbase/Bitstamp/Deribit index: spread + best venues), deribitsettle (Deribit BTC/ETH expiry delivery prices & settlement history), krakentrades (recent Kraken trades: buy/sell volume imbalance, VWAP, large prints), cexvolume (24h and 30d volume for a pair across Kraken/Coinbase/Bitstamp)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USD, ETH/USD, SOLUSD" });
const kr = async (b, q) => { const d = await g(`https://api.kraken.com/0/public/Ticker?pair=${b === "BTC" ? "XBT" : b}${q}`); if (d.error?.length) throw new Error(d.error[0]); const t = Object.values(d.result)[0]; return { venue: "Kraken", bid: +t.b[0], ask: +t.a[0], last: +t.c[0], volume_24h_base: +t.v[1] }; };
const cb = async (b, q) => { const [t, s] = await Promise.all([g(`https://api.exchange.coinbase.com/products/${b}-${q}/ticker`), g(`https://api.exchange.coinbase.com/products/${b}-${q}/stats`).catch(() => ({}))]); return { venue: "Coinbase", bid: +t.bid, ask: +t.ask, last: +t.price, volume_24h_base: +t.volume, volume_30d_base: s.volume_30day ? +s.volume_30day : null }; };
const bs = async (b, q) => { const t = await g(`https://www.bitstamp.net/api/v2/ticker/${(b + q).toLowerCase()}/`); return { venue: "Bitstamp", bid: +t.bid, ask: +t.ask, last: +t.last, volume_24h_base: +t.volume, vwap_24h: +t.vwap }; };
const venues = async (b, q) => (await Promise.allSettled([kr(b, q), cb(b, q), bs(b, q)])).map((x, i) => (x.status === "fulfilled" && x.value.bid > 0 ? x.value : { venue: ["Kraken", "Coinbase", "Bitstamp"][i], error: "unavailable" }));

export async function cexarb(a) {
  const p = parse(a.pair); if (!p) return needP;
  try { const v = await venues(...p); const ok = v.filter((x) => !x.error).map((x) => ({ ...x, mid: (x.bid + x.ask) / 2, spread_bps: r2(((x.ask - x.bid) / ((x.ask + x.bid) / 2)) * 1e4, 3) })); if (!ok.length) return R(404, { error: "pair not found on any venue", pair: p.join("-") });
    const bb = ok.reduce((x, y) => (y.bid > x.bid ? y : x)), ba = ok.reduce((x, y) => (y.ask < x.ask ? y : x)); const mids = ok.map((x) => x.mid); const avg = mids.reduce((s, x) => s + x, 0) / mids.length;
    return R(200, { pair: p.join("-"), venues_ok: ok.length, avg_mid: r2(avg, 6), max_mid_dispersion_bps: r2(((Math.max(...mids) - Math.min(...mids)) / avg) * 1e4, 2), best_bid: { venue: bb.venue, price: bb.bid }, best_ask: { venue: ba.venue, price: ba.ask }, cross_venue_edge_bps: r2(((bb.bid - ba.ask) / avg) * 1e4, 2), arb_open: bb.bid > ba.ask && bb.venue !== ba.venue, venues: v.map((x) => (x.error ? x : { venue: x.venue, bid: x.bid, ask: x.ask, last: x.last, spread_bps: r2(((x.ask - x.bid) / ((x.ask + x.bid) / 2)) * 1e4, 3), vs_avg_bps: r2((((x.bid + x.ask) / 2 - avg) / avg) * 1e4, 2) })) });
  } catch (e) { return bad(e); }
}

export async function cexvolume(a) {
  const p = parse(a.pair); if (!p) return needP;
  try { const v = await venues(...p); const ok = v.filter((x) => !x.error); if (!ok.length) return R(404, { error: "pair not found on any venue", pair: p.join("-") }); const tot = ok.reduce((s, x) => s + x.volume_24h_base, 0); const px = ok[0].last;
    return R(200, { pair: p.join("-"), total_24h_base: r2(tot, 4), total_24h_quote: r2(tot * px, 0), venues: v.map((x) => (x.error ? x : { venue: x.venue, volume_24h_base: r2(x.volume_24h_base, 4), volume_24h_quote: r2(x.volume_24h_base * x.last, 0), share_pct: tot ? r2((x.volume_24h_base / tot) * 100) : null, volume_30d_base: x.volume_30d_base ?? null, vwap_24h: x.vwap_24h ?? null })).sort((x, y) => (y.volume_24h_base || 0) - (x.volume_24h_base || 0)) });
  } catch (e) { return bad(e); }
}

export async function deribitsettle(a) {
  const c = String(a.currency || "BTC").toUpperCase(); if (!["BTC", "ETH"].includes(c)) return R(400, { error: "currency must be BTC or ETH" }); const t = ["delivery", "settlement"].includes(a.type) ? a.type : "delivery";
  try { const d = await g(`https://www.deribit.com/api/v2/public/get_last_settlements_by_currency?currency=${c}&type=${t}&count=${n(a.limit, 50, 1, 1000)}`); const s = (d.result?.settlements || []).map((x) => ({ time: new Date(x.timestamp).toISOString(), instrument: x.instrument_name || null, index_price: x.index_price, mark_price: x.mark_price, position: x.position ?? null, session_pnl: r2(x.session_profit_loss, 4) }));
    const exp = [...new Map(s.filter((x) => x.instrument).map((x) => [x.instrument.split("-")[1], x])).values()];
    return R(200, { currency: c, type: t, venue: "Deribit", count: s.length, latest: s[0] || null, expiries: exp.map((x) => ({ expiry: x.instrument.split("-")[1], time: x.time, delivery_price: x.index_price })), list: s });
  } catch (e) { return bad(e); }
}

export async function krakentrades(a) {
  const p = parse(a.pair); if (!p) return needP; const kp = (p[0] === "BTC" ? "XBT" : p[0]) + p[1];
  try { const d = await g(`https://api.kraken.com/0/public/Trades?pair=${kp}&count=1000`); if (d.error?.length) return R(404, { error: "unknown pair", pair: p.join("-") }); const [k, t] = Object.entries(d.result).find(([x]) => x !== "last");
    const l = t.map(([px, v, ts, side, type]) => ({ price: +px, volume: +v, quote: +px * +v, time: ts, side: side === "b" ? "buy" : "sell", type: type === "m" ? "market" : "limit" })); const q = (f) => l.filter(f).reduce((s, x) => s + x.quote, 0);
    const B = q((x) => x.side === "buy"), S = q((x) => x.side === "sell"); const vol = l.reduce((s, x) => s + x.volume, 0); const mn = n(a.min_quote, 0, 0, 1e12);
    return R(200, { pair: k, venue: "Kraken", trades: l.length, window_from: new Date(l[0].time * 1000).toISOString(), window_to: new Date(l.at(-1).time * 1000).toISOString(), vwap: r2(B + S ? (B + S) / vol : null, 6), buy_quote: r2(B, 0), sell_quote: r2(S, 0), buy_sell_imbalance: B + S ? r2((B - S) / (B + S), 3) : null, market_order_share_pct: r2((q((x) => x.type === "market") / (B + S)) * 100), largest: l.filter((x) => x.quote >= mn).sort((x, y) => y.quote - x.quote).slice(0, n(a.limit, 20, 1, 200)).map((x) => ({ ...x, quote: r2(x.quote, 2), time: new Date(x.time * 1000).toISOString() })) });
  } catch (e) { return bad(e); }
}
