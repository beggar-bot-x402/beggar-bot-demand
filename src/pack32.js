// pack32: solvalidators (Solana stake distribution), solactivity (Solana address recent activity), btcdiff (difficulty adjustment), btcrewards (miner fee vs subsidy)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function rpc(method, params = []) { const r = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) }); const d = await r.json(); if (d.error) throw new Error("rpc: " + d.error.message); return d.result; }
async function mp(p) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function solvalidators(a) {
  try {
    const v = await rpc("getVoteAccounts"); const all = [...v.current.map((x) => ({ ...x, d: false })), ...v.delinquent.map((x) => ({ ...x, d: true }))];
    const rows = all.map((x) => { const ec = x.epochCredits || []; const last = ec.at(-2); return { vote_account: x.votePubkey, identity: x.nodePubkey, stake_sol: Math.round(x.activatedStake / 1e9), commission_pct: x.commission, delinquent: x.d, last_vote_slot: x.lastVote, credits_last_epoch: last ? last[1] - last[2] : null }; }).sort((p, q) => q.stake_sol - p.stake_sol);
    const tot = rows.reduce((s, x) => s + x.stake_sol, 0); let cum = 0, nak = 0; rows.forEach((x, i) => { x.rank = i + 1; x.stake_share_pct = +((100 * x.stake_sol) / tot).toFixed(4); cum += x.stake_sol; if (!nak && cum > tot / 3) nak = i + 1; });
    if (a.validator) { const f = rows.find((x) => x.vote_account === a.validator || x.identity === a.validator); if (!f) return R(404, { error: "unknown validator", validator: a.validator }); return R(200, { chain: "solana", total_stake_sol: tot, ...f }); }
    const del = rows.filter((x) => x.delinquent); const zc = rows.filter((x) => x.commission_pct === 0).length;
    return R(200, { chain: "solana", validators: rows.length, delinquent: del.length, delinquent_stake_pct: +((100 * del.reduce((s, x) => s + x.stake_sol, 0)) / tot).toFixed(3), total_stake_sol: tot, nakamoto_coefficient: nak, zero_commission: zc, top10_share_pct: +rows.slice(0, 10).reduce((s, x) => s + x.stake_share_pct, 0).toFixed(2), list: rows.slice(0, n(a.limit, 25, 1, 200)) });
  } catch (e) { return bad(e); }
}

export async function solactivity(a) {
  const ad = (a.address || "").trim(); if (!B58.test(ad)) return R(400, { error: "address required: base58 Solana account/program" });
  try {
    const s = await rpc("getSignaturesForAddress", [ad, { limit: n(a.limit, 100, 1, 1000) }]); if (!s.length) return R(200, { chain: "solana", address: ad, transactions: 0, note: "no recent transactions" });
    const t = s.map((x) => x.blockTime).filter(Boolean); const span = t.length > 1 ? t[0] - t.at(-1) : 0; const fail = s.filter((x) => x.err).length;
    return R(200, { chain: "solana", address: ad, transactions: s.length, failed: fail, failure_rate_pct: +((100 * fail) / s.length).toFixed(2), newest: t[0] ? new Date(t[0] * 1000).toISOString() : null, oldest_in_sample: t.at(-1) ? new Date(t.at(-1) * 1000).toISOString() : null, seconds_since_last: t[0] ? Math.max(0, Math.round(Date.now() / 1000 - t[0])) : null, tx_per_hour: span ? +((3600 * s.length) / span).toFixed(2) : null, with_memo: s.filter((x) => x.memo).length, recent: s.slice(0, 10).map((x) => ({ signature: x.signature, slot: x.slot, time: x.blockTime ? new Date(x.blockTime * 1000).toISOString() : null, ok: !x.err, memo: x.memo })) });
  } catch (e) { return /invalid|Invalid/.test(e.message) ? R(400, { error: "invalid address" }) : bad(e); }
}

export async function btcdiff() {
  try {
    const [d, h] = await Promise.all([mp("/v1/difficulty-adjustment"), mp("/v1/mining/hashrate/1m").catch(() => null)]);
    return R(200, { chain: "bitcoin", source: "mempool.space", epoch_progress_pct: +d.progressPercent.toFixed(2), est_difficulty_change_pct: +d.difficultyChange.toFixed(3), previous_change_pct: +d.previousRetarget.toFixed(3), next_retarget_height: d.nextRetargetHeight, remaining_blocks: d.remainingBlocks, est_retarget_date: new Date(d.estimatedRetargetDate).toISOString(), avg_block_time_sec: +(d.timeAvg / 1000).toFixed(1), blocks_vs_expected: d.expectedBlocks ? +(2016 - d.remainingBlocks - d.expectedBlocks).toFixed(1) : null, current_difficulty: h?.currentDifficulty ?? null, current_hashrate_ehs: h?.currentHashrate ? +(h.currentHashrate / 1e18).toFixed(1) : null });
  } catch (e) { return bad(e); }
}

export async function btcrewards(a) {
  const b = n(a.blocks, 144, 1, 1000);
  try {
    const [s, p] = await Promise.all([mp("/v1/mining/reward-stats/" + b), mp("/v1/prices").catch(() => null)]); const blocks = s.endBlock - s.startBlock + 1; const rw = +s.totalReward / 1e8, fee = +s.totalFee / 1e8, sub = rw - fee; const usd = p?.USD;
    return R(200, { chain: "bitcoin", source: "mempool.space", blocks, from_height: s.startBlock, to_height: s.endBlock, total_reward_btc: +rw.toFixed(8), subsidy_btc: +sub.toFixed(8), fees_btc: +fee.toFixed(8), fee_share_pct: +((100 * fee) / rw).toFixed(3), avg_fees_per_block_btc: +(fee / blocks).toFixed(8), transactions: +s.totalTx, avg_fee_per_tx_sats: Math.round((fee * 1e8) / +s.totalTx), btc_usd: usd ?? null, total_reward_usd: usd ? Math.round(rw * usd) : null, fees_usd: usd ? Math.round(fee * usd) : null });
  } catch (e) { return bad(e); }
}
