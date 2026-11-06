// pack35: btcmempool (mempool state + projected blocks), btchalving (halving countdown/subsidy), solnewtokens (newly listed Solana tokens with risk), btccpfp (tx package/CPFP + acceleration need)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p, text) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (r.status === 400 || r.status === 404) { const e = new Error("notfound"); e.nf = 1; throw e; } if (!r.ok) throw new Error("upstream " + r.status); return text ? r.text() : r.json(); }
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));

export async function btcmempool() {
  try {
    const [m, b, f] = await Promise.all([mp("/mempool"), mp("/v1/fees/mempool-blocks"), mp("/v1/fees/recommended")]);
    return R(200, { chain: "bitcoin", source: "mempool.space", tx_count: m.count, vsize_vb: m.vsize, total_fee_btc: m.total_fee / 1e8, blocks_to_clear: +(m.vsize / 1e6).toFixed(2), est_clear_minutes: Math.round((m.vsize / 1e6) * 10), recommended_sat_vb: { fastest: f.fastestFee, half_hour: f.halfHourFee, hour: f.hourFee, economy: f.economyFee, minimum: f.minimumFee }, projected_blocks: b.slice(0, 8).map((x, i) => ({ block: i + 1, eta_minutes: (i + 1) * 10, tx_count: x.nTx, vsize_vb: Math.round(x.blockVSize), fees_btc: x.totalFees / 1e8, median_fee_rate: r2(x.medianFee), min_fee_rate: r2(x.feeRange[0]), max_fee_rate: r2(x.feeRange.at(-1)) })) });
  } catch (e) { return bad(e); }
}

export async function btchalving() {
  try {
    const [h, d] = await Promise.all([mp("/blocks/tip/height", 1), mp("/v1/difficulty-adjustment")]); const tip = +h, era = Math.floor(tip / 210000), next = (era + 1) * 210000, left = next - tip, bt = d.timeAvg / 1000;
    const sub = 50 / 2 ** era; let mined = 0; for (let i = 0; i < era; i++) mined += 210000 * (50 / 2 ** i); mined += (tip - era * 210000 + 1) * sub;
    return R(200, { chain: "bitcoin", height: tip, halving_era: era, current_subsidy_btc: sub, next_subsidy_btc: sub / 2, next_halving_height: next, blocks_remaining: left, avg_block_time_sec: +bt.toFixed(1), est_halving_date: new Date(Date.now() + left * bt * 1000).toISOString(), est_days_remaining: +((left * bt) / 86400).toFixed(1), era_progress_pct: +((100 * (tip - era * 210000)) / 210000).toFixed(2), est_supply_btc: Math.round(mined), supply_mined_pct: +((100 * mined) / 21e6).toFixed(3), annual_issuance_btc: Math.round((sub * 365 * 86400) / bt), annual_inflation_pct: +((100 * ((sub * 365 * 86400) / bt)) / mined).toFixed(3) });
  } catch (e) { return bad(e); }
}

export async function solnewtokens(a) {
  try {
    const r = await fetch("https://lite-api.jup.ag/tokens/v2/recent", { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("jupiter " + r.status); let d = await r.json(); const minL = n(a.min_liquidity, 0, 0, 1e9); d = d.filter((t) => (t.liquidity || 0) >= minL);
    const rows = d.slice(0, n(a.limit, 30, 1, 100)).map((t) => { const au = t.audit || {}; const fl = []; if (au.mintAuthorityDisabled === false) fl.push("mint authority"); if (au.freezeAuthorityDisabled === false) fl.push("freeze authority"); if (au.topHoldersPercentage > 50) fl.push("top holders >50%"); if (au.devBalancePercentage > 10) fl.push("dev holds >10%"); if ((t.liquidity || 0) < 5000) fl.push("liquidity <$5k");
      const s = t.stats1h || t.stats5m || {}; return { mint: t.id, symbol: t.symbol, name: t.name, created: t.createdAt || t.firstPool?.createdAt || null, launchpad: t.launchpad || null, dev: t.dev || null, price_usd: t.usdPrice ?? null, mcap_usd: t.mcap ? Math.round(t.mcap) : null, liquidity_usd: t.liquidity ? Math.round(t.liquidity) : 0, holders: t.holderCount ?? null, volume_1h_usd: Math.round((s.buyVolume || 0) + (s.sellVolume || 0)), organic_score: r2(t.organicScore), top_holders_pct: r2(au.topHoldersPercentage), dev_balance_pct: r2(au.devBalancePercentage), risk_flags: fl }; });
    return R(200, { chain: "solana", source: "jupiter", tokens: rows.length, flagged: rows.filter((x) => x.risk_flags.length).length, list: rows });
  } catch (e) { return bad(e); }
}

export async function btccpfp(a) {
  const t = (a.txid || "").trim().toLowerCase(); if (!/^[0-9a-f]{64}$/.test(t)) return R(400, { error: "txid required: 64-hex bitcoin txid" });
  try {
    const tx = await mp("/tx/" + t); const [c, f, st] = await Promise.all([mp("/v1/cpfp/" + t).catch(() => ({})), mp("/v1/fees/recommended"), tx.status.confirmed ? null : mp("/tx/" + t + "/rbf").catch(() => null)]);
    const vs = tx.weight / 4, rate = tx.fee / vs; const anc = c.ancestors || [], des = c.descendants || []; const pw = vs + anc.reduce((s, x) => s + x.weight / 4, 0) + des.reduce((s, x) => s + x.weight / 4, 0), pf = tx.fee + anc.reduce((s, x) => s + x.fee, 0) + des.reduce((s, x) => s + x.fee, 0); const eff = c.effectiveFeePerVsize ?? pf / pw;
    const target = f.halfHourFee; const need = !tx.status.confirmed && eff < target ? Math.ceil(target * (pw + 110) - pf) : 0;
    return R(200, { chain: "bitcoin", txid: t, confirmed: tx.status.confirmed, block_height: tx.status.block_height ?? null, vsize_vb: +vs.toFixed(2), fee_sats: tx.fee, fee_rate: +rate.toFixed(2), effective_package_rate: +eff.toFixed(2), ancestors: anc.length, descendants: des.length, rbf_signaled: tx.vin.some((x) => x.sequence < 0xfffffffe), replaced_by: st?.replacements?.tx?.txid || null, target_half_hour_rate: target, below_target: !tx.status.confirmed && eff < target, est_cpfp_child_fee_sats: need || null, note: need ? "approx fee a ~110 vB child must pay to lift the package to the half-hour rate" : undefined });
  } catch (e) { return e.nf ? R(404, { error: "tx not found", txid: t }) : bad(e); }
}
