// pack13: Bitcoin via mempool.space public API (keyless): btcfees, btcaddr, btctx, btcnetwork
const R = (status, body) => ({ status, body });
const M = "https://mempool.space/api";
const gj = async (p) => { const r = await fetch(M + p, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) }); if (r.status === 400 || r.status === 404) { const e = new Error(await r.text()); e.code = 404; throw e; } if (!r.ok) throw new Error("upstream " + r.status); const t = await r.text(); try { return JSON.parse(t); } catch { return t; } };
const fail = (e) => R(e.code || 502, { error: String(e.message || e).slice(0, 200) });
const ADDR = /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
const TXID = /^[0-9a-f]{64}$/;
const btc = (s) => +(s / 1e8).toFixed(8);

export async function btcfees(a) {
  const vb = Math.max(100, Math.min(100000, parseInt(a.vbytes || "141", 10) || 141));
  try {
    const [f, mp, blocks, px] = await Promise.all([gj("/v1/fees/recommended"), gj("/mempool"), gj("/v1/fees/mempool-blocks"), gj("/v1/prices")]);
    const usd = px.USD; const cost = (r) => ({ sat_per_vb: r, sats: r * vb, usd: usd ? +((r * vb / 1e8) * usd).toFixed(4) : null });
    return R(200, { vbytes: vb, btc_usd: usd, fastest: cost(f.fastestFee), half_hour: cost(f.halfHourFee), hour: cost(f.hourFee), economy: cost(f.economyFee), minimum: cost(f.minimumFee),
      mempool: { tx_count: mp.count, vsize_mb: +(mp.vsize / 1e6).toFixed(2), total_fee_btc: btc(mp.total_fee), blocks_to_clear: blocks.length },
      next_blocks: blocks.slice(0, 3).map((b) => ({ tx: b.nTx, median_fee: +b.medianFee.toFixed(2), fee_range: [+b.feeRange[0].toFixed(2), +b.feeRange[b.feeRange.length - 1].toFixed(2)] })),
      congestion: f.fastestFee >= 50 ? "high" : f.fastestFee >= 10 ? "moderate" : "low" });
  } catch (e) { return fail(e); }
}

export async function btcaddr(a) {
  const ad = String(a.address || "").trim(); if (!ADDR.test(ad)) return R(400, { error: "valid bitcoin address required" });
  try {
    const [d, txs, px] = await Promise.all([gj("/address/" + ad), gj("/address/" + ad + "/txs"), gj("/v1/prices")]);
    const c = d.chain_stats, m = d.mempool_stats; const bal = c.funded_txo_sum - c.spent_txo_sum + m.funded_txo_sum - m.spent_txo_sum;
    const ts = txs.filter((t) => t.status?.block_time).map((t) => t.status.block_time);
    return R(200, { address: ad, type: ad.startsWith("bc1p") ? "p2tr" : ad.startsWith("bc1q") ? (ad.length > 50 ? "p2wsh" : "p2wpkh") : ad[0] === "3" ? "p2sh" : "p2pkh",
      balance_btc: btc(bal), balance_usd: px.USD ? +(btc(bal) * px.USD).toFixed(2) : null, confirmed_btc: btc(c.funded_txo_sum - c.spent_txo_sum), unconfirmed_btc: btc(m.funded_txo_sum - m.spent_txo_sum),
      tx_count: c.tx_count + m.tx_count, received_btc: btc(c.funded_txo_sum), sent_btc: btc(c.spent_txo_sum), utxo_count_est: c.funded_txo_count - c.spent_txo_count,
      last_active: ts.length ? new Date(Math.max(...ts) * 1000).toISOString() : null, address_reused: c.spent_txo_count > 0 && c.funded_txo_count > 1,
      recent_txs: txs.slice(0, 10).map((t) => ({ txid: t.txid, confirmed: t.status.confirmed, block_height: t.status.block_height ?? null, fee_sats: t.fee })) });
  } catch (e) { return fail(e); }
}

export async function btctx(a) {
  const id = String(a.txid || "").trim().toLowerCase(); if (!TXID.test(id)) return R(400, { error: "64-hex txid required" });
  try {
    const [t, tip] = await Promise.all([gj("/tx/" + id), gj("/blocks/tip/height")]);
    const vsize = Math.ceil(t.weight / 4); const out = t.vout.reduce((s, o) => s + o.value, 0);
    const rbf = t.vin.some((i) => i.sequence < 0xfffffffe);
    return R(200, { txid: id, confirmed: t.status.confirmed, block_height: t.status.block_height ?? null, confirmations: t.status.confirmed ? Number(tip) - t.status.block_height + 1 : 0,
      block_time: t.status.block_time ? new Date(t.status.block_time * 1000).toISOString() : null, fee_sats: t.fee, vsize, fee_rate_sat_vb: +(t.fee / vsize).toFixed(2), rbf_signaled: rbf,
      inputs: t.vin.length, outputs: t.vout.length, total_out_btc: btc(out), coinbase: t.vin.some((i) => i.is_coinbase),
      vout: t.vout.slice(0, 20).map((o) => ({ address: o.scriptpubkey_address || null, type: o.scriptpubkey_type, btc: btc(o.value) })),
      hint: t.status.confirmed ? null : rbf ? "unconfirmed; RBF signaled — can be fee-bumped" : "unconfirmed; use CPFP to accelerate" });
  } catch (e) { return fail(e); }
}

export async function btcnetwork() {
  try {
    const [blocks, da, hr, px] = await Promise.all([gj("/v1/blocks"), gj("/v1/difficulty-adjustment"), gj("/v1/mining/hashrate/3d"), gj("/v1/prices")]);
    const b0 = blocks[0];
    return R(200, { height: b0.height, last_block_time: new Date(b0.timestamp * 1000).toISOString(), last_block_age_s: Math.round(Date.now() / 1000 - b0.timestamp), btc_usd: px.USD,
      hashrate_ehs: +(hr.currentHashrate / 1e18).toFixed(1), difficulty: hr.currentDifficulty,
      difficulty_adjustment: { progress_pct: +da.progressPercent.toFixed(2), est_change_pct: +da.difficultyChange.toFixed(2), remaining_blocks: da.remainingBlocks, est_date: new Date(da.estimatedRetargetDate).toISOString(), avg_block_time_s: Math.round(da.timeAvg / 1000) },
      halving: { next_height: Math.ceil((b0.height + 1) / 210000) * 210000, blocks_left: Math.ceil((b0.height + 1) / 210000) * 210000 - b0.height },
      recent_blocks: blocks.slice(0, 6).map((b) => ({ height: b.height, tx: b.tx_count, size_mb: +(b.size / 1e6).toFixed(2), pool: b.extras?.pool?.name || null, median_fee: b.extras?.medianFee ?? null, reward_btc: b.extras ? btc(b.extras.reward) : null })) });
  } catch (e) { return fail(e); }
}
