// pack44: btcrecentblocks (last 15 blocks with pool/fees/template match), btcpooldom (pool hashrate share trend + concentration), btcoutspends (which outputs of a tx are spent and by what), btcvalidate (address validation + script type)
const R = (status, body) => ({ status, body });
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (r.status === 400 || r.status === 404) { const e = new Error("nf"); e.nf = 1; throw e; } if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const iso = (t) => new Date(t * 1000).toISOString();

export async function btcrecentblocks(a) {
  try {
    const h = a.start_height && /^\d+$/.test(a.start_height) ? "/" + a.start_height : ""; const d = await mp("/v1/blocks" + h);
    const rows = d.map((b, i) => { const x = b.extras || {}; return { height: b.height, hash: b.id, time: iso(b.timestamp), interval_sec: d[i + 1] ? b.timestamp - d[i + 1].timestamp : null, pool: x.pool?.name || null, tx_count: b.tx_count, size_mb: r2(b.size / 1e6), fullness_pct: r2(b.weight / 4e4), reward_btc: x.reward / 1e8, fees_btc: x.totalFees / 1e8, median_fee_rate: r2(x.medianFee), fee_range: x.feeRange ? [r2(x.feeRange[0]), r2(x.feeRange.at(-1))] : null, template_match_pct: x.matchRate ?? null, fees_vs_expected_pct: x.expectedFees ? r2((100 * (x.totalFees - x.expectedFees)) / x.expectedFees) : null, utxo_set_change: x.utxoSetChange ?? null }; });
    const ints = rows.map((x) => x.interval_sec).filter((x) => x != null);
    return R(200, { chain: "bitcoin", blocks: rows.length, tip: rows[0]?.height, avg_interval_sec: ints.length ? Math.round(ints.reduce((s, x) => s + x, 0) / ints.length) : null, low_match_blocks: rows.filter((x) => x.template_match_pct != null && x.template_match_pct < 90).length, list: rows });
  } catch (e) { return e.nf ? R(404, { error: "height not found" }) : bad(e); }
}

export async function btcpooldom(a) {
  const p = ["1m", "3m", "6m", "1y"].includes(a.period) ? a.period : "1m";
  try {
    const d = await mp("/v1/mining/hashrate/pools/" + p); const ts = [...new Set(d.map((x) => x.timestamp))].sort(); const first = ts[0], last = ts.at(-1);
    const at = (t) => Object.fromEntries(d.filter((x) => x.timestamp === t).map((x) => [x.poolName, x.share])); const A = at(first), B = at(last);
    const rows = Object.keys(B).map((k) => ({ pool: k, share_pct: r2(B[k] * 100), start_share_pct: A[k] != null ? r2(A[k] * 100) : null, change_pp: A[k] != null ? r2((B[k] - A[k]) * 100) : null })).sort((x, y) => y.share_pct - x.share_pct);
    const hhi = Object.values(B).reduce((s, x) => s + (x * 100) ** 2, 0); let c = 0, k51 = 0; for (const r of rows) { c += r.share_pct; k51++; if (c > 50) break; }
    return R(200, { chain: "bitcoin", period: p, from: iso(first).slice(0, 10), to: iso(last).slice(0, 10), pools: rows.length, top_pool: rows[0]?.pool, top_share_pct: rows[0]?.share_pct, top3_share_pct: r2(rows.slice(0, 3).reduce((s, x) => s + x.share_pct, 0)), pools_to_51pct: k51, hhi: Math.round(hhi), list: rows });
  } catch (e) { return bad(e); }
}

export async function btcoutspends(a) {
  const t = (a.txid || "").trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(t)) return R(400, { error: "txid required: 64-hex bitcoin txid" });
  try {
    const [tx, o] = await Promise.all([mp("/tx/" + t), mp("/tx/" + t + "/outspends")]);
    const rows = tx.vout.map((v, i) => ({ vout: i, value_btc: v.value / 1e8, address: v.scriptpubkey_address || null, type: v.scriptpubkey_type, spent: !!o[i]?.spent, spending_txid: o[i]?.txid || null, spending_vin: o[i]?.vin ?? null, spent_confirmed: o[i]?.status?.confirmed ?? null, spent_height: o[i]?.status?.block_height ?? null }));
    const sp = rows.filter((x) => x.spent);
    return R(200, { chain: "bitcoin", txid: t, confirmed: tx.status.confirmed, outputs: rows.length, spent: sp.length, unspent: rows.length - sp.length, unspent_btc: +rows.filter((x) => !x.spent && x.type !== "op_return").reduce((s, x) => s + x.value_btc, 0).toFixed(8), spent_btc: +sp.reduce((s, x) => s + x.value_btc, 0).toFixed(8), list: rows });
  } catch (e) { return e.nf ? R(404, { error: "tx not found", txid: t }) : bad(e); }
}

export async function btcvalidate(a) {
  const ad = (a.address || "").trim(); if (!ad || ad.length > 100 || !/^[A-Za-z0-9]+$/.test(ad)) return R(400, { error: "address required: bitcoin address string" });
  try {
    const d = await mp("/v1/validate-address/" + ad); const wv = d.witness_version, pl = d.witness_program ? d.witness_program.length / 2 : null;
    const type = !d.isvalid ? null : wv === 1 ? "p2tr" : wv === 0 && pl === 20 ? "p2wpkh" : wv === 0 && pl === 32 ? "p2wsh" : d.isscript ? "p2sh" : "p2pkh";
    return R(200, { chain: "bitcoin", address: ad, valid: !!d.isvalid, network: d.isvalid ? (/^(bc1|1|3)/.test(ad) ? "mainnet" : "other") : null, type, is_script: d.isscript ?? null, is_witness: d.iswitness ?? null, witness_version: wv ?? null, script_pubkey: d.scriptPubKey || null, error: d.isvalid ? undefined : d.error || "invalid address", dust_limit_sats: type === "p2pkh" ? 546 : type === "p2sh" ? 540 : type === "p2wsh" ? 330 : type === "p2tr" ? 330 : type ? 294 : null });
  } catch (e) { return bad(e); }
}
