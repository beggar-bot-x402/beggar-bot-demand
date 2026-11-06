// pack48: feegrowth (fastest-growing protocols by fees), revenuegrowth (fastest-growing by revenue), dexgrowth (fastest-growing DEXs by volume), categoryfees (fees aggregated by protocol category)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const X = "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const chainQ = (c) => (c ? "/" + encodeURIComponent(String(c).toLowerCase().replace(/[^a-z0-9 -]/g, "")) : "");
const nf = (e, c) => (e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown chain", chain: c }) : bad(e));

async function growth(a, path, metric, dmin) {
  try { const d = await j("https://api.llama.fi/overview/" + path.replace("{c}", chainQ(a.chain))); const min = +a.min_7d_usd || dmin; const dir = a.order === "decliners" ? 1 : -1;
    const rows = (d.protocols || []).filter((p) => (p.total7d || 0) >= min && p.change_7dover7d != null && isFinite(p.change_7dover7d)).map((p) => ({ name: p.displayName || p.name, category: p.category, d7_usd: Math.round(p.total7d), prev_7d_usd: Math.round(p.total7d / (1 + p.change_7dover7d / 100)), change_7dover7d_pct: r2(p.change_7dover7d), change_1d_pct: r2(p.change_1d), d30_usd: Math.round(p.total30d || 0) })).sort((x, y) => dir * (x.change_7dover7d_pct - y.change_7dover7d_pct) * -1 * -1);
    rows.sort((x, y) => (dir < 0 ? y.change_7dover7d_pct - x.change_7dover7d_pct : x.change_7dover7d_pct - y.change_7dover7d_pct));
    return R(200, { metric, order: dir < 0 ? "gainers" : "decliners", chain: d.chain || "all", source: "defillama", market_change_7dover7d_pct: r2(d.change_7dover7d), min_7d_usd: min, eligible: rows.length, list: rows.slice(0, n(a.limit, 25, 1, 200)) }); } catch (e) { return nf(e, a.chain); }
}
export const feegrowth = (a) => growth(a, "fees{c}" + X, "fees week-over-week growth", 100000);
export const revenuegrowth = (a) => growth(a, "fees{c}" + X + "&dataType=dailyRevenue", "revenue week-over-week growth", 50000);
export const dexgrowth = (a) => growth(a, "dexs{c}" + X, "DEX volume week-over-week growth", 5000000);

export async function categoryfees(a) {
  try { const [f, r] = await Promise.all([j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X), j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X + "&dataType=dailyRevenue")]); const c = {};
    for (const p of f.protocols || []) { const k = p.category || "Other"; c[k] ??= { category: k, protocols: 0, fees_7d_usd: 0, fees_30d_usd: 0, revenue_30d_usd: 0, prev_7d: 0, top: null, topv: 0 }; const o = c[k]; o.protocols++; o.fees_7d_usd += p.total7d || 0; o.fees_30d_usd += p.total30d || 0; if (p.change_7dover7d != null && isFinite(p.change_7dover7d)) o.prev_7d += (p.total7d || 0) / (1 + p.change_7dover7d / 100); else o.prev_7d += p.total7d || 0; if ((p.total30d || 0) > o.topv) { o.topv = p.total30d; o.top = p.displayName || p.name; } }
    for (const p of r.protocols || []) { const k = p.category || "Other"; if (c[k]) c[k].revenue_30d_usd += p.total30d || 0; }
    const tot = Object.values(c).reduce((s, x) => s + x.fees_30d_usd, 0);
    const list = Object.values(c).map((o) => ({ category: o.category, protocols: o.protocols, fees_7d_usd: Math.round(o.fees_7d_usd), fees_30d_usd: Math.round(o.fees_30d_usd), revenue_30d_usd: Math.round(o.revenue_30d_usd), take_rate_pct: o.fees_30d_usd ? r2((100 * o.revenue_30d_usd) / o.fees_30d_usd) : null, change_7dover7d_pct: o.prev_7d ? r2((100 * (o.fees_7d_usd - o.prev_7d)) / o.prev_7d) : null, share_30d_pct: tot ? r2((100 * o.fees_30d_usd) / tot) : null, top_protocol: o.top })).sort((x, y) => y.fees_30d_usd - x.fees_30d_usd);
    return R(200, { metric: "fees by protocol category", chain: f.chain || "all", source: "defillama", categories: list.length, list: list.slice(0, n(a.limit, 40, 1, 200)) }); } catch (e) { return nf(e, a.chain); }
}
