// pack60: treasuryrev (DefiLlama dailyProtocolRevenue leaderboard), userfees (dailyUserFees leaderboard), feecats (fees aggregated by category), feehist (per-protocol daily fees/revenue history + chain split)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const X = "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const chainQ = (c) => (c ? "/" + encodeURIComponent(String(c).toLowerCase().replace(/[^a-z0-9 -]/g, "")) : "");
const nf = (e, k, v) => (e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown " + k, [k]: v }) : bad(e));
const row = (p) => ({ name: p.displayName || p.name, slug: p.slug || p.module, category: p.category, chains: (p.chains || []).length, h24: r2(p.total24h), d7: r2(p.total7d), d30: r2(p.total30d), y1: r2(p.total1y), change_1d_pct: r2(p.change_1d), change_7dover7d_pct: r2(p.change_7dover7d), change_30dover30d_pct: r2(p.change_30dover30d) });
const board = (dt, metric) => async (a) => {
  try { const d = await j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X + "&dataType=" + dt); const l = (d.protocols || []).filter((p) => p.total30d > 0).map(row).sort((x, y) => (y.d30 || 0) - (x.d30 || 0));
    return R(200, { metric, data_type: dt, chain: a.chain || "all", total24h: r2(d.total24h), total7d: r2(d.total7d), total30d: r2(d.total30d), protocols: l.length, list: l.slice(0, n(a.limit, 50, 1, 500)) }); } catch (e) { return nf(e, "chain", a.chain); }
};
export const treasuryrev = board("dailyProtocolRevenue", "revenue retained by protocol treasury (excl. holders), USD");
export const userfees = board("dailyUserFees", "fees paid directly by users, USD");

export async function feecats(a) {
  const dt = ["dailyFees", "dailyRevenue", "dailyHoldersRevenue"].includes(a.type) ? a.type : "dailyFees";
  try { const d = await j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X + "&dataType=" + dt); const c = {};
    for (const p of d.protocols || []) { const k = p.category || "Other"; const o = (c[k] ||= { category: k, protocols: 0, h24: 0, d7: 0, d30: 0, top: null, top30: 0 }); o.protocols++; o.h24 += p.total24h || 0; o.d7 += p.total7d || 0; o.d30 += p.total30d || 0; if ((p.total30d || 0) > o.top30) { o.top30 = p.total30d; o.top = p.displayName || p.name; } }
    const t30 = Object.values(c).reduce((s, x) => s + x.d30, 0); const l = Object.values(c).map((x) => ({ category: x.category, protocols: x.protocols, h24: r2(x.h24), d7: r2(x.d7), d30: r2(x.d30), share_30d_pct: t30 ? r2((x.d30 / t30) * 100) : null, top_protocol: x.top })).sort((x, y) => y.d30 - x.d30);
    return R(200, { data_type: dt, chain: a.chain || "all", categories: l.length, total30d: r2(t30), list: l }); } catch (e) { return nf(e, "chain", a.chain); }
}

export async function feehist(a) {
  const p = String(a.protocol || a.slug || "").toLowerCase().replace(/[^a-z0-9.-]/g, ""); if (!p) return R(400, { error: "protocol required: DefiLlama slug, e.g. uniswap" });
  const dt = ["dailyFees", "dailyRevenue", "dailyHoldersRevenue"].includes(a.type) ? a.type : "dailyFees"; const days = n(a.days, 30, 1, 365);
  try { const d = await j(`https://api.llama.fi/summary/fees/${p}?dataType=${dt}`); const s = (d.totalDataChart || []).slice(-days).map(([t, v]) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), usd: r2(v) }));
    const cb = Object.entries(d.chainBreakdown || {}).map(([chain, x]) => ({ chain, d30: r2(x.total30d), d7: r2(x.total7d) })).sort((x, y) => (y.d30 || 0) - (x.d30 || 0));
    const vals = s.map((x) => x.usd || 0); const avg = vals.length ? vals.reduce((a2, b) => a2 + b, 0) / vals.length : null;
    return R(200, { protocol: d.displayName || d.name, slug: p, category: d.category, data_type: dt, total24h: r2(d.total24h), total30d: r2(d.total30d), total1y: r2(d.total1y), all_time: r2(d.totalAllTime), days: s.length, avg_daily: r2(avg), max_daily: r2(Math.max(...vals)), chains: cb, series: s }); } catch (e) { return nf(e, "protocol", p); }
}
