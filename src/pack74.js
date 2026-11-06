// pack74: bfxpositions (Bitfinex aggregate margin long vs short position size history for a pair), geminitrades (Gemini recent trades: taker buy/sell flow, VWAP, large prints), kucoinfunding (KuCoin futures perp funding: current, predicted cap/floor, history, annualized), bfxticker (Bitfinex ticker for many pairs at once: bid/ask/last/change/volume)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const nf = (e) => { if (e.code >= 400 && e.code <= 500) return null; throw e; };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USD" });
const iso = (t) => new Date(+t).toISOString();
const bfx = (b, q) => "t" + (b === "USDT" ? "UST" : b) + (b.length > 3 ? ":" : "") + (q === "USDT" ? "UST" : q);

export async function bfxpositions(a) {
  const p = parse(a.pair); if (!p) return needP; const s = bfx(...p); const tf = ["1m", "1h", "1D"].includes(a.interval) ? a.interval : "1h"; const lim = n(a.limit, 48, 2, 500);
  try { const [L, S] = await Promise.all(["long", "short"].map((x) => g(`https://api-pub.bitfinex.com/v2/stats1/pos.size:${tf}:${s}:${x}/hist?limit=${lim}`).catch(nf))); if (!L?.length) return R(404, { error: "no Bitfinex margin position stats for pair", symbol: s });
    const sm = new Map((S || []).map(([t, v]) => [t, v])); const l = L.map(([t, v]) => { const sh = sm.get(t) ?? null; return { time: iso(t), long: r2(v, 4), short: sh == null ? null : r2(sh, 4), long_short_ratio: sh ? r2(v / sh, 3) : null }; });
    return R(200, { symbol: s, venue: "Bitfinex", interval: tf, unit: p[0], latest: l[0], long_change_pct: r2((l[0].long / l.at(-1).long - 1) * 100, 3), short_change_pct: l[0].short && l.at(-1).short ? r2((l[0].short / l.at(-1).short - 1) * 100, 3) : null, list: l });
  } catch (e) { return bad(e); }
}

export async function geminitrades(a) {
  const p = parse(a.pair); if (!p) return needP;
  try { const d = await g(`https://api.gemini.com/v1/trades/${(p[0] + p[1]).toLowerCase()}?limit_trades=500`).catch(nf); if (!Array.isArray(d) || !d.length) return R(404, { error: "pair not on Gemini or no trades", pair: p.join("-") });
    const l = d.map((x) => ({ time: iso(x.timestampms), price: +x.price, size: +x.amount, quote: +x.price * +x.amount, taker_side: x.type })); const q = (s) => l.filter((x) => x.taker_side === s).reduce((t, x) => t + x.quote, 0); const B = q("buy"), S = q("sell"); const v = l.reduce((t, x) => t + x.size, 0);
    return R(200, { pair: p.join("-"), venue: "Gemini", trades: l.length, window_from: l.at(-1).time, window_to: l[0].time, vwap: r2((B + S) / v, 6), taker_buy_quote: r2(B, 0), taker_sell_quote: r2(S, 0), imbalance: B + S ? r2((B - S) / (B + S), 3) : null, largest: [...l].sort((x, y) => y.quote - x.quote).slice(0, n(a.limit, 20, 1, 200)).map((x) => ({ ...x, quote: r2(x.quote) })) });
  } catch (e) { return bad(e); }
}

export async function kucoinfunding(a) {
  const c = /^[A-Za-z0-9]{2,10}$/.test(String(a.coin || "")) ? String(a.coin).toUpperCase() : null; if (!c) return R(400, { error: "coin required, e.g. BTC, ETH, SOL" }); const sym = (c === "BTC" ? "XBT" : c) + "USDTM"; const days = n(a.days, 7, 1, 30);
  try { const [cur, h] = await Promise.all([g(`https://api-futures.kucoin.com/api/v1/funding-rate/${sym}/current`), g(`https://api-futures.kucoin.com/api/v1/contract/funding-rates?symbol=${sym}&from=${Date.now() - days * 864e5}&to=${Date.now()}`).catch(() => ({}))]); const x = cur.data; if (cur.code !== "200000" || !x) return R(404, { error: "no KuCoin perpetual for coin", symbol: sym, upstream: cur.msg || null });
    const ppd = 864e5 / (x.granularity || 288e5); const l = (h.data || []).map((y) => ({ time: iso(y.timepoint), rate_pct: r2(y.fundingRate * 100, 5) })); const avg = l.length ? l.reduce((s, y) => s + y.rate_pct, 0) / l.length : null;
    return R(200, { symbol: sym, venue: "KuCoin Futures", interval_hours: r2((x.granularity || 288e5) / 36e5, 2), current_rate_pct: r2(x.value * 100, 5), current_annualized_pct: r2(x.value * 100 * ppd * 365), predicted_rate_pct: x.predictedValue != null ? r2(x.predictedValue * 100, 5) : null, cap_pct: r2(x.fundingRateCap * 100, 4), floor_pct: r2(x.fundingRateFloor * 100, 4), last_time: iso(x.timePoint), history_days: days, history_count: l.length, history_avg_pct: r2(avg, 5), history_avg_annualized_pct: r2(avg * ppd * 365), history: l });
  } catch (e) { return bad(e); }
}

export async function bfxticker(a) {
  const ps = String(a.pairs || "").split(",").map((x) => x.trim()).filter(Boolean); if (!ps.length || ps.length > 50) return R(400, { error: "pairs required: 1-50 comma-separated, e.g. BTC-USD,ETH-USD,SOL-USD" }); const pp = ps.map(parse); if (pp.some((x) => !x)) return R(400, { error: "bad pair format", pairs: ps });
  try { const syms = pp.map((x) => bfx(...x)); const d = await g(`https://api-pub.bitfinex.com/v2/tickers?symbols=${syms.join(",")}`); const m = new Map(d.map((x) => [x[0], x]));
    const l = pp.map((p, i) => { const t = m.get(syms[i]); if (!t) return { pair: p.join("-"), found: false }; const [, bid, , ask, , chg, chgp, last, vol, hi, lo] = t; return { pair: p.join("-"), symbol: syms[i], found: true, bid, ask, last, spread_bps: r2(((ask - bid) / ((ask + bid) / 2)) * 1e4, 3), change_24h_pct: r2(chgp * 100, 3), high_24h: hi, low_24h: lo, volume_24h_base: r2(vol, 4), volume_24h_quote: r2(vol * last, 0) }; });
    return R(200, { venue: "Bitfinex", requested: l.length, found: l.filter((x) => x.found).length, list: l });
  } catch (e) { return bad(e); }
}
