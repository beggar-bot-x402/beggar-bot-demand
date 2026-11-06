// pack36: btcaddress (address balance/activity), btchashrate (hashrate + difficulty trend), btcfeehist (block fee-rate percentiles history), soltoptraded (Jupiter top traded/trending/organic Solana tokens)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (r.status === 400 || r.status === 404) { const e = new Error("notfound"); e.nf = 1; throw e; } if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const PER = ["1m", "3m", "6m", "1y", "2y", "3y"];

export async function btcaddress(a) {
  const ad = (a.address || "").trim(); if (!/^(bc1[02-9ac-hj-np-z]{8,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(ad)) return R(400, { error: "address required: bitcoin address (bc1…, 1…, 3…)" });
  try {
    const [d, u] = await Promise.all([mp("/address/" + ad), mp("/address/" + ad + "/utxo").catch(() => null)]); const c = d.chain_stats, m = d.mempool_stats;
    const bal = c.funded_txo_sum - c.spent_txo_sum, pend = m.funded_txo_sum - m.spent_txo_sum;
    return R(200, { chain: "bitcoin", address: ad, type: ad.startsWith("bc1p") ? "taproot" : ad.startsWith("bc1q") ? "segwit" : ad.startsWith("3") ? "p2sh" : "legacy", balance_btc: bal / 1e8, pending_btc: pend / 1e8, total_received_btc: c.funded_txo_sum / 1e8, total_sent_btc: c.spent_txo_sum / 1e8, tx_count: c.tx_count, mempool_tx_count: m.tx_count, utxo_count: u ? u.length : null, utxo_largest_btc: u && u.length ? Math.max(...u.map((x) => x.value)) / 1e8 : null, utxo_dust_count: u ? u.filter((x) => x.value < 1000).length : null, unconfirmed_utxos: u ? u.filter((x) => !x.status.confirmed).length : null });
  } catch (e) { return e.nf ? R(404, { error: "address not found" }) : bad(e); }
}

export async function btchashrate(a) {
  const p = PER.includes(a.period) ? a.period : "3m";
  try {
    const d = await mp("/v1/mining/hashrate/" + p); const h = d.hashrates || [], df = d.difficulty || []; const eh = (x) => +(x / 1e18).toFixed(1);
    const last = h.at(-1)?.avgHashrate, first = h[0]?.avgHashrate, wk = h.slice(-7), mx = h.reduce((m, x) => (x.avgHashrate > m.avgHashrate ? x : m), h[0] || {});
    return R(200, { chain: "bitcoin", period: p, current_hashrate_ehs: eh(d.currentHashrate), current_difficulty: d.currentDifficulty, avg_7d_ehs: wk.length ? eh(wk.reduce((s, x) => s + x.avgHashrate, 0) / wk.length) : null, change_pct: first ? r2((100 * (last - first)) / first) : null, peak_ehs: eh(mx.avgHashrate || 0), peak_date: mx.timestamp ? new Date(mx.timestamp * 1000).toISOString().slice(0, 10) : null, difficulty_adjustments: df.slice(-6).map((x) => ({ date: new Date(x.time * 1000).toISOString().slice(0, 10), height: x.height, difficulty: x.difficulty, change_pct: r2((x.adjustment - 1) * 100) })), daily: h.slice(-30).map((x) => ({ date: new Date(x.timestamp * 1000).toISOString().slice(0, 10), ehs: eh(x.avgHashrate) })) });
  } catch (e) { return bad(e); }
}

export async function btcfeehist(a) {
  const p = ["24h", "3d", "1w", "1m", "3m"].includes(a.period) ? a.period : "1w";
  try {
    const d = await mp("/v1/mining/blocks/fee-rates/" + p); const med = d.map((x) => x.avgFee_50).sort((x, y) => x - y); const q = (f) => med[Math.floor(f * (med.length - 1))];
    const step = Math.max(1, Math.ceil(d.length / 48));
    return R(200, { chain: "bitcoin", period: p, samples: d.length, median_fee_rate: { p10: q(0.1), p50: q(0.5), p90: q(0.9), max: med.at(-1) }, latest: d.at(-1), cheap_share_pct: r2((100 * med.filter((x) => x <= 2).length) / (med.length || 1)), series: d.filter((_, i) => i % step === 0).map((x) => ({ time: new Date(x.timestamp * 1000).toISOString(), height: x.avgHeight, p10: x.avgFee_10, p50: x.avgFee_50, p90: x.avgFee_90 })) });
  } catch (e) { return bad(e); }
}

export async function soltoptraded(a) {
  const cat = ["toptraded", "toptrending", "toporganicscore"].includes(a.category) ? a.category : "toptraded"; const iv = ["5m", "1h", "6h", "24h"].includes(a.interval) ? a.interval : "24h";
  try {
    const r = await fetch(`https://lite-api.jup.ag/tokens/v2/${cat}/${iv}?limit=${n(a.limit, 25, 1, 100)}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("jupiter " + r.status); const d = await r.json(); const k = "stats" + iv;
    const rows = d.map((t) => { const s = t[k] || {}; return { mint: t.id, symbol: t.symbol, name: t.name, price_usd: t.usdPrice ?? null, mcap_usd: t.mcap ? Math.round(t.mcap) : null, liquidity_usd: t.liquidity ? Math.round(t.liquidity) : null, holders: t.holderCount ?? null, price_change_pct: r2(s.priceChange), volume_usd: Math.round((s.buyVolume || 0) + (s.sellVolume || 0)), buy_share_pct: s.buyVolume || s.sellVolume ? r2((100 * (s.buyVolume || 0)) / ((s.buyVolume || 0) + (s.sellVolume || 0))) : null, traders: (s.numTraders ?? null), organic_score: r2(t.organicScore), verified: !!t.isVerified }; });
    return R(200, { chain: "solana", source: "jupiter", category: cat, interval: iv, tokens: rows.length, total_volume_usd: rows.reduce((s, x) => s + x.volume_usd, 0), list: rows });
  } catch (e) { return bad(e); }
}
