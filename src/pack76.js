// pack76: kucointrades / okxtrades / bfxtrades (recent trade tape for a pair: taker buy vs sell quote, imbalance, VWAP, largest prints) + okxtickers (OKX spot tickers for up to 20 pairs: bid/ask/last/spread/24h change/volume)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const nf = (e) => { if (e.code >= 400 && e.code <= 500) return null; throw e; };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USDT" });
const iso = (t) => new Date(+t).toISOString();
const ut = (p) => `${p[0]}-${p[1] === "USD" ? "USDT" : p[1]}`;
function flow(pair, venue, l, lim) { // l: [{t ms, price, size, side}]
  l.sort((x, y) => y.t - x.t); const q = (s) => l.filter((x) => x.side === s).reduce((t, x) => t + x.price * x.size, 0); const B = q("buy"), S = q("sell"); const v = l.reduce((t, x) => t + x.size, 0);
  return R(200, { pair, venue, trades: l.length, window_from: iso(l.at(-1).t), window_to: iso(l[0].t), vwap: v ? r2((B + S) / v, 6) : null, taker_buy_quote: r2(B, 0), taker_sell_quote: r2(S, 0), imbalance: B + S ? r2((B - S) / (B + S), 3) : null, largest: [...l].sort((x, y) => y.price * y.size - x.price * x.size).slice(0, lim).map((x) => ({ time: iso(x.t), price: x.price, size: x.size, quote: r2(x.price * x.size), taker_side: x.side })) });
}
const nope = (v, p) => R(404, { error: `pair not on ${v} or no trades`, pair: p });

export async function kucointrades(a) {
  const p = parse(a.pair); if (!p) return needP; const s = ut(p);
  try { const d = await g(`https://api.kucoin.com/api/v1/market/histories?symbol=${s}`); if (d.code !== "200000" || !d.data?.length) return nope("KuCoin", s); return flow(s, "KuCoin", d.data.map((x) => ({ t: x.time / 1e6, price: +x.price, size: +x.size, side: x.side })), n(a.limit, 20, 1, 100)); } catch (e) { return bad(e); }
}
export async function okxtrades(a) {
  const p = parse(a.pair); if (!p) return needP; const s = ut(p);
  try { const d = await g(`https://www.okx.com/api/v5/market/trades?instId=${s}&limit=500`); if (d.code !== "0" || !d.data?.length) return nope("OKX", s); return flow(s, "OKX", d.data.map((x) => ({ t: +x.ts, price: +x.px, size: +x.sz, side: x.side })), n(a.limit, 20, 1, 200)); } catch (e) { return bad(e); }
}
export async function bfxtrades(a) {
  const p = parse(a.pair); if (!p) return needP; const s = "t" + p[0] + (p[0].length > 3 ? ":" : "") + (p[1] === "USDT" ? "UST" : p[1]);
  try { const d = await g(`https://api-pub.bitfinex.com/v2/trades/${s}/hist?limit=1000`).catch(nf); if (!Array.isArray(d) || !d.length) return nope("Bitfinex", s); return flow(p.join("-"), "Bitfinex", d.map(([, t, amt, px]) => ({ t, price: px, size: Math.abs(amt), side: amt > 0 ? "buy" : "sell" })), n(a.limit, 20, 1, 200)); } catch (e) { return bad(e); }
}
export async function okxtickers(a) {
  const ps = String(a.pairs || "").split(",").map((x) => x.trim()).filter(Boolean); if (!ps.length || ps.length > 20) return R(400, { error: "pairs required: 1-20 comma-separated, e.g. BTC-USDT,ETH-USDT" }); const pp = ps.map(parse); if (pp.some((x) => !x)) return R(400, { error: "bad pair format", pairs: ps });
  try { const l = await Promise.all(pp.map(async (p) => { const id = ut(p); const d = await g(`https://www.okx.com/api/v5/market/ticker?instId=${id}`).catch(() => null); const t = d?.data?.[0]; if (!t) return { pair: id, found: false }; const bid = +t.bidPx, ask = +t.askPx, last = +t.last;
      return { pair: id, found: true, bid, ask, last, spread_bps: r2(((ask - bid) / ((ask + bid) / 2)) * 1e4, 3), change_24h_pct: r2((last / +t.open24h - 1) * 100, 3), high_24h: +t.high24h, low_24h: +t.low24h, volume_24h_base: r2(+t.vol24h, 4), volume_24h_quote: r2(+t.volCcy24h, 0), time: iso(t.ts) }; }));
    return R(200, { venue: "OKX", requested: l.length, found: l.filter((x) => x.found).length, list: l });
  } catch (e) { return bad(e); }
}
