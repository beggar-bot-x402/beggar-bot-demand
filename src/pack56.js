// pack56: yieldlp (LP pools by volume/TVL turnover & IL), yieldrewards (incentive-driven APY share), yieldprojects (yield by project aggregate), yieldchains (yield by chain aggregate)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const lc = (x) => String(x || "").toLowerCase();
async function pools(a) { const r = await fetch("https://yields.llama.fi/pools", { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error("upstream " + r.status); const d = (await r.json()).data || []; const min = +a.min_tvl || 1e6;
  return d.filter((p) => p.tvlUsd >= min && p.apy != null && !p.outlier && (!a.chain || lc(p.chain) === lc(a.chain)) && (!a.project || lc(p.project) === lc(a.project)) && (a.stablecoin == null || a.stablecoin === "" || String(p.stablecoin) === String(a.stablecoin))); }
const row = (p) => ({ pool: p.pool, project: p.project, chain: p.chain, symbol: p.symbol, meta: p.poolMeta, tvl_usd: Math.round(p.tvlUsd), apy: r2(p.apy), apy_base: r2(p.apyBase), apy_reward: r2(p.apyReward), stablecoin: p.stablecoin, il_risk: p.ilRisk });

export async function yieldlp(a) {
  try { const l = (await pools(a)).filter((p) => p.exposure === "multi" && p.volumeUsd7d > 0).map((p) => ({ ...row(p), volume_1d_usd: Math.round(p.volumeUsd1d || 0), volume_7d_usd: Math.round(p.volumeUsd7d), turnover_7d: r2(p.volumeUsd7d / p.tvlUsd), il_7d_pct: r2(p.il7d), apy_base_7d: r2(p.apyBase7d) }));
    const k = a.sort === "apy" ? "apy" : a.sort === "volume" ? "volume_7d_usd" : "turnover_7d"; l.sort((x, y) => (y[k] || 0) - (x[k] || 0));
    return R(200, { source: "defillama yields", sort: k, eligible: l.length, list: l.slice(0, n(a.limit, 25, 1, 500)), note: "turnover_7d = 7d volume / TVL; il_7d_pct = 7d impermanent loss estimate where available" }); } catch (e) { return bad(e); }
}

export async function yieldrewards(a) {
  try { const organic = lc(a.mode) === "organic"; const l = (await pools(a)).filter((p) => p.apy > 0).map((p) => ({ ...row(p), reward_share_pct: r2((100 * (p.apyReward || 0)) / p.apy), reward_tokens: p.rewardTokens || [] }));
    const o = organic ? l.filter((p) => p.reward_share_pct === 0).sort((x, y) => y.apy - x.apy) : l.filter((p) => p.reward_share_pct > 0).sort((x, y) => y.reward_share_pct - x.reward_share_pct || y.apy - x.apy);
    const tvl = l.reduce((s, p) => s + p.tvl_usd, 0), inc = l.filter((p) => p.reward_share_pct > 50).reduce((s, p) => s + p.tvl_usd, 0);
    return R(200, { source: "defillama yields", mode: organic ? "organic (no incentives)" : "incentive-driven", eligible: o.length, tvl_mostly_incentivised_pct: r2((100 * inc) / tvl), list: o.slice(0, n(a.limit, 25, 1, 500)) }); } catch (e) { return bad(e); }
}

function agg(ps, key) { const g = {}; ps.forEach((p) => { const x = (g[p[key]] ||= { [key]: p[key], pools: 0, tvl: 0, w: 0, stable_tvl: 0, best: null, chains: new Set(), projects: new Set() }); x.pools++; x.tvl += p.tvlUsd; x.w += p.apy * p.tvlUsd; if (p.stablecoin) x.stable_tvl += p.tvlUsd; if (!x.best || p.apy > x.best.apy) x.best = p; x.chains.add(p.chain); x.projects.add(p.project); });
  return Object.values(g).map((x) => ({ [key]: x[key], pools: x.pools, tvl_usd: Math.round(x.tvl), tvl_weighted_apy: r2(x.w / x.tvl), stable_tvl_pct: r2((100 * x.stable_tvl) / x.tvl), ...(key === "project" ? { chains: x.chains.size } : { projects: x.projects.size }), best_pool: { symbol: x.best.symbol, project: x.best.project, chain: x.best.chain, apy: r2(x.best.apy), tvl_usd: Math.round(x.best.tvlUsd) } })); }
const sorter = (a) => (a.sort === "apy" ? "tvl_weighted_apy" : a.sort === "pools" ? "pools" : "tvl_usd");

export async function yieldprojects(a) { try { const l = agg(await pools(a), "project"); const k = sorter(a); l.sort((x, y) => y[k] - x[k]); return R(200, { source: "defillama yields", sort: k, projects: l.length, list: l.slice(0, n(a.limit, 25, 1, 500)) }); } catch (e) { return bad(e); } }
export async function yieldchains(a) { try { const l = agg(await pools({ ...a, chain: null }), "chain"); const k = sorter(a); l.sort((x, y) => y[k] - x[k]); return R(200, { source: "defillama yields", sort: k, chains: l.length, list: l.slice(0, n(a.limit, 30, 1, 300)) }); } catch (e) { return bad(e); } }
