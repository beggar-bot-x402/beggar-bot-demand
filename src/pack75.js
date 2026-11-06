// pack75: geminicandles, kucoinohlc, okxohlc, bfxohlc: OHLCV candles from Gemini / KuCoin / OKX / Bitfinex with change, range, annualized realized vol and volume
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const nf = (e) => { if (e.code >= 400 && e.code <= 500) return null; throw e; };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USD" });
const SEC = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400 };
const badI = (m) => R(400, { error: "interval must be one of " + Object.keys(m).join(",") });
// rows: [ms, o, h, l, c, v] any order -> sorted oldest first
function stats(pair, venue, iv, rows, lim) {
  const c = rows.map(([t, o, h, l, cl, v]) => ({ time: new Date(+t).toISOString(), open: +o, high: +h, low: +l, close: +cl, volume: +v })).sort((x, y) => (x.time < y.time ? -1 : 1)).slice(-lim);
  const rets = c.slice(1).map((x, i) => Math.log(x.close / c[i].close)); const m = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length); const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, rets.length - 1));
  const hi = Math.max(...c.map((x) => x.high)), lo = Math.min(...c.map((x) => x.low));
  return R(200, { pair, venue, interval: iv, candles: c.length, change_pct: r2((c.at(-1).close / c[0].open - 1) * 100, 3), high: hi, low: lo, range_pct: r2((hi / lo - 1) * 100, 3), realized_vol_annualized_pct: r2(sd * Math.sqrt((365 * 86400) / SEC[iv]) * 100), total_volume: r2(c.reduce((s, x) => s + x.volume, 0), 4), up_candles: c.filter((x) => x.close >= x.open).length, list: c });
}
const nope = (v, p) => R(404, { error: `pair not on ${v}`, pair: p });

const GI = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1hr", "6h": "6hr", "1d": "1day" };
export async function geminicandles(a) {
  const p = parse(a.pair); if (!p) return needP; const iv = a.interval || "1h"; if (!GI[iv]) return badI(GI);
  try { const d = await g(`https://api.gemini.com/v2/candles/${(p[0] + p[1]).toLowerCase()}/${GI[iv]}`).catch(nf); if (!Array.isArray(d) || !d.length) return nope("Gemini", p.join("-")); return stats(p.join("-"), "Gemini", iv, d, n(a.limit, 100, 2, 1000)); } catch (e) { return bad(e); }
}
const KI = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1hour", "6h": "6hour", "1d": "1day" };
export async function kucoinohlc(a) {
  const p = parse(a.pair); if (!p) return needP; const iv = a.interval || "1h"; if (!KI[iv]) return badI(KI); const sym = `${p[0]}-${p[1] === "USD" ? "USDT" : p[1]}`;
  try { const d = await g(`https://api.kucoin.com/api/v1/market/candles?type=${KI[iv]}&symbol=${sym}`); if (d.code !== "200000" || !d.data?.length) return nope("KuCoin", sym); return stats(sym, "KuCoin", iv, d.data.map(([t, o, c, h, l, v]) => [t * 1000, o, h, l, c, v]), n(a.limit, 100, 2, 1500)); } catch (e) { return bad(e); }
}
const OI = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "6h": "6Hutc", "1d": "1Dutc" };
export async function okxohlc(a) {
  const p = parse(a.pair); if (!p) return needP; const iv = a.interval || "1h"; if (!OI[iv]) return badI(OI); const id = `${p[0]}-${p[1] === "USD" ? "USDT" : p[1]}`;
  try { const d = await g(`https://www.okx.com/api/v5/market/candles?instId=${id}&bar=${OI[iv]}&limit=${n(a.limit, 100, 2, 300)}`); if (d.code !== "0" || !d.data?.length) return nope("OKX", id); return stats(id, "OKX", iv, d.data, 300); } catch (e) { return bad(e); }
}
const BI = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "6h": "6h", "1d": "1D" };
export async function bfxohlc(a) {
  const p = parse(a.pair); if (!p) return needP; const iv = a.interval || "1h"; if (!BI[iv]) return badI(BI); const s = "t" + p[0] + (p[0].length > 3 ? ":" : "") + (p[1] === "USDT" ? "UST" : p[1]);
  try { const d = await g(`https://api-pub.bitfinex.com/v2/candles/trade:${BI[iv]}:${s}/hist?limit=${n(a.limit, 100, 2, 1000)}`).catch(nf); if (!Array.isArray(d) || !d.length) return nope("Bitfinex", s); return stats(p.join("-"), "Bitfinex", iv, d.map(([t, o, c, h, l, v]) => [t, o, h, l, c, v]), 1000); } catch (e) { return bad(e); }
}
