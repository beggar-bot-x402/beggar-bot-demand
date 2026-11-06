// pack26: fundingarb (HL vs Binance vs Bybit predicted funding), tokenpairs (DexScreener), protocolfees + feesrank (DefiLlama fees/revenue)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const e502 = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function j(url, init) { const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(new URL(url).host + " " + r.status); return r.json(); }

export async function fundingarb(a) {
  try {
    const P = await j("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "predictedFundings" }) });
    const want = a.coin ? a.coin.toUpperCase() : null; const minSpread = n(a.min_spread_apr, 0, 0, 1e4);
    const rows = []; for (const [coin, venues] of P) { if (want && coin.toUpperCase() !== want) continue; const v = {}; for (const [name, x] of venues) if (x) v[{ HlPerp: "hyperliquid", BinPerp: "binance", BybitPerp: "bybit" }[name] || name] = { rate: +x.fundingRate, interval_h: x.fundingIntervalHours, apr_pct: +((+x.fundingRate / x.fundingIntervalHours) * 24 * 365 * 100).toFixed(2), next: new Date(x.nextFundingTime).toISOString() };
      const ks = Object.keys(v); if (ks.length < 2) { if (want) rows.push({ coin, venues: v, spread_apr_pct: null }); continue; }
      ks.sort((p, q) => v[q].apr_pct - v[p].apr_pct); const hi = ks[0], lo = ks[ks.length - 1]; const s = +(v[hi].apr_pct - v[lo].apr_pct).toFixed(2); if (s < minSpread) continue;
      rows.push({ coin, spread_apr_pct: s, trade: `short ${hi} perp / long ${lo} perp`, short_venue: hi, long_venue: lo, venues: v }); }
    if (!rows.length) return R(404, { error: want ? "coin not found" : "no spreads above threshold", coin: want });
    rows.sort((p, q) => (q.spread_apr_pct || 0) - (p.spread_apr_pct || 0));
    return R(200, { source: "hyperliquid predictedFundings", note: "annualized from next predicted rate; excludes fees, borrow and basis risk", coins: rows.length, opportunities: rows.slice(0, n(a.limit, 25, 1, 300)) });
  } catch (e) { return e502(e); }
}

export async function tokenpairs(a) {
  const chain = (a.chain || "base").toLowerCase(), t = a.token || a.address || ""; if (!/^[a-z0-9]{2,20}$/.test(chain) || !/^[A-Za-z0-9]{20,64}$/.test(t.replace(/^0x/, ""))) return R(400, { error: "token (address) required; chain defaults to base" });
  try {
    const P = await j(`https://api.dexscreener.com/token-pairs/v1/${chain}/${t}`); if (!Array.isArray(P) || !P.length) return R(404, { error: "no pairs", chain, token: t });
    P.sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0)); const liq = P.reduce((s, x) => s + (x.liquidity?.usd || 0), 0), vol = P.reduce((s, x) => s + (x.volume?.h24 || 0), 0); const dex = {};
    for (const x of P) { const d = (dex[x.dexId] = dex[x.dexId] || { liquidity_usd: 0, volume_24h_usd: 0, pairs: 0 }); d.liquidity_usd += x.liquidity?.usd || 0; d.volume_24h_usd += x.volume?.h24 || 0; d.pairs++; }
    const buys = P.reduce((s, x) => s + (x.txns?.h24?.buys || 0), 0), sells = P.reduce((s, x) => s + (x.txns?.h24?.sells || 0), 0); const b = P[0].baseToken.address.toLowerCase() === t.toLowerCase() ? P[0].baseToken : P[0].quoteToken;
    return R(200, { chain, token: t, symbol: b.symbol, name: b.name, pairs: P.length, total_liquidity_usd: Math.round(liq), volume_24h_usd: Math.round(vol), turnover: liq ? +(vol / liq).toFixed(2) : null, txns_24h: { buys, sells, buy_ratio: buys + sells ? +(buys / (buys + sells)).toFixed(3) : null }, deepest_pool: P[0].pairAddress, liquidity_concentration_top1_pct: liq ? +((100 * (P[0].liquidity?.usd || 0)) / liq).toFixed(1) : null,
      by_dex: Object.entries(dex).map(([d, x]) => ({ dex: d, ...x, liquidity_usd: Math.round(x.liquidity_usd), volume_24h_usd: Math.round(x.volume_24h_usd) })).sort((p, q) => q.liquidity_usd - p.liquidity_usd),
      pools: P.slice(0, n(a.limit, 20, 1, 100)).map((x) => ({ pair: x.pairAddress, dex: x.dexId, labels: x.labels || [], base: x.baseToken.symbol, quote: x.quoteToken.symbol, price_usd: +x.priceUsd || null, liquidity_usd: Math.round(x.liquidity?.usd || 0), volume_24h_usd: Math.round(x.volume?.h24 || 0), change_24h_pct: x.priceChange?.h24 ?? null, created: x.pairCreatedAt ? new Date(x.pairCreatedAt).toISOString() : null })) });
  } catch (e) { return e502(e); }
}

const slug = (s) => String(s || "").toLowerCase().trim();
export async function protocolfees(a) {
  const p = slug(a.protocol); if (!/^[a-z0-9.\-]{2,60}$/.test(p)) return R(400, { error: "protocol slug required e.g. uniswap, aave, hyperliquid" });
  try {
    const get = (t) => j(`https://api.llama.fi/summary/fees/${p}?dataType=${t}`).catch((e) => (/ 4\d\d$/.test(e.message) ? null : Promise.reject(e)));
    const [f, r] = await Promise.all([get("dailyFees"), get("dailyRevenue")]); if (!f) return R(404, { error: "protocol not tracked for fees", protocol: p });
    const ser = (x) => (x?.totalDataChart || []).slice(-n(a.days, 30, 7, 365)).map(([t, v]) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), usd: Math.round(v) }));
    const fs = ser(f), rs = ser(r); const s = (arr, k) => arr.slice(-k).reduce((x, y) => x + y.usd, 0);
    return R(200, { protocol: f.name || p, category: f.category || null, chains: f.chains || null, fees: { "24h": f.total24h ?? null, "7d": f.total7d ?? s(fs, 7), "30d": f.total30d ?? s(fs, 30), all_time: f.totalAllTime ?? null, change_1d_pct: f.change_1d ?? null }, revenue: r ? { "24h": r.total24h ?? null, "7d": r.total7d ?? s(rs, 7), "30d": r.total30d ?? s(rs, 30), all_time: r.totalAllTime ?? null } : null,
      revenue_capture_pct: r && f.total30d ? +((100 * (r.total30d || 0)) / f.total30d).toFixed(1) : null, annualized_fees_usd: Math.round((f.total30d || s(fs, 30)) * 365 / 30), daily_fees: fs, daily_revenue: rs });
  } catch (e) { return e502(e); }
}

export async function feesrank(a) {
  try {
    const t = a.type === "revenue" ? "dailyRevenue" : "dailyFees"; const chain = a.chain ? "/" + encodeURIComponent(a.chain) : "";
    const d = await j(`https://api.llama.fi/overview/fees${chain}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=${t}`).catch((e) => (/ 4\d\d$/.test(e.message) ? null : Promise.reject(e))); if (!d) return R(404, { error: "unknown chain", chain: a.chain });
    let P = (d.protocols || []).filter((x) => x.total24h > 0); if (a.category) P = P.filter((x) => slug(x.category) === slug(a.category)); const key = { "7d": "total7d", "30d": "total30d" }[a.period] || "total24h";
    P.sort((x, y) => (y[key] || 0) - (x[key] || 0)); const tot = P.reduce((s, x) => s + (x[key] || 0), 0);
    return R(200, { metric: t === "dailyRevenue" ? "revenue" : "fees", period: key.replace("total", ""), chain: a.chain || "all", category: a.category || null, protocols: P.length, total_usd: Math.round(tot), chain_total_24h: d.total24h ?? null, change_1d_pct: d.change_1d ?? null,
      ranking: P.slice(0, n(a.limit, 25, 1, 200)).map((x, i) => ({ rank: i + 1, name: x.name, slug: x.slug, category: x.category, usd: Math.round(x[key] || 0), share_pct: tot ? +((100 * (x[key] || 0)) / tot).toFixed(2) : null, "24h": Math.round(x.total24h || 0), "7d": Math.round(x.total7d || 0), "30d": Math.round(x.total30d || 0), change_1d_pct: x.change_1d ?? null, chains: (x.chains || []).slice(0, 6) })) });
  } catch (e) { return e502(e); }
}
