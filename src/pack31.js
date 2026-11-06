// pack31: solquote (Jupiter swap quote), solprio (Solana priority fees), solepoch (epoch/network settlement status), btcpools (bitcoin mining pool share)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const RPCS = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
async function rpc(method, params = []) { let le; for (const u of RPCS) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(12000) }); const d = await r.json(); if (d.error) throw new Error(d.error.message); return d.result; } catch (e) { le = e; } } throw le; }
const SYM = { SOL: "So11111111111111111111111111111111111111112", USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" };
const mint = (t) => { t = (t || "").trim(); if (SYM[t.toUpperCase()]) return SYM[t.toUpperCase()]; return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(t) ? t : null; };
async function dec(m) { if (m === SYM.SOL) return 9; const s = await rpc("getTokenSupply", [m]); return s.value.decimals; }

export async function solquote(a) {
  const i = mint(a.from || "SOL"), o = mint(a.to), amt = parseFloat(a.amount || "1"); if (!i || !o || !(amt > 0)) return R(400, { error: "to required: symbol (SOL, USDC, USDT, JUP, BONK) or mint; optional from (default SOL), amount (UI units, default 1), slippage_bps" });
  try {
    let di, dout; try { [di, dout] = await Promise.all([dec(i), dec(o)]); } catch { return R(404, { error: "unknown mint" }); }
    const raw = BigInt(Math.round(amt * 10 ** di)); const sl = n(a.slippage_bps, 50, 1, 5000);
    const r = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${i}&outputMint=${o}&amount=${raw}&slippageBps=${sl}`, { signal: AbortSignal.timeout(15000) }); const q = await r.json(); if (!r.ok || q.error) return R(404, { error: q.error || "no route", code: q.errorCode });
    const out = +q.outAmount / 10 ** dout;
    return R(200, { source: "jupiter", from_mint: i, to_mint: o, amount_in: amt, amount_out: out, min_out_after_slippage: +q.otherAmountThreshold / 10 ** dout, price: out / amt, inverse_price: amt / out, price_impact_pct: +(100 * +q.priceImpactPct).toFixed(4), slippage_bps: sl, swap_usd_value: q.swapUsdValue ? +(+q.swapUsdValue).toFixed(2) : null, hops: q.routePlan.length, route: q.routePlan.map((h) => ({ amm: h.swapInfo.label, pool: h.swapInfo.ammKey, percent: h.percent })), context_slot: q.contextSlot });
  } catch (e) { return bad(e); }
}

export async function solprio(a) {
  const acc = (a.accounts || "").split(",").map((x) => x.trim()).filter(Boolean); if (acc.some((x) => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(x)) || acc.length > 128) return R(400, { error: "accounts: comma-separated base58 addresses (max 128), optional" });
  try {
    const f = (await rpc("getRecentPrioritizationFees", acc.length ? [acc] : [])).map((x) => x.prioritizationFee).sort((p, q) => p - q); if (!f.length) return R(404, { error: "no samples" });
    const q = (p) => f[Math.min(f.length - 1, Math.floor((p / 100) * f.length))]; const cu = n(a.compute_units, 200000, 1, 1.4e6);
    const lv = { min: f[0], p25: q(25), median: q(50), p75: q(75), p90: q(90), max: f.at(-1) }; const cost = Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, +((v * cu) / 1e6 / 1e9 + 5000 / 1e9).toFixed(9)]));
    return R(200, { chain: "solana", unit: "micro-lamports per compute unit", slots_sampled: f.length, nonzero_slots: f.filter((x) => x > 0).length, accounts: acc, levels: lv, recommended: { low: q(50), medium: q(75), high: q(90) }, compute_units: cu, est_total_fee_sol: cost, note: "Without accounts these are global per-slot minimums (often 0); pass hot writable accounts (e.g. a pool or program) for contention-aware levels. est_total_fee_sol = priority fee at that level for compute_units + 5000-lamport base signature fee" });
  } catch (e) { return bad(e); }
}

export async function solepoch() {
  try {
    const [ep, perf, sup, ver] = await Promise.all([rpc("getEpochInfo"), rpc("getRecentPerformanceSamples", [10]), rpc("getSupply", [{ excludeNonCirculatingAccountsList: true }]).catch(() => null), rpc("getVersion").catch(() => null)]);
    const secs = perf.reduce((s, x) => s + x.samplePeriodSecs, 0), slots = perf.reduce((s, x) => s + x.numSlots, 0), tx = perf.reduce((s, x) => s + x.numTransactions, 0), nv = perf.reduce((s, x) => s + (x.numNonVoteTransactions || 0), 0); const st = secs / slots; const left = ep.slotsInEpoch - ep.slotIndex;
    return R(200, { chain: "solana", epoch: ep.epoch, slot: ep.absoluteSlot, block_height: ep.blockHeight, epoch_progress_pct: +((100 * ep.slotIndex) / ep.slotsInEpoch).toFixed(2), slots_remaining: left, est_epoch_end: new Date(Date.now() + left * st * 1000).toISOString(), avg_slot_time_ms: Math.round(st * 1000), tps: Math.round(tx / secs), non_vote_tps: Math.round(nv / secs), total_transactions: ep.transactionCount, supply_sol: sup ? Math.round(sup.value.total / 1e9) : null, circulating_sol: sup ? Math.round(sup.value.circulating / 1e9) : null, node_version: ver?.["solana-core"] || null });
  } catch (e) { return bad(e); }
}

export async function btcpools(a) {
  const p = ["24h", "3d", "1w", "1m", "3m", "6m", "1y"].includes(a.period) ? a.period : "1w";
  try {
    const r = await fetch("https://mempool.space/api/v1/mining/pools/" + p, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("upstream " + r.status); const d = await r.json(); const tot = d.blockCount || d.pools.reduce((s, x) => s + x.blockCount, 0);
    const rows = d.pools.map((x) => ({ rank: x.rank, pool: x.name, slug: x.slug, blocks: x.blockCount, share_pct: +((100 * x.blockCount) / tot).toFixed(2), empty_blocks: x.emptyBlocks, avg_match_rate_pct: x.avgMatchRate ?? null, link: x.link }));
    let cum = 0, nak = 0; for (const x of rows) { cum += x.share_pct; if (cum > 50) { nak = x.rank; break; } }
    return R(200, { chain: "bitcoin", source: "mempool.space", period: p, blocks: tot, pools: rows.length, top2_share_pct: +rows.slice(0, 2).reduce((s, x) => s + x.share_pct, 0).toFixed(2), pools_for_51pct: nak, est_hashrate_ehs: d.lastEstimatedHashrate ? +(d.lastEstimatedHashrate / 1e18).toFixed(1) : null, list: rows.slice(0, n(a.limit, 20, 1, 100)) });
  } catch (e) { return bad(e); }
}
