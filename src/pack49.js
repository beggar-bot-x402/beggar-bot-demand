// pack49: poolhashrate (one mining pool's hashrate/share history), btcdiffadj (difficulty adjustment history), stabledominance (stablecoin market share by coin, peg type, mechanism), stablegrowth (fastest-growing/shrinking stablecoins)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);

export async function poolhashrate(a) {
  const p = String(a.pool || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (!p) return R(400, { error: "pool required: mempool pool slug, e.g. foundryusa, antpool, f2pool, viabtc" });
  try { const d = await j("https://mempool.space/api/v1/mining/pool/" + p + "/hashrate"); if (!d.length) return R(404, { error: "pool not found", pool: p }); const w = n(a.weeks, 52, 1, 1000); const l = d.slice(-w).map((x) => ({ date: day(x.timestamp), hashrate_ehs: r2(x.avgHashrate / 1e18), share_pct: r2(x.share * 100) })); const f = l[0], z = l[l.length - 1];
    return R(200, { chain: "bitcoin", pool: d[0].poolName, slug: p, points: l.length, latest: z, share_change_pts: r2(z.share_pct - f.share_pct), hashrate_change_pct: f.hashrate_ehs ? r2((100 * (z.hashrate_ehs - f.hashrate_ehs)) / f.hashrate_ehs) : null, peak_share: l.reduce((m, x) => (x.share_pct > m.share_pct ? x : m), l[0]), list: l }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "pool not found", pool: p }) : bad(e); }
}

export async function btcdiffadj(a) {
  const per = ["3m", "6m", "1y", "2y", "3y", "all"].includes(a.period) ? a.period : "1y";
  try { const d = await j("https://mempool.space/api/v1/mining/difficulty-adjustments/" + per); const l = d.map(([t, h, diff, ch]) => ({ date: day(t), height: h, difficulty_t: r2(diff / 1e12), change_pct: r2((ch - 1) * 100) })); const cs = l.map((x) => x.change_pct); const f = l[l.length - 1], z = l[0];
    return R(200, { chain: "bitcoin", period: per, adjustments: l.length, latest: z, cumulative_change_pct: f ? r2((100 * (z.difficulty_t - f.difficulty_t)) / f.difficulty_t) : null, avg_change_pct: r2(cs.reduce((s, x) => s + x, 0) / (cs.length || 1)), up: cs.filter((x) => x > 0).length, down: cs.filter((x) => x < 0).length, biggest_up: l.reduce((m, x) => (x.change_pct > m.change_pct ? x : m), l[0]), biggest_down: l.reduce((m, x) => (x.change_pct < m.change_pct ? x : m), l[0]), list: l.slice(0, n(a.limit, 60, 1, 1000)) }); } catch (e) { return bad(e); }
}

const circ = (c, k = "circulating") => Object.values(c[k] || {})[0] || 0;
async function stables() { const d = await j("https://stablecoins.llama.fi/stablecoins?includePrices=true"); return (d.peggedAssets || []).map((c) => ({ name: c.name, symbol: c.symbol, peg: c.pegType?.replace("pegged", "") || null, mechanism: c.pegMechanism, now: circ(c) * (c.pegType === "peggedUSD" ? 1 : c.price || 0), wk: circ(c, "circulatingPrevWeek") * (c.pegType === "peggedUSD" ? 1 : c.price || 0), mo: circ(c, "circulatingPrevMonth") * (c.pegType === "peggedUSD" ? 1 : c.price || 0) })).filter((c) => c.now > 0); }

export async function stabledominance(a) {
  try { const s = await stables(); const tot = s.reduce((x, c) => x + c.now, 0); const grp = (k) => { const g = {}; s.forEach((c) => { g[c[k] || "unknown"] = (g[c[k] || "unknown"] || 0) + c.now; }); return Object.entries(g).sort((x, y) => y[1] - x[1]).map(([key, v]) => ({ [k]: key, usd: Math.round(v), share_pct: r2((100 * v) / tot) })); }; s.sort((x, y) => y.now - x.now);
    const hhi = s.reduce((x, c) => x + Math.pow((100 * c.now) / tot, 2), 0);
    return R(200, { source: "defillama", total_usd: Math.round(tot), coins: s.length, hhi: Math.round(hhi), concentration: hhi > 2500 ? "high" : hhi > 1500 ? "moderate" : "low", by_peg: grp("peg"), by_mechanism: grp("mechanism"), list: s.slice(0, n(a.limit, 20, 1, 300)).map((c) => ({ name: c.name, symbol: c.symbol, peg: c.peg, mechanism: c.mechanism, usd: Math.round(c.now), share_pct: r2((100 * c.now) / tot) })) }); } catch (e) { return bad(e); }
}

export async function stablegrowth(a) {
  try { const s = await stables(); const min = +a.min_usd || 10e6; const per = a.period === "7d" ? "wk" : "mo"; const dir = a.order === "shrinking" ? 1 : -1;
    const l = s.filter((c) => c.now >= min && c[per] > 0).map((c) => ({ name: c.name, symbol: c.symbol, peg: c.peg, mechanism: c.mechanism, usd: Math.round(c.now), prev_usd: Math.round(c[per]), change_usd: Math.round(c.now - c[per]), change_pct: r2((100 * (c.now - c[per])) / c[per]) })).sort((x, y) => dir * (y.change_pct - x.change_pct) * -1);
    const tot = s.reduce((x, c) => x + c.now, 0), prev = s.reduce((x, c) => x + c[per], 0);
    return R(200, { source: "defillama", period: per === "wk" ? "7d" : "30d", order: dir < 0 ? "growing" : "shrinking", market_change_pct: r2((100 * (tot - prev)) / prev), min_usd: min, eligible: l.length, list: l.slice(0, n(a.limit, 25, 1, 200)) }); } catch (e) { return bad(e); }
}
