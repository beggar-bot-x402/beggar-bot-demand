// pack27: optionsrank, pricechange, yieldhist, tokenlaunch (DefiLlama free APIs)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const e502 = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function j(url) { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(new URL(url).host + " " + r.status); return r.json(); }
// coin ids: "chain:0xaddr", "coingecko:id", or bare 0x… (defaults to chain param or base)
function coinIds(a) { const raw = String(a.coins || a.coin || a.token || "").split(",").map((s) => s.trim()).filter(Boolean); if (!raw.length || raw.length > 30) return null; const ch = (a.chain || "base").toLowerCase();
  const ids = raw.map((c) => (/^0x[0-9a-fA-F]{40}$/.test(c) ? `${ch}:${c}` : c)); return ids.every((c) => /^[a-z0-9\-]+:[A-Za-z0-9\-]{1,80}$/.test(c)) ? ids : null; }

export async function optionsrank(a) {
  try {
    const t = a.type === "premium" ? "dailyPremiumVolume" : "dailyNotionalVolume"; const d = await j(`https://api.llama.fi/overview/options?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=${t}`);
    let P = (d.protocols || []).filter((x) => x.total24h > 0 || x.total7d > 0); if (a.chain) P = P.filter((x) => (x.chains || []).some((c) => c.toLowerCase() === a.chain.toLowerCase())); const key = { "7d": "total7d", "30d": "total30d" }[a.period] || "total24h";
    P.sort((x, y) => (y[key] || 0) - (x[key] || 0)); const tot = P.reduce((s, x) => s + (x[key] || 0), 0);
    return R(200, { metric: t === "dailyPremiumVolume" ? "premium" : "notional", period: key.replace("total", ""), chain: a.chain || "all", protocols: P.length, total_usd: Math.round(tot), market_change_1d_pct: d.change_1d ?? null,
      ranking: P.slice(0, n(a.limit, 25, 1, 100)).map((x, i) => ({ rank: i + 1, name: x.name, slug: x.slug, usd: Math.round(x[key] || 0), share_pct: tot ? +((100 * (x[key] || 0)) / tot).toFixed(2) : null, "24h": Math.round(x.total24h || 0), "7d": Math.round(x.total7d || 0), "30d": Math.round(x.total30d || 0), change_1d_pct: x.change_1d ?? null, chains: x.chains || [] })) });
  } catch (e) { return e502(e); }
}

export async function pricechange(a) {
  const ids = coinIds(a); if (!ids) return R(400, { error: "coins required: comma list of chain:0xaddr, coingecko:id or 0x… (chain defaults base), max 30" });
  try {
    const q = ids.join(","); const per = ["1h", "24h", "7d", "30d"]; const [cur, ...ch] = await Promise.all([j(`https://coins.llama.fi/prices/current/${q}`), ...per.map((p) => j(`https://coins.llama.fi/percentage/${q}?period=${p}`).catch(() => ({ coins: {} })))]);
    const out = ids.map((id) => { const c = cur.coins?.[id]; const r = { coin: id, symbol: c?.symbol || null, price_usd: c?.price ?? null, confidence: c?.confidence ?? null, updated: c?.timestamp ? new Date(c.timestamp * 1000).toISOString() : null }; per.forEach((p, i) => (r["change_" + p + "_pct"] = ch[i].coins?.[id] != null ? +ch[i].coins[id].toFixed(3) : null)); return r; });
    if (out.every((r) => r.price_usd == null)) return R(404, { error: "no prices found", coins: ids });
    return R(200, { source: "defillama coins", coins: out.length, prices: out, best_7d: [...out].filter((r) => r.change_7d_pct != null).sort((p, q) => q.change_7d_pct - p.change_7d_pct)[0]?.coin || null });
  } catch (e) { return e502(e); }
}

export async function yieldhist(a) {
  const pool = (a.pool || "").trim(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pool)) return R(400, { error: "pool id required (DefiLlama yields uuid, see /v1/yieldpools)" });
  try {
    const d = await j(`https://yields.llama.fi/chart/${pool}`); const s = d.data || []; if (!s.length) return R(404, { error: "pool not found", pool });
    const days = n(a.days, 90, 7, 2000); const w = s.slice(-days); const ap = w.map((x) => x.apy).filter((x) => x != null); const mean = ap.reduce((p, q) => p + q, 0) / (ap.length || 1); const sd = Math.sqrt(ap.reduce((p, q) => p + (q - mean) ** 2, 0) / (ap.length || 1));
    const avg = (k) => { const z = s.slice(-k).map((x) => x.apy).filter((x) => x != null); return z.length ? +(z.reduce((p, q) => p + q, 0) / z.length).toFixed(3) : null; }; const last = s[s.length - 1], first = w[0];
    return R(200, { pool, latest: { date: last.timestamp.slice(0, 10), apy_pct: last.apy, apy_base_pct: last.apyBase, apy_reward_pct: last.apyReward, tvl_usd: Math.round(last.tvlUsd) }, apy_avg_7d: avg(7), apy_avg_30d: avg(30), apy_avg_90d: avg(90), window_days: w.length, apy_min: Math.min(...ap), apy_max: Math.max(...ap), apy_stdev: +sd.toFixed(3), stability: sd < mean * 0.15 ? "stable" : sd < mean * 0.5 ? "moderate" : "volatile",
      reward_dependence_pct: last.apy ? +((100 * (last.apyReward || 0)) / last.apy).toFixed(1) : null, tvl_change_window_pct: first?.tvlUsd ? +((100 * (last.tvlUsd - first.tvlUsd)) / first.tvlUsd).toFixed(2) : null, history_since: s[0].timestamp.slice(0, 10),
      series: w.filter((_, i) => i % Math.max(1, Math.floor(w.length / 60)) === 0 || i === w.length - 1).map((x) => ({ date: x.timestamp.slice(0, 10), apy: x.apy != null ? +x.apy.toFixed(3) : null, tvl_usd: Math.round(x.tvlUsd) })) });
  } catch (e) { return e502(e); }
}

export async function tokenlaunch(a) {
  const ids = coinIds(a); if (!ids) return R(400, { error: "coins required: comma list of chain:0xaddr, coingecko:id or 0x… (chain defaults base), max 30" });
  try {
    const q = ids.join(","); const [f, c] = await Promise.all([j(`https://coins.llama.fi/prices/first/${q}`), j(`https://coins.llama.fi/prices/current/${q}`)]);
    const out = ids.map((id) => { const x = f.coins?.[id], y = c.coins?.[id]; if (!x) return { coin: id, found: false }; const age = (Date.now() / 1000 - x.timestamp) / 86400;
      return { coin: id, found: true, symbol: x.symbol || y?.symbol, first_price_usd: x.price, first_seen: new Date(x.timestamp * 1000).toISOString(), age_days: +age.toFixed(1), current_price_usd: y?.price ?? null, change_since_first_pct: y?.price && x.price ? +((100 * (y.price - x.price)) / x.price).toFixed(2) : null, multiple: y?.price && x.price ? +(y.price / x.price).toFixed(4) : null, freshness: age < 7 ? "brand new (<7d)" : age < 30 ? "new (<30d)" : age < 365 ? "under 1y" : "established" }; });
    if (out.every((r) => !r.found)) return R(404, { error: "no price history found", coins: ids });
    return R(200, { source: "defillama coins first price", coins: out.length, tokens: out });
  } catch (e) { return e502(e); }
}
