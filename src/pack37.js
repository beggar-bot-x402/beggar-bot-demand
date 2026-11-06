// pack37: btclightning (Lightning network stats + trend), lnnodes (top Lightning nodes by capacity/connectivity), btcblockfees (miner fee revenue history), solimpact (Jupiter price impact ladder by trade size)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const pct = (a, b) => (b ? r2((100 * (a - b)) / b) : null);
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);

export async function btclightning(a) {
  const p = ["1m", "3m", "6m", "1y"].includes(a.period) ? a.period : "3m";
  try {
    const [s, l] = await Promise.all([mp("/v1/lightning/statistics/" + p), mp("/v1/lightning/statistics/latest").catch(() => null)]); const cur = s[0], old = s.at(-1), x = l?.latest || {};
    return R(200, { chain: "bitcoin", layer: "lightning", period: p, as_of: day(cur.added), channels: cur.channel_count, capacity_btc: +(cur.total_capacity / 1e8).toFixed(2), nodes: { tor: cur.tor_nodes, clearnet: cur.clearnet_nodes, both: cur.clearnet_tor_nodes, unannounced: cur.unannounced_nodes }, change_pct: { channels: pct(cur.channel_count, old.channel_count), capacity: pct(cur.total_capacity, old.total_capacity) }, fees_snapshot: { as_of: x.added ? x.added.slice(0, 10) : null, avg_capacity_sats: x.avg_capacity ?? null, median_capacity_sats: x.med_capacity ?? null, median_fee_rate_ppm: x.med_fee_rate ?? null, median_base_fee_msat: x.med_base_fee_mtokens ?? null }, series: s.filter((_, i) => i % 7 === 0).map((d) => ({ date: day(d.added), channels: d.channel_count, capacity_btc: +(d.total_capacity / 1e8).toFixed(1) })) });
  } catch (e) { return bad(e); }
}

export async function lnnodes(a) {
  const by = a.by === "connectivity" ? "connectivity" : "liquidity";
  try {
    const d = await mp("/v1/lightning/nodes/rankings/" + by); const rows = d.slice(0, n(a.limit, 25, 1, 100)).map((x, i) => ({ rank: i + 1, pubkey: x.publicKey, alias: x.alias, channels: x.channels, capacity_btc: +(x.capacity / 1e8).toFixed(3), country: x.country?.en || null, first_seen: x.firstSeen ? day(x.firstSeen) : null, updated: x.updatedAt ? day(x.updatedAt) : null }));
    return R(200, { chain: "bitcoin", layer: "lightning", ranked_by: by, nodes: rows.length, total_capacity_btc: +rows.reduce((s, x) => s + x.capacity_btc, 0).toFixed(2), list: rows });
  } catch (e) { return bad(e); }
}

export async function btcblockfees(a) {
  const p = ["24h", "3d", "1w", "1m", "3m", "6m", "1y"].includes(a.period) ? a.period : "1w";
  try {
    const d = await mp("/v1/mining/blocks/fees/" + p); const f = d.map((x) => x.avgFees / 1e8); const avg = f.reduce((s, x) => s + x, 0) / (f.length || 1); const sub = 3.125; const half = Math.floor(d.length / 2);
    const m1 = f.slice(0, half).reduce((s, x) => s + x, 0) / (half || 1), m2 = f.slice(half).reduce((s, x) => s + x, 0) / (f.length - half || 1); const usd = d.at(-1)?.USD || null; const step = Math.max(1, Math.ceil(d.length / 48));
    return R(200, { chain: "bitcoin", period: p, samples: d.length, avg_fees_per_block_btc: +avg.toFixed(5), max_fees_per_block_btc: +Math.max(...f).toFixed(5), fee_share_of_reward_pct: r2((100 * avg) / (avg + sub)), trend_pct: pct(m2, m1), btc_usd: usd, avg_fees_per_block_usd: usd ? Math.round(avg * usd) : null, est_daily_fees_btc: +(avg * 144).toFixed(3), series: d.filter((_, i) => i % step === 0).map((x) => ({ time: new Date(x.timestamp * 1000).toISOString(), height: x.avgHeight, fees_btc: +(x.avgFees / 1e8).toFixed(5) })) });
  } catch (e) { return bad(e); }
}

const SOL = "So11111111111111111111111111111111111111112", USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export async function solimpact(a) {
  const m = (a.mint || "").trim(); if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(m)) return R(400, { error: "mint required: base58 Solana token mint" });
  try {
    const sizes = [100, 1000, 10000, 50000, 250000]; const q = (amt) => fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${m === USDC ? SOL : USDC}&outputMint=${m}&amount=${amt}&slippageBps=50`, { signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let base = USDC, mult = 1e6; if (m === USDC) { const p = await fetch("https://lite-api.jup.ag/price/v3?ids=" + SOL).then((r) => r.json()); base = SOL; mult = 1e9 / p[SOL].usdPrice; }
    const res = await Promise.all(sizes.map((s) => q(Math.round(s * mult)))); if (!res[0]) return R(404, { error: "no route for mint", mint: m });
    const unit = (r) => (r ? +r.outAmount / +r.inAmount : null); const u0 = unit(res[0]);
    const ladder = sizes.map((s, i) => { const r = res[i]; return r ? { buy_usd: s, out_raw: r.outAmount, price_impact_pct: r2(+r.priceImpactPct * 100), vs_smallest_pct: r2((100 * (u0 - unit(r))) / u0), hops: r.routePlan.length, venues: [...new Set(r.routePlan.map((x) => x.swapInfo.label))] } : { buy_usd: s, error: "no route" }; });
    const max = ladder.filter((x) => x.vs_smallest_pct != null && x.vs_smallest_pct <= 1).at(-1);
    return R(200, { chain: "solana", source: "jupiter", mint: m, quote_from: base === USDC ? "USDC" : "SOL", ladder, max_size_under_1pct_usd: max ? max.buy_usd : null });
  } catch (e) { return bad(e); }
}
