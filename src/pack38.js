// pack38: btcminerrev (miner revenue over last N blocks), btcblocksize (block size/weight fullness trend), lncountries (Lightning nodes/capacity by country), lnisps (Lightning hosting concentration by ISP)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));

export async function btcminerrev(a) {
  const b = n(a.blocks, 144, 1, 4320);
  try {
    const [s, p] = await Promise.all([mp("/v1/mining/reward-stats/" + b), fetch("https://mempool.space/api/v1/prices", { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({}))]);
    const tr = +s.totalReward / 1e8, tf = +s.totalFee / 1e8, nb = s.endBlock - s.startBlock + 1, usd = p.USD || null;
    return R(200, { chain: "bitcoin", blocks: nb, start_block: s.startBlock, end_block: s.endBlock, total_reward_btc: +tr.toFixed(4), subsidy_btc: +(tr - tf).toFixed(4), fees_btc: +tf.toFixed(4), fee_share_pct: r2((100 * tf) / tr), tx_count: +s.totalTx, avg_fee_per_tx_sats: Math.round((tf * 1e8) / +s.totalTx), reward_per_block_btc: +(tr / nb).toFixed(5), btc_usd: usd, total_reward_usd: usd ? Math.round(tr * usd) : null, fees_usd: usd ? Math.round(tf * usd) : null });
  } catch (e) { return bad(e); }
}

export async function btcblocksize(a) {
  const p = ["24h", "3d", "1w", "1m", "3m", "6m", "1y"].includes(a.period) ? a.period : "1w";
  try {
    const d = await mp("/v1/mining/blocks/sizes-weights/" + p); const s = d.sizes || [], w = d.weights || []; const avg = (x, k) => x.reduce((t, y) => t + y[k], 0) / (x.length || 1);
    const aw = avg(w, "avgWeight"), step = Math.max(1, Math.ceil(s.length / 48));
    return R(200, { chain: "bitcoin", period: p, samples: s.length, avg_size_mb: r2(avg(s, "avgSize") / 1e6), max_size_mb: r2(Math.max(...s.map((x) => x.avgSize)) / 1e6), avg_weight_mwu: r2(aw / 1e6), fullness_pct: r2((100 * aw) / 4e6), full_block_share_pct: r2((100 * w.filter((x) => x.avgWeight > 3.9e6).length) / (w.length || 1)), series: s.filter((_, i) => i % step === 0).map((x, i) => ({ time: new Date(x.timestamp * 1000).toISOString(), height: x.avgHeight, size_mb: r2(x.avgSize / 1e6), weight_mwu: w[i * step] ? r2(w[i * step].avgWeight / 1e6) : null })) });
  } catch (e) { return bad(e); }
}

export async function lncountries(a) {
  try {
    const d = await mp("/v1/lightning/nodes/countries"); const tc = d.reduce((s, x) => s + +x.capacity, 0); const rows = d.slice(0, n(a.limit, 30, 1, 200)).map((x, i) => ({ rank: i + 1, country: x.name?.en, iso: x.iso, nodes: x.count, node_share_pct: x.share, capacity_btc: +(+x.capacity / 1e8).toFixed(2), capacity_share_pct: r2((100 * +x.capacity) / tc) }));
    const top3 = rows.slice(0, 3).reduce((s, x) => s + x.node_share_pct, 0);
    return R(200, { chain: "bitcoin", layer: "lightning", countries: d.length, node_capacity_sum_btc: +(tc / 1e8).toFixed(2), top3_node_share_pct: r2(top3), list: rows });
  } catch (e) { return bad(e); }
}

export async function lnisps(a) {
  try {
    const d = await mp("/v1/lightning/nodes/isp-ranking"); const tot = d.clearnetCapacity + d.torCapacity + d.unknownCapacity; const rows = d.ispRanking.sort((x, y) => y[2] - x[2]).slice(0, n(a.limit, 25, 1, 200)).map((x, i) => ({ rank: i + 1, isp: x[1], asns: String(x[0]).split(","), capacity_btc: +(x[2] / 1e8).toFixed(2), capacity_share_pct: r2((100 * x[2]) / tot), channels: x[3], nodes: x[4] }));
    const hhi = d.ispRanking.reduce((s, x) => s + ((100 * x[2]) / tot) ** 2, 0);
    return R(200, { chain: "bitcoin", layer: "lightning", total_capacity_btc: +(tot / 1e8).toFixed(2), clearnet_share_pct: r2((100 * d.clearnetCapacity) / tot), tor_share_pct: r2((100 * d.torCapacity) / tot), unknown_share_pct: r2((100 * d.unknownCapacity) / tot), top_isp_share_pct: rows[0]?.capacity_share_pct ?? null, isp_hhi: Math.round(hhi), list: rows });
  } catch (e) { return bad(e); }
}
