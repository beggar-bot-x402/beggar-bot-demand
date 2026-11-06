// pack55: yieldpredict (DefiLlama ML APY outlook filter), yieldsharpe (risk-adjusted APY: mu/sigma ranking), yieldmovers (biggest APY changes 1d/7d/30d), yieldtoken (pools for an underlying token)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const lc = (x) => String(x || "").toLowerCase();
async function pools(a) { const r = await fetch("https://yields.llama.fi/pools", { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error("upstream " + r.status); const d = (await r.json()).data || []; const min = +a.min_tvl || 1e6;
  return d.filter((p) => p.tvlUsd >= min && p.apy != null && !p.outlier && (!a.chain || lc(p.chain) === lc(a.chain)) && (!a.project || lc(p.project) === lc(a.project)) && (a.stablecoin == null || a.stablecoin === "" || String(p.stablecoin) === String(a.stablecoin)) && (!a.exposure || p.exposure === a.exposure)); }
const row = (p) => ({ pool: p.pool, project: p.project, chain: p.chain, symbol: p.symbol, meta: p.poolMeta, tvl_usd: Math.round(p.tvlUsd), apy: r2(p.apy), apy_base: r2(p.apyBase), apy_reward: r2(p.apyReward), apy_mean_30d: r2(p.apyMean30d), stablecoin: p.stablecoin, il_risk: p.ilRisk, exposure: p.exposure, outlook: p.predictions?.predictedClass || null, outlook_prob: p.predictions?.predictedProbability ?? null });
const F = { chain: "chain", project: "project slug", stablecoin: "true|false", exposure: "single|multi", min_tvl: "min TVL USD (1M)", limit: "rows (25)" };

export async function yieldpredict(a) {
  try { const want = lc(a.outlook || "up"); const cls = want.startsWith("down") ? "Down" : "Stable/Up"; const minp = +a.min_prob || 60;
    const l = (await pools(a)).filter((p) => p.predictions?.predictedClass === cls && (p.predictions.predictedProbability || 0) >= minp).sort((x, y) => y.apy - x.apy);
    return R(200, { source: "defillama yields (ML outlook)", outlook: cls, min_prob: minp, matches: l.length, list: l.slice(0, n(a.limit, 25, 1, 500)).map(row), note: "predictedClass is DefiLlama's 4-week APY direction forecast; not advice" }); } catch (e) { return bad(e); }
}

export async function yieldsharpe(a) {
  try { const minc = n(a.min_days, 30, 1, 5000); const l = (await pools(a)).filter((p) => p.mu > 0 && p.sigma > 0 && (p.count || 0) >= minc).map((p) => ({ ...row(p), mu: r2(p.mu), sigma: +p.sigma.toFixed(4), days: p.count, score: r2(p.mu / p.sigma) })).sort((x, y) => y.score - x.score);
    return R(200, { source: "defillama yields", metric: "mu/sigma (mean APY over its std-dev)", min_days: minc, eligible: l.length, list: l.slice(0, n(a.limit, 25, 1, 500)) }); } catch (e) { return bad(e); }
}

export async function yieldmovers(a) {
  try { const k = { "1d": "apyPct1D", "30d": "apyPct30D" }[a.period] || "apyPct7D"; const dn = lc(a.direction) === "down";
    const l = (await pools(a)).filter((p) => p[k] != null).sort((x, y) => (dn ? x[k] - y[k] : y[k] - x[k]));
    return R(200, { source: "defillama yields", period: k === "apyPct1D" ? "1d" : k === "apyPct30D" ? "30d" : "7d", direction: dn ? "down" : "up", eligible: l.length, list: l.slice(0, n(a.limit, 25, 1, 500)).map((p) => ({ ...row(p), apy_change_pts: r2(p[k]), apy_before: r2(p.apy - p[k]) })) }); } catch (e) { return bad(e); }
}

export async function yieldtoken(a) {
  const t = lc(a.token || a.address || a.symbol).trim(); if (!t) return R(400, { error: "token required: underlying token address or symbol (e.g. USDC, 0xa0b8...)" });
  try { const isAddr = t.length > 20; const l = (await pools({ ...a, min_tvl: a.min_tvl || 1e5 })).filter((p) => (isAddr ? (p.underlyingTokens || []).some((u) => lc(u) === t) : lc(p.symbol).split(/[-/ ]/).includes(t))).sort((x, y) => (a.sort === "tvl" ? y.tvlUsd - x.tvlUsd : y.apy - x.apy));
    const tvl = l.reduce((s, p) => s + p.tvlUsd, 0);
    return R(200, { source: "defillama yields", token: t, match: isAddr ? "underlying address" : "symbol component", pools: l.length, total_tvl_usd: Math.round(tvl), tvl_weighted_apy: tvl ? r2(l.reduce((s, p) => s + p.apy * p.tvlUsd, 0) / tvl) : null, chains: [...new Set(l.map((p) => p.chain))], list: l.slice(0, n(a.limit, 25, 1, 500)).map(row) }); } catch (e) { return bad(e); }
}
