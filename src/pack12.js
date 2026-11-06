// pack12: chaintvl, tvlmovers, protocolinfo, cexreserves — DefiLlama free endpoints
const R = (status, body) => ({ status, body });
const gj = async (u) => { const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const lim = (a, d, m = 100) => Math.max(1, Math.min(m, parseInt(a.limit || d, 10) || d));
const rnd = (x) => (typeof x === "number" ? +x.toFixed(2) : null);
const lc = (s) => String(s || "").toLowerCase();

export async function chaintvl(a) {
  try {
    const d = await gj("https://api.llama.fi/v2/chains"); const tot = d.reduce((s, c) => s + (c.tvl || 0), 0);
    let rows = d.filter((c) => c.tvl > 0).sort((x, y) => y.tvl - x.tvl).map((c, i) => ({ rank: i + 1, chain: c.name, chain_id: c.chainId ?? null, token: c.tokenSymbol, tvl_usd: Math.round(c.tvl), share_pct: +((c.tvl / tot) * 100).toFixed(3) }));
    if (a.chains) { const w = lc(a.chains).split(",").map((s) => s.trim()); rows = rows.filter((r) => w.includes(lc(r.chain))); if (!rows.length) return R(400, { error: "no matching chains" }); }
    return R(200, { total_tvl_usd: Math.round(tot), chains: rows.slice(0, lim(a, 30, 300)) });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}

let PC = null, PT = 0;
async function protocols() { if (PC && Date.now() - PT < 300000) return PC; PC = await gj("https://api.llama.fi/protocols"); PT = Date.now(); return PC; }
const slim = (p) => ({ name: p.name, slug: p.slug, category: p.category, symbol: p.symbol && p.symbol !== "-" ? p.symbol : null, tvl_usd: Math.round(p.tvl || 0), change_1h_pct: rnd(p.change_1h), change_1d_pct: rnd(p.change_1d), change_7d_pct: rnd(p.change_7d), mcap_usd: p.mcap ? Math.round(p.mcap) : null, chains: (p.chains || []).slice(0, 12), url: p.url });

export async function tvlmovers(a) {
  const ch = a.chain ? lc(a.chain) : null; const min = parseFloat(a.min_tvl || "1000000") || 1e6; const by = a.window === "7d" ? "change_7d" : "change_1d";
  try {
    let ps = (await protocols()).filter((p) => p.category !== "CEX" && typeof p[by] === "number");
    let tv = (p) => p.tvl || 0;
    if (ch) { ps = ps.filter((p) => (p.chains || []).some((c) => lc(c) === ch)); tv = (p) => { const k = Object.keys(p.chainTvls || {}).find((c) => lc(c) === ch); return k ? p.chainTvls[k] : 0; }; }
    ps = ps.filter((p) => tv(p) >= min && Math.abs(p[by]) < 10000);
    const n = lim(a, 10, 50); const s = [...ps].sort((x, y) => y[by] - x[by]);
    return R(200, { chain: ch || "all", window: by.slice(7), min_tvl_usd: min, universe: ps.length, gainers: s.slice(0, n).map(slim), losers: s.slice(-n).reverse().map(slim) });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}

export async function protocolinfo(a) {
  const q = lc(a.name || a.slug).trim(); if (!q) return R(400, { error: "name or slug required" });
  try {
    const ps = await protocols();
    let hit = ps.filter((p) => lc(p.slug) === q || lc(p.name) === q); if (!hit.length) hit = ps.filter((p) => lc(p.name).includes(q) || lc(p.slug).includes(q)).sort((x, y) => (y.tvl || 0) - (x.tvl || 0));
    if (!hit.length) return R(404, { error: "protocol not found", query: q });
    const p = hit[0]; const ct = Object.entries(p.chainTvls || {}).filter(([k]) => !k.includes("-") && !["borrowed", "staking", "pool2", "vesting"].includes(k)).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([chain, tvl]) => ({ chain, tvl_usd: Math.round(tvl) }));
    return R(200, { ...slim(p), description: p.description, twitter: p.twitter, gecko_id: p.gecko_id, audits: p.audits ?? null, audit_links: p.audit_links || [], oracles: p.oracles || [], forked_from: p.forkedFrom || [], listed_at: p.listedAt ? new Date(p.listedAt * 1000).toISOString().slice(0, 10) : null, mcap_tvl: p.mcap && p.tvl ? +(p.mcap / p.tvl).toFixed(3) : null, tvl_by_chain: ct, other_matches: hit.slice(1, 6).map((x) => x.slug) });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}

export async function cexreserves(a) {
  try {
    const cx = (await protocols()).filter((p) => p.category === "CEX" && p.tvl > 0).sort((x, y) => y.tvl - x.tvl);
    let rows = cx.map((p, i) => ({ rank: i + 1, ...slim(p), top_chains: Object.entries(p.chainTvls || {}).filter(([k]) => !k.includes("-")).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([chain, v]) => ({ chain, usd: Math.round(v) })) }));
    if (a.name) { const q = lc(a.name); rows = rows.filter((r) => lc(r.name).includes(q)); }
    const out = rows.slice(0, lim(a, 20, 100)); const tot = cx.reduce((s, p) => s + p.tvl, 0);
    return R(200, { total_cex_reserves_usd: Math.round(tot), exchanges: out, outflow_alerts: rows.filter((r) => (r.change_1d_pct ?? 0) < -5).map((r) => r.name) });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}
