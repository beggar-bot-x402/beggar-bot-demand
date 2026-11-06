// pack30: tokenvol (volatility/drawdown), tokencorr (price correlation/beta), stableyields (best stablecoin pools), categorytvl (DeFi TVL by category)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
async function j(u) { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const cid = (t) => { t = (t || "").trim(); if (/^[a-z0-9-]+:0x[0-9a-fA-F]{40}$/.test(t) || /^coingecko:[a-z0-9-]{2,60}$/.test(t)) return t; if (/^[a-z0-9-]{2,60}$/.test(t)) return "coingecko:" + t; return null; };
async function series(id, days) { const d = await j(`https://coins.llama.fi/chart/${id}?span=${days + 1}&period=1d`); const c = d.coins?.[id]; return c ? { symbol: c.symbol, px: c.prices.map((p) => p.price) } : null; }
const rets = (px) => px.slice(1).map((p, i) => Math.log(p / px[i]));
const sd = (x) => { const m = x.reduce((s, v) => s + v, 0) / x.length; return Math.sqrt(x.reduce((s, v) => s + (v - m) ** 2, 0) / (x.length - 1)); };
const usage = 'token = coingecko id (ethereum), coingecko:id, or chain:0xaddress (base:0x...)';

export async function tokenvol(a) {
  const id = cid(a.token); if (!id) return R(400, { error: "token required: " + usage }); const days = n(a.days, 30, 7, 365);
  try {
    const s = await series(id, days); if (!s || s.px.length < 5) return R(404, { error: "no price history", token: id }); const r = rets(s.px); const v = sd(r);
    let peak = s.px[0], mdd = 0; for (const p of s.px) { peak = Math.max(peak, p); mdd = Math.min(mdd, p / peak - 1); }
    const tot = s.px.at(-1) / s.px[0] - 1;
    return R(200, { source: "defillama", token: id, symbol: s.symbol, days: s.px.length - 1, price: s.px.at(-1), return_pct: +(100 * tot).toFixed(2), daily_vol_pct: +(100 * v).toFixed(3), annualized_vol_pct: +(100 * v * Math.sqrt(365)).toFixed(2), max_drawdown_pct: +(100 * mdd).toFixed(2), from_peak_pct: +(100 * (s.px.at(-1) / peak - 1)).toFixed(2), best_day_pct: +(100 * (Math.exp(Math.max(...r)) - 1)).toFixed(2), worst_day_pct: +(100 * (Math.exp(Math.min(...r)) - 1)).toFixed(2), up_days: r.filter((x) => x > 0).length, down_days: r.filter((x) => x < 0).length });
  } catch (e) { return bad(e); }
}

export async function tokencorr(a) {
  const x = cid(a.token), y = cid(a.vs || "bitcoin"); if (!x || !y) return R(400, { error: "token required (and optional vs, default bitcoin): " + usage }); const days = n(a.days, 30, 7, 365);
  try {
    const [s1, s2] = await Promise.all([series(x, days), series(y, days)]); if (!s1 || !s2) return R(404, { error: "no price history", token: x, vs: y });
    const L = Math.min(s1.px.length, s2.px.length); if (L < 5) return R(404, { error: "not enough history" }); const r1 = rets(s1.px.slice(-L)), r2 = rets(s2.px.slice(-L));
    const m1 = r1.reduce((s, v) => s + v, 0) / r1.length, m2 = r2.reduce((s, v) => s + v, 0) / r2.length; let cov = 0; for (let i = 0; i < r1.length; i++) cov += (r1[i] - m1) * (r2[i] - m2); cov /= r1.length - 1;
    const c = cov / (sd(r1) * sd(r2)), beta = cov / sd(r2) ** 2;
    return R(200, { source: "defillama", token: x, symbol: s1.symbol, vs: y, vs_symbol: s2.symbol, days: L - 1, correlation: +c.toFixed(4), beta: +beta.toFixed(4), r_squared: +(c * c).toFixed(4), token_vol_ann_pct: +(100 * sd(r1) * Math.sqrt(365)).toFixed(2), vs_vol_ann_pct: +(100 * sd(r2) * Math.sqrt(365)).toFixed(2), token_return_pct: +(100 * (s1.px.at(-1) / s1.px.at(-L) - 1)).toFixed(2), vs_return_pct: +(100 * (s2.px.at(-1) / s2.px.at(-L) - 1)).toFixed(2) });
  } catch (e) { return bad(e); }
}

export async function stableyields(a) {
  try {
    const d = await j("https://yields.llama.fi/pools"); const minTvl = n(a.min_tvl, 1e6, 0, 1e12); const ch = a.chain?.toLowerCase(), sym = a.symbol?.toUpperCase();
    let p = d.data.filter((x) => x.stablecoin && x.tvlUsd >= minTvl && x.apy != null && x.apy < 200 && (!ch || x.chain.toLowerCase() === ch) && (!sym || x.symbol.toUpperCase().split("-").includes(sym)) && (a.no_il !== "true" || x.ilRisk === "no"));
    p.sort((q, r) => r.apy - q.apy); const tv = p.reduce((s, x) => s + x.tvlUsd, 0), w = tv ? p.reduce((s, x) => s + x.apy * x.tvlUsd, 0) / tv : null;
    return R(200, { source: "defillama", filters: { chain: a.chain || null, symbol: sym || null, min_tvl: minTvl }, pools: p.length, tvl_usd: Math.round(tv), tvl_weighted_apy_pct: w && +w.toFixed(3), list: p.slice(0, n(a.limit, 25, 1, 200)).map((x) => ({ pool: x.pool, project: x.project, chain: x.chain, symbol: x.symbol, apy_pct: +x.apy.toFixed(3), apy_base_pct: x.apyBase != null ? +x.apyBase.toFixed(3) : null, apy_reward_pct: x.apyReward != null ? +x.apyReward.toFixed(3) : null, apy_mean_30d_pct: x.apyMean30d != null ? +x.apyMean30d.toFixed(3) : null, tvl_usd: Math.round(x.tvlUsd), il_risk: x.ilRisk, exposure: x.exposure })) });
  } catch (e) { return bad(e); }
}

export async function categorytvl(a) {
  try {
    const d = await j("https://api.llama.fi/protocols"); const ch = a.chain?.toLowerCase(); const m = {};
    for (const p of d) { if (!p.category || p.category === "CEX") continue; let t = p.tvl || 0, c1 = p.change_1d, c7 = p.change_7d; if (ch) { const k = Object.keys(p.chainTvls || {}).find((x) => x.toLowerCase() === ch); if (!k) continue; t = p.chainTvls[k]; } if (!(t > 0)) continue;
      const e = (m[p.category] ||= { category: p.category, tvl_usd: 0, protocols: 0, prev7: 0, top: [] }); e.tvl_usd += t; e.protocols++; if (c7 != null && c7 > -100) e.prev7 += t / (1 + c7 / 100); else e.prev7 += t; e.top.push([p.name, t]); }
    const rows = Object.values(m).map((e) => ({ category: e.category, tvl_usd: Math.round(e.tvl_usd), protocols: e.protocols, change_7d_pct: e.prev7 ? +((100 * (e.tvl_usd - e.prev7)) / e.prev7).toFixed(2) : null, top_protocols: e.top.sort((p, q) => q[1] - p[1]).slice(0, 5).map(([name, t]) => ({ name, tvl_usd: Math.round(t) })) })).sort((p, q) => q.tvl_usd - p.tvl_usd);
    if (ch && !rows.length) return R(404, { error: "unknown chain", chain: a.chain }); const tot = rows.reduce((s, x) => s + x.tvl_usd, 0); rows.forEach((x) => (x.share_pct = +((100 * x.tvl_usd) / tot).toFixed(2)));
    return R(200, { source: "defillama", chain: a.chain || "all", total_tvl_usd: tot, categories: rows.length, list: rows.slice(0, n(a.limit, 30, 1, 100)) });
  } catch (e) { return bad(e); }
}
