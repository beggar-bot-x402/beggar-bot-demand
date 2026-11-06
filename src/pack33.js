// pack33: btcutxo (address UTXO set), btcblock (block details by height/hash), btcrbf (recent RBF replacements), btcpool (one mining pool's stats)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p, text) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (r.status === 400 || r.status === 404) { const e = new Error("notfound"); e.nf = 1; throw e; } if (!r.ok) throw new Error("upstream " + r.status); return text ? r.text() : r.json(); }
const ADDR = /^(bc1[a-z0-9]{8,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;

export async function btcutxo(a) {
  const ad = (a.address || "").trim(); if (!ADDR.test(ad)) return R(400, { error: "address required: bitcoin mainnet address (bc1…, 1…, 3…)" });
  try {
    const [u, tip, fees] = await Promise.all([mp(`/address/${ad}/utxo`), mp("/blocks/tip/height", 1), mp("/v1/fees/recommended").catch(() => null)]); const h = +tip;
    const rows = u.map((x) => ({ txid: x.txid, vout: x.vout, value_sats: x.value, confirmed: x.status.confirmed, height: x.status.block_height ?? null, confirmations: x.status.confirmed ? h - x.status.block_height + 1 : 0 })).sort((p, q) => q.value_sats - p.value_sats);
    const tot = rows.reduce((s, x) => s + x.value_sats, 0); const fr = fees?.halfHourFee ?? null; const dust = fr ? Math.ceil(68 * fr) : null;
    return R(200, { chain: "bitcoin", address: ad, utxos: rows.length, total_sats: tot, total_btc: tot / 1e8, confirmed_sats: rows.filter((x) => x.confirmed).reduce((s, x) => s + x.value_sats, 0), unconfirmed: rows.filter((x) => !x.confirmed).length, largest_sats: rows[0]?.value_sats ?? 0, smallest_sats: rows.at(-1)?.value_sats ?? 0, fee_rate_sat_vb: fr, uneconomic_utxos: dust ? rows.filter((x) => x.value_sats < dust).length : null, note: "uneconomic = value below cost to spend a ~68 vB input at the half-hour fee rate", list: rows.slice(0, n(a.limit, 50, 1, 500)) });
  } catch (e) { return e.nf ? R(400, { error: "invalid address" }) : bad(e); }
}

export async function btcblock(a) {
  const q = (a.block || a.height || "tip").trim(); if (!/^(tip|\d{1,7}|[0-9a-f]{64})$/.test(q)) return R(400, { error: "block required: height, 64-hex hash, or tip" });
  try {
    const hash = q === "tip" ? await mp("/blocks/tip/hash", 1) : /^\d+$/.test(q) ? await mp("/block-height/" + q, 1) : q; const [b, tip] = await Promise.all([mp("/v1/block/" + hash), mp("/blocks/tip/height", 1)]); const x = b.extras || {};
    return R(200, { chain: "bitcoin", height: b.height, hash: b.id, time: new Date(b.timestamp * 1000).toISOString(), confirmations: +tip - b.height + 1, miner: x.pool?.name || null, tx_count: b.tx_count, size_bytes: b.size, weight: b.weight, fullness_pct: +((100 * b.weight) / 4e6).toFixed(2), difficulty: b.difficulty, total_fees_btc: x.totalFees != null ? x.totalFees / 1e8 : null, reward_btc: x.reward != null ? x.reward / 1e8 : null, median_fee_rate: x.medianFee ?? null, fee_range: x.feeRange || null, avg_fee_sats: x.avgFee ?? null, match_rate_pct: x.matchRate ?? null, coinbase_tag: x.coinbaseSignatureAscii || null, previous_hash: b.previousblockhash });
  } catch (e) { return e.nf ? R(404, { error: "block not found", block: q }) : bad(e); }
}

export async function btcrbf(a) {
  try {
    const r = await mp(a.full === "true" ? "/v1/fullrbf/replacements" : "/v1/replacements"); const L = n(a.limit, 25, 1, 100);
    const rows = r.map((x) => { const old = x.replaces || []; const of = old.reduce((s, y) => Math.max(s, y.tx.rate), 0); return { txid: x.tx.txid, time: new Date(x.time * 1000).toISOString(), fee_sats: x.tx.fee, fee_rate: +x.tx.rate.toFixed(2), replaced: old.length, replaced_txids: old.map((y) => y.tx.txid), prev_fee_rate: +of.toFixed(2), fee_bump_x: of ? +(x.tx.rate / of).toFixed(2) : null, value_sats: x.tx.value, full_rbf: x.fullRbf, mined: !!x.mined }; });
    return R(200, { chain: "bitcoin", source: "mempool.space", replacements: rows.length, full_rbf: rows.filter((x) => x.full_rbf).length, avg_fee_bump_x: rows.length ? +(rows.reduce((s, x) => s + (x.fee_bump_x || 0), 0) / rows.length).toFixed(2) : null, list: rows.slice(0, L) });
  } catch (e) { return bad(e); }
}

export async function btcpool(a) {
  const s = (a.pool || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (!s) return R(400, { error: "pool required: slug e.g. foundryusa, antpool, viabtc, f2pool, marapool (see /v1/btcpools)" });
  try {
    const [d, bl] = await Promise.all([mp("/v1/mining/pool/" + s), mp(`/v1/mining/pool/${s}/blocks`).catch(() => [])]);
    return R(200, { chain: "bitcoin", source: "mempool.space", pool: d.pool.name, slug: d.pool.slug, link: d.pool.link, blocks_24h: d.blockCount["24h"], blocks_1w: d.blockCount["1w"], blocks_all: d.blockCount.all, share_24h_pct: +(100 * d.blockShare["24h"]).toFixed(2), share_1w_pct: +(100 * d.blockShare["1w"]).toFixed(2), est_hashrate_ehs: +(d.estimatedHashrate / 1e18).toFixed(1), avg_block_health_pct: d.avgBlockHealth ?? null, total_reward_btc: +d.totalReward / 1e8, payout_addresses: d.pool.addresses.slice(0, 10), recent_blocks: bl.slice(0, n(a.limit, 10, 0, 15)).map((b) => ({ height: b.height, time: new Date(b.timestamp * 1000).toISOString(), tx_count: b.tx_count, fees_btc: b.extras?.totalFees != null ? b.extras.totalFees / 1e8 : null })) });
  } catch (e) { return e.nf ? R(404, { error: "unknown pool", pool: s }) : bad(e); }
}
