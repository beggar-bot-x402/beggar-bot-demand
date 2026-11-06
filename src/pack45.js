// pack45: dexaggs (DEX aggregator volume leaderboard), bridgeaggs (bridge aggregator volume leaderboard), aggshare (aggregator share of DEX volume per chain), lncountry (Lightning nodes in one country)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const X = "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const chainQ = (c) => (c ? "/" + encodeURIComponent(String(c).toLowerCase().replace(/[^a-z0-9 -]/g, "")) : "");
function board(d, lim) { const rows = (d.protocols || []).filter((p) => p.total24h || p.total7d).map((p) => ({ name: p.displayName || p.name, slug: p.slug, volume_24h_usd: Math.round(p.total24h || 0), volume_7d_usd: Math.round(p.total7d || 0), volume_30d_usd: Math.round(p.total30d || 0), change_7dover7d_pct: r2(p.change_7dover7d), chains: (p.chains || []).length })).sort((x, y) => y.volume_7d_usd - x.volume_7d_usd); const t7 = rows.reduce((s, x) => s + x.volume_7d_usd, 0); return { total_24h_usd: Math.round(d.total24h || 0), total_7d_usd: Math.round(d.total7d || 0), total_30d_usd: Math.round(d.total30d || 0), change_7dover7d_pct: r2(d.change_7dover7d), protocols: rows.length, top_share_7d_pct: rows[0] && t7 ? r2((100 * rows[0].volume_7d_usd) / t7) : null, list: rows.slice(0, lim).map((x) => ({ ...x, share_7d_pct: t7 ? r2((100 * x.volume_7d_usd) / t7) : null })) }; }

export async function dexaggs(a) {
  try { const d = await j("https://api.llama.fi/overview/aggregators" + chainQ(a.chain) + X); return R(200, { metric: "dex aggregator volume", chain: d.chain || "all", source: "defillama", ...board(d, n(a.limit, 25, 1, 200)) }); }
  catch (e) { return e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown chain", chain: a.chain }) : bad(e); }
}

export async function bridgeaggs(a) {
  try { const d = await j("https://api.llama.fi/overview/bridge-aggregators" + chainQ(a.chain) + X); return R(200, { metric: "bridge aggregator volume", chain: d.chain || "all", source: "defillama", ...board(d, n(a.limit, 25, 1, 200)) }); }
  catch (e) { return e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown chain", chain: a.chain }) : bad(e); }
}

export async function aggshare(a) {
  const cs = String(a.chains || "ethereum,solana,base,arbitrum,bsc").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 10); if (cs.some((c) => !/^[a-z0-9 -]{2,30}$/.test(c))) return R(400, { error: "chains: comma list of chain names" });
  try {
    const rows = await Promise.all(cs.map(async (c) => { const [d, g] = await Promise.all([j("https://api.llama.fi/overview/dexs/" + encodeURIComponent(c) + X).catch(() => null), j("https://api.llama.fi/overview/aggregators/" + encodeURIComponent(c) + X).catch(() => null)]); if (!d) return { chain: c, error: "unknown chain" }; const dv = d.total7d || 0, av = g?.total7d || 0; const top = (g?.protocols || []).sort((x, y) => (y.total7d || 0) - (x.total7d || 0))[0]; return { chain: d.chain || c, dex_volume_7d_usd: Math.round(dv), aggregator_volume_7d_usd: Math.round(av), aggregator_share_pct: dv ? r2((100 * av) / dv) : null, top_aggregator: top ? top.displayName || top.name : null }; }));
    return R(200, { source: "defillama", note: "aggregator volume routes through DEXs, so share = routed flow / DEX volume", list: rows.sort((x, y) => (y.aggregator_share_pct ?? -1) - (x.aggregator_share_pct ?? -1)) });
  } catch (e) { return bad(e); }
}

export async function lncountry(a) {
  const c = String(a.country || "").trim().toUpperCase(); if (!/^[A-Z]{2}$/.test(c)) return R(400, { error: "country required: ISO 3166 alpha-2 code, e.g. US, DE, CH" });
  try {
    const d = await j("https://mempool.space/api/v1/lightning/nodes/country/" + c); const ns = (d.nodes || []).map((x) => ({ pubkey: x.public_key, alias: x.alias, capacity_btc: +(x.capacity / 1e8).toFixed(4), channels: x.channels, city: x.city?.en || null, isp: x.iso_code ? undefined : undefined, first_seen: x.first_seen ? new Date(x.first_seen * 1000).toISOString().slice(0, 10) : null })).sort((x, y) => y.capacity_btc - x.capacity_btc);
    const tot = ns.reduce((s, x) => s + x.capacity_btc, 0);
    return R(200, { chain: "bitcoin", layer: "lightning", country: d.country?.en || c, iso: c, nodes: ns.length, capacity_btc: +tot.toFixed(2), channels: ns.reduce((s, x) => s + (x.channels || 0), 0), top_node_share_pct: tot && ns[0] ? r2((100 * ns[0].capacity_btc) / tot) : null, list: ns.slice(0, n(a.limit, 50, 1, 500)) });
  } catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "country not found", iso: c }) : bad(e); }
}
