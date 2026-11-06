// pack47: protocolrevenue (protocol revenue leaderboard), takerate (revenue/fees take rate per protocol), lnconnected (most-connected Lightning nodes), lnliquidity (largest Lightning nodes by capacity with channel stats)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const X = "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const chainQ = (c) => (c ? "/" + encodeURIComponent(String(c).toLowerCase().replace(/[^a-z0-9 -]/g, "")) : "");
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);
const nf = (e, c) => (e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown chain", chain: c }) : bad(e));

export async function protocolrevenue(a) {
  try { const d = await j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X + "&dataType=dailyRevenue"); const rows = (d.protocols || []).filter((p) => p.total7d > 0).map((p) => ({ name: p.displayName || p.name, slug: p.slug, category: p.category, revenue_24h_usd: Math.round(p.total24h || 0), revenue_7d_usd: Math.round(p.total7d || 0), revenue_30d_usd: Math.round(p.total30d || 0), change_7dover7d_pct: r2(p.change_7dover7d) })).sort((x, y) => y.revenue_7d_usd - x.revenue_7d_usd);
    return R(200, { metric: "protocol revenue", chain: d.chain || "all", source: "defillama", total_7d_usd: Math.round(d.total7d || 0), total_30d_usd: Math.round(d.total30d || 0), protocols: rows.length, list: rows.slice(0, n(a.limit, 25, 1, 200)).map((x) => ({ ...x, share_7d_pct: d.total7d ? r2((100 * x.revenue_7d_usd) / d.total7d) : null })) }); } catch (e) { return nf(e, a.chain); }
}

export async function takerate(a) {
  try { const [f, r] = await Promise.all([j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X), j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X + "&dataType=dailyRevenue")]); const rev = new Map((r.protocols || []).map((p) => [p.defillamaId || p.name, p.total30d || 0])); const min = +a.min_fees_usd || 1e6;
    const rows = (f.protocols || []).filter((p) => (p.total30d || 0) >= min && rev.has(p.defillamaId || p.name)).map((p) => { const rv = rev.get(p.defillamaId || p.name); return { name: p.displayName || p.name, category: p.category, fees_30d_usd: Math.round(p.total30d), revenue_30d_usd: Math.round(rv), take_rate_pct: r2((100 * rv) / p.total30d) }; }).sort((x, y) => y.fees_30d_usd - x.fees_30d_usd);
    return R(200, { metric: "take rate = protocol revenue / fees (30d)", chain: f.chain || "all", source: "defillama", aggregate_take_rate_pct: f.total30d ? r2((100 * (r.total30d || 0)) / f.total30d) : null, min_fees_usd: min, protocols: rows.length, list: rows.slice(0, n(a.limit, 30, 1, 200)) }); } catch (e) { return nf(e, a.chain); }
}

const node = (x) => ({ pubkey: x.publicKey, alias: x.alias, channels: x.channels, capacity_btc: +((x.capacity || 0) / 1e8).toFixed(4), avg_channel_btc: x.channels ? +((x.capacity || 0) / 1e8 / x.channels).toFixed(4) : null, first_seen: day(x.firstSeen), last_update: day(x.updatedAt), country: x.country?.en || null });
export async function lnconnected(a) {
  try { const l = (await j("https://mempool.space/api/v1/lightning/nodes/rankings/connectivity")).map(node); return R(200, { chain: "bitcoin", layer: "lightning", ranking: "most channels", nodes: l.length, channels_total: l.reduce((s, x) => s + (x.channels || 0), 0), list: l.slice(0, n(a.limit, 50, 1, 100)) }); } catch (e) { return bad(e); }
}
export async function lnliquidity(a) {
  try { const l = (await j("https://mempool.space/api/v1/lightning/nodes/rankings/liquidity")).map(node); const tot = l.reduce((s, x) => s + x.capacity_btc, 0); return R(200, { chain: "bitcoin", layer: "lightning", ranking: "largest capacity", nodes: l.length, capacity_btc_total: +tot.toFixed(2), list: l.slice(0, n(a.limit, 50, 1, 100)).map((x) => ({ ...x, share_of_top_pct: tot ? r2((100 * x.capacity_btc) / tot) : null })) }); } catch (e) { return bad(e); }
}
