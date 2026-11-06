// pack72: okxfunding (OKX perp funding: current + history, annualized), okxlongshort (OKX long/short account ratio history for a coin), geminibook (Gemini order book depth, imbalance, slippage), kucoinstats (KuCoin 24h stats: change, range, volume, bid/ask)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const nf = (e) => { if (e.code === 404 || e.code === 400) return null; throw e; };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USD, ETH/USDT" });
const coin = (c) => (/^[A-Za-z0-9]{2,10}$/.test(String(c || "")) ? String(c).toUpperCase() : null);
const iso = (t) => new Date(+t).toISOString();
const OKX = "https://www.okx.com/api/v5";

export async function okxfunding(a) {
  const c = coin(a.coin); if (!c) return R(400, { error: "coin required, e.g. BTC, ETH, SOL" }); const q = String(a.quote || "USDT").toUpperCase() === "USD" ? "USD" : "USDT"; const id = `${c}-${q}-SWAP`;
  try { const [cur, h] = await Promise.all([g(`${OKX}/public/funding-rate?instId=${id}`), g(`${OKX}/public/funding-rate-history?instId=${id}&limit=${n(a.limit, 90, 1, 100)}`)]); if (cur.code !== "0" || !cur.data?.length) return R(404, { error: "no OKX perpetual for coin", instrument: id, upstream: cur.msg || null });
    const x = cur.data[0]; const l = (h.data || []).map((y) => ({ time: iso(y.fundingTime), rate_pct: r2(+y.realizedRate * 100, 5) })); const avg = l.length ? l.reduce((s, y) => s + y.rate_pct, 0) / l.length : null;
    return R(200, { instrument: id, venue: "OKX", current_rate_pct: r2(+x.fundingRate * 100, 5), next_funding_time: iso(x.fundingTime), current_annualized_pct: r2(+x.fundingRate * 100 * 3 * 365), history_count: l.length, history_avg_pct: r2(avg, 5), history_avg_annualized_pct: r2(avg * 3 * 365), positive_periods: l.filter((y) => y.rate_pct > 0).length, history: l });
  } catch (e) { return bad(e); }
}

export async function okxlongshort(a) {
  const c = coin(a.coin); if (!c) return R(400, { error: "coin required, e.g. BTC, ETH" }); const per = ["5m", "1H", "1D"].includes(a.period) ? a.period : "1H";
  try { const d = await g(`${OKX}/rubik/stat/contracts/long-short-account-ratio?ccy=${c}&period=${per}`); if (d.code !== "0" || !d.data?.length) return R(404, { error: "no long/short data for coin", coin: c, upstream: d.msg || null });
    const l = d.data.slice(0, n(a.limit, 48, 1, 500)).map(([t, r]) => ({ time: iso(t), ratio: +r, long_pct: r2((+r / (1 + +r)) * 100) })); const rs = l.map((x) => x.ratio);
    return R(200, { coin: c, venue: "OKX", period: per, latest: l[0], change_vs_oldest: r2(l[0].ratio - l.at(-1).ratio, 3), min: Math.min(...rs), max: Math.max(...rs), avg: r2(rs.reduce((s, x) => s + x, 0) / rs.length, 3), list: l });
  } catch (e) { return bad(e); }
}

export async function geminibook(a) {
  const p = parse(a.pair); if (!p) return needP; const size = n(a.size_quote, 100000, 1, 1e10);
  try { const d = await g(`https://api.gemini.com/v1/book/${(p[0] + p[1]).toLowerCase()}?limit_bids=500&limit_asks=500`).catch(nf); if (!d?.bids?.length) return R(404, { error: "pair not on Gemini", pair: p.join("-") });
    const B = d.bids.map((x) => [+x.price, +x.amount]), A = d.asks.map((x) => [+x.price, +x.amount]); const mid = (B[0][0] + A[0][0]) / 2;
    const depth = (s, bps) => s.filter(([x]) => Math.abs(x - mid) / mid <= bps / 1e4).reduce((t, [x, y]) => t + x * y, 0);
    const walk = (s) => { let q = size, base = 0; for (const [x, y] of s) { const tk = Math.min(q, x * y); base += tk / x; q -= tk; if (q <= 0) break; } return q > 0 ? null : r2((Math.abs(size / base - mid) / mid) * 1e4, 3); };
    return R(200, { pair: p.join("-"), venue: "Gemini", best_bid: B[0][0], best_ask: A[0][0], mid: r2(mid, 6), spread_bps: r2(((A[0][0] - B[0][0]) / mid) * 1e4, 3), levels: { bids: B.length, asks: A.length }, depth: [10, 50, 100, 200].map((b) => { const bd = depth(B, b), ad = depth(A, b); return { band_bps: b, bid_quote: r2(bd, 0), ask_quote: r2(ad, 0), imbalance: bd + ad ? r2((bd - ad) / (bd + ad), 3) : null }; }), slippage_for_size: { size_quote: size, buy_bps: walk(A), sell_bps: walk(B) } });
  } catch (e) { return bad(e); }
}

export async function kucoinstats(a) {
  const p = parse(a.pair); if (!p) return needP; const sym = `${p[0]}-${p[1] === "USD" ? "USDT" : p[1]}`;
  try { const d = await g(`https://api.kucoin.com/api/v1/market/stats?symbol=${sym}`); const x = d.data; if (d.code !== "200000" || !x?.last) return R(404, { error: "pair not on KuCoin", pair: sym });
    const bid = +x.buy, ask = +x.sell, mid = (bid + ask) / 2;
    return R(200, { pair: sym, venue: "KuCoin", time: iso(x.time), last: +x.last, bid, ask, spread_bps: r2(((ask - bid) / mid) * 1e4, 3), change_pct: r2(+x.changeRate * 100, 3), high_24h: +x.high, low_24h: +x.low, range_pct: r2((+x.high / +x.low - 1) * 100, 3), volume_24h_base: +x.vol, volume_24h_quote: r2(+x.volValue, 0), avg_price_24h: x.averagePrice ? +x.averagePrice : null, taker_fee: x.takerFeeRate ? +x.takerFeeRate : null });
  } catch (e) { return bad(e); }
}
