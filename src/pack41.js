// pack41: tokenfirstprice (first recorded price + ROI since), soltps (Solana throughput from perf samples), stablehist (total stablecoin supply history + growth), tokendrawdown (ATH over window + current drawdown)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { signal: AbortSignal.timeout(20000), ...o }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const ALIAS = { btc: "coingecko:bitcoin", eth: "coingecko:ethereum", sol: "coingecko:solana", bnb: "coingecko:binancecoin", hype: "coingecko:hyperliquid", xrp: "coingecko:ripple", doge: "coingecko:dogecoin" };
const cid = (s) => { s = String(s || "").trim(); if (!s) return null; const id = ALIAS[s.toLowerCase()] || (s.includes(":") ? s : /^0x[0-9a-fA-F]{40}$/.test(s) ? "ethereum:" + s : "coingecko:" + s.toLowerCase()); return /^[a-z0-9-]+:[A-Za-z0-9-]+$/.test(id) ? id : null; };

export async function tokenfirstprice(a) {
  const ids = String(a.coins || "").split(",").map(cid); if (!a.coins || !ids.length || ids.includes(null)) return R(400, { error: "coins required: comma list of symbols, coingecko ids or chain:address" });
  try {
    const q = ids.slice(0, 20).join(","); const [f, c] = await Promise.all([j("https://coins.llama.fi/prices/first/" + q), j("https://coins.llama.fi/prices/current/" + q)]);
    const rows = ids.slice(0, 20).map((id) => { const x = f.coins[id], y = c.coins[id]; return { coin: id, symbol: x?.symbol || y?.symbol || null, first_price_usd: x?.price ?? null, first_seen: x ? day(x.timestamp) : null, age_days: x ? Math.floor((Date.now() / 1000 - x.timestamp) / 86400) : null, current_price_usd: y?.price ?? null, roi_since_first_pct: x && y ? r2((100 * (y.price - x.price)) / x.price) : null, multiple: x && y ? r2(y.price / x.price) : null }; });
    return R(200, { source: "defillama", coins: rows.length, list: rows });
  } catch (e) { return bad(e); }
}

export async function soltps(a) {
  const k = n(a.samples, 30, 1, 180);
  try {
    const d = await j("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPerformanceSamples", params: [k] }) }); const s = d.result || []; if (!s.length) throw new Error("no samples");
    const tps = s.map((x) => x.numTransactions / x.samplePeriodSecs), nv = s.map((x) => x.numNonVoteTransactions / x.samplePeriodSecs), slot = s.map((x) => (x.samplePeriodSecs * 1000) / x.numSlots); const avg = (x) => x.reduce((t, y) => t + y, 0) / x.length;
    return R(200, { chain: "solana", samples: s.length, window_minutes: Math.round(s.reduce((t, x) => t + x.samplePeriodSecs, 0) / 60), latest_slot: s[0].slot, tps_avg: r2(avg(tps)), tps_max: r2(Math.max(...tps)), tps_min: r2(Math.min(...tps)), non_vote_tps_avg: r2(avg(nv)), avg_slot_ms: r2(avg(slot)), slow_slots_flag: avg(slot) > 500, series: s.map((x) => ({ slot: x.slot, tps: r2(x.numTransactions / x.samplePeriodSecs), slot_ms: r2((x.samplePeriodSecs * 1000) / x.numSlots) })) });
  } catch (e) { return bad(e); }
}

export async function stablehist(a) {
  const days = n(a.days, 365, 7, 3650);
  try {
    const d = await j("https://stablecoins.llama.fi/stablecoincharts/all"); const s = d.slice(-days).map((x) => ({ date: day(+x.date), supply_usd: Math.round(x.totalCirculatingUSD?.peggedUSD || 0) })); const last = s.at(-1).supply_usd; const back = (k) => { const x = s[s.length - 1 - k]; return x ? r2((100 * (last - x.supply_usd)) / x.supply_usd) : null; };
    const ath = s.reduce((m, x) => (x.supply_usd > m.supply_usd ? x : m), s[0]); const step = Math.max(1, Math.ceil(s.length / 60));
    return R(200, { source: "defillama", metric: "total USD-pegged stablecoin supply", latest_date: s.at(-1).date, supply_usd: last, change_pct: { d7: back(7), d30: back(30), d90: back(90), d365: back(365) }, window_high_usd: ath.supply_usd, window_high_date: ath.date, below_high_pct: r2((100 * (ath.supply_usd - last)) / ath.supply_usd), series: s.filter((_, i) => i % step === 0 || i === s.length - 1) });
  } catch (e) { return bad(e); }
}

export async function tokendrawdown(a) {
  const id = cid(a.coin || a.token); if (!id) return R(400, { error: "coin required: symbol, coingecko id or chain:address" }); const days = n(a.days, 365, 7, 1825);
  try {
    const span = Math.min(500, days), per = Math.max(1, Math.ceil(days / span)); const d = await j(`https://coins.llama.fi/chart/${id}?start=${Math.floor(Date.now() / 1000) - days * 86400}&span=${span}&period=${per}d`); const c = d.coins[id]; if (!c || !c.prices.length) return R(404, { error: "no price history", coin: id });
    const p = c.prices; let peak = p[0], mdd = 0, mddAt = null, pk = p[0]; for (const x of p) { if (x.price > pk.price) pk = x; const dd = (pk.price - x.price) / pk.price; if (dd > mdd) { mdd = dd; mddAt = x; } if (x.price > peak.price) peak = x; } const low = p.reduce((m, x) => (x.price < m.price ? x : m), p[0]); const cur = p.at(-1);
    return R(200, { coin: id, symbol: c.symbol, window_days: days, points: p.length, current_price_usd: cur.price, high_usd: peak.price, high_date: day(peak.timestamp), low_usd: low.price, low_date: day(low.timestamp), drawdown_from_high_pct: r2((100 * (peak.price - cur.price)) / peak.price), up_from_low_pct: r2((100 * (cur.price - low.price)) / low.price), max_drawdown_pct: r2(mdd * 100), max_drawdown_trough_date: mddAt ? day(mddAt.timestamp) : null, days_since_high: Math.floor((cur.timestamp - peak.timestamp) / 86400), source: "defillama" });
  } catch (e) { return bad(e); }
}
