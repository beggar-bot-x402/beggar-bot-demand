// pack46: lnveterans (oldest Lightning nodes), optionsvol (options DEX volume leaderboard), holdersrevenue (protocols paying token holders), lnisp (Lightning nodes hosted on one ISP/ASN)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const X = "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const chainQ = (c) => (c ? "/" + encodeURIComponent(String(c).toLowerCase().replace(/[^a-z0-9 -]/g, "")) : "");
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);
function board(d, lim) { const rows = (d.protocols || []).filter((p) => p.total24h || p.total7d).map((p) => ({ name: p.displayName || p.name, slug: p.slug, category: p.category, h24_usd: Math.round(p.total24h || 0), d7_usd: Math.round(p.total7d || 0), d30_usd: Math.round(p.total30d || 0), change_7dover7d_pct: r2(p.change_7dover7d) })).sort((x, y) => y.d7_usd - x.d7_usd); const t7 = rows.reduce((s, x) => s + x.d7_usd, 0); return { total_24h_usd: Math.round(d.total24h || 0), total_7d_usd: Math.round(d.total7d || 0), total_30d_usd: Math.round(d.total30d || 0), change_7dover7d_pct: r2(d.change_7dover7d), protocols: rows.length, list: rows.slice(0, lim).map((x) => ({ ...x, share_7d_pct: t7 ? r2((100 * x.d7_usd) / t7) : null })) }; }

export async function lnveterans(a) {
  try { const d = await j("https://mempool.space/api/v1/lightning/nodes/rankings/age"); const now = Date.now() / 1000; const l = (d || []).map((x) => ({ pubkey: x.publicKey, alias: x.alias, first_seen: day(x.firstSeen), age_years: x.firstSeen ? r2((now - x.firstSeen) / 31557600) : null, last_update: day(x.updatedAt), stale: x.updatedAt ? now - x.updatedAt > 90 * 86400 : null, channels: x.channels, capacity_btc: +((x.capacity || 0) / 1e8).toFixed(4), city: x.city?.en || null, country: x.country?.en || null }));
    return R(200, { chain: "bitcoin", layer: "lightning", ranking: "oldest nodes still in graph", nodes: l.length, stale_count: l.filter((x) => x.stale).length, list: l.slice(0, n(a.limit, 50, 1, 100)) }); } catch (e) { return bad(e); }
}

export async function optionsvol(a) {
  try { const d = await j("https://api.llama.fi/overview/options" + chainQ(a.chain) + X); return R(200, { metric: "options notional/premium volume", chain: d.chain || "all", source: "defillama", ...board(d, n(a.limit, 25, 1, 200)) }); }
  catch (e) { return e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown chain", chain: a.chain }) : bad(e); }
}

export async function holdersrevenue(a) {
  try { const d = await j("https://api.llama.fi/overview/fees" + chainQ(a.chain) + X + "&dataType=dailyHoldersRevenue"); return R(200, { metric: "revenue distributed to token holders (buybacks, burns, staking payouts)", chain: d.chain || "all", source: "defillama", ...board(d, n(a.limit, 25, 1, 200)) }); }
  catch (e) { return e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown chain", chain: a.chain }) : bad(e); }
}

export async function lnisp(a) {
  const asn = String(a.asn || "").replace(/^AS/i, ""); if (!/^\d{1,10}$/.test(asn)) return R(400, { error: "asn required: numeric ASN, e.g. 24940 (Hetzner), 16509 (AWS)" });
  try { const d = await j("https://mempool.space/api/v1/lightning/nodes/isp/" + asn); const ns = (d.nodes || []).map((x) => ({ pubkey: x.public_key, alias: x.alias, capacity_btc: +((x.capacity || 0) / 1e8).toFixed(4), channels: x.channels, country: x.country?.en || null, city: x.city?.en || null, first_seen: day(x.first_seen) })).sort((x, y) => y.capacity_btc - x.capacity_btc); const tot = ns.reduce((s, x) => s + x.capacity_btc, 0); const cc = {}; ns.forEach((x) => { if (x.country) cc[x.country] = (cc[x.country] || 0) + 1; });
    return R(200, { chain: "bitcoin", layer: "lightning", asn: +asn, isp: d.isp || null, nodes: ns.length, capacity_btc: +tot.toFixed(2), channels: ns.reduce((s, x) => s + (x.channels || 0), 0), countries: Object.entries(cc).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([country, nodes]) => ({ country, nodes })), list: ns.slice(0, n(a.limit, 50, 1, 500)) }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "asn not found", asn }) : bad(e); }
}
