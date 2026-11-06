// pack23: hlfills, hlfundpay, hlstake (Hyperliquid address enrichment) + dexsearch (DexScreener pair search)
const R = (status, body) => ({ status, body });
const err = (e) => /hyperliquid (422|500)/.test(String(e.message)) ? R(404, { error: "unknown address on hyperliquid" }) : R(502, { error: String(e.message || e).slice(0, 200) });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
const top = (m, k = 15) => Object.entries(m).sort((p, q) => Math.abs(q[1].v) - Math.abs(p[1].v)).slice(0, k);

export async function hlfills(a) {
  if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(), days = n(a.days, 7, 0.1, 30); const f = await hl({ type: "userFillsByTime", user, startTime: Date.now() - days * 864e5, aggregateByTime: true });
    let vol = 0, pnl = 0, fees = 0, maker = 0, wins = 0, losses = 0; const by = {};
    for (const x of f) { const u = +x.px * +x.sz, p = +x.closedPnl, fe = +x.fee; vol += u; pnl += p; fees += fe; if (!x.crossed) maker += u; if (p > 0) wins++; else if (p < 0) losses++; const c = (by[x.coin] = by[x.coin] || { v: 0, pnl: 0, fills: 0, fees: 0 }); c.v += u; c.pnl += p; c.fills++; c.fees += fe; }
    return R(200, { venue: "hyperliquid", address: user, days, fills: f.length, capped: f.length >= 2000, volume_usd: Math.round(vol), realized_pnl_usd: +pnl.toFixed(2), fees_usd: +fees.toFixed(2), net_after_fees_usd: +(pnl - fees).toFixed(2), maker_share_pct: vol ? +((100 * maker) / vol).toFixed(1) : null, win_rate_pct: wins + losses ? +((100 * wins) / (wins + losses)).toFixed(1) : null,
      by_coin: top(by).map(([coin, c]) => ({ coin, volume_usd: Math.round(c.v), realized_pnl_usd: +c.pnl.toFixed(2), fees_usd: +c.fees.toFixed(2), fills: c.fills })),
      recent: f.slice(-n(a.limit, 20, 0, 100)).reverse().map((x) => ({ time: new Date(x.time).toISOString(), coin: x.coin, dir: x.dir, px: +x.px, sz: +x.sz, usd: Math.round(+x.px * +x.sz), closed_pnl: +x.closedPnl, fee: +x.fee, maker: !x.crossed, hash: x.hash })) });
  } catch (e) { return err(e); }
}

export async function hlfundpay(a) {
  if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(), days = n(a.days, 7, 0.1, 30); const f = await hl({ type: "userFunding", user, startTime: Date.now() - days * 864e5 });
    let net = 0, rec = 0, paid = 0; const by = {}, daily = {};
    for (const x of f) { const d = x.delta || {}; if (d.type !== "funding") continue; const u = +d.usdc; net += u; if (u > 0) rec += u; else paid += -u; const c = (by[d.coin] = by[d.coin] || { v: 0, n: 0, szi: 0 }); c.v += u; c.n++; c.szi = +d.szi; const day = new Date(x.time).toISOString().slice(0, 10); daily[day] = (daily[day] || 0) + u; }
    return R(200, { venue: "hyperliquid", address: user, days, payments: f.length, capped: f.length >= 500, net_funding_usd: +net.toFixed(2), received_usd: +rec.toFixed(2), paid_usd: +paid.toFixed(2), annualized_net_usd: +((net / days) * 365).toFixed(0), stance: net > 0 ? "funding earner (carry)" : net < 0 ? "funding payer" : "flat",
      by_coin: top(by, 20).map(([coin, c]) => ({ coin, net_usd: +c.v.toFixed(2), payments: c.n, last_size: c.szi, side: c.szi > 0 ? "long" : "short" })), daily: Object.entries(daily).sort().map(([day, u]) => ({ day, net_usd: +u.toFixed(2) })) });
  } catch (e) { return err(e); }
}

export async function hlstake(a) {
  const user = (a.address || "").toLowerCase(); if (a.address && !isAddr(a.address)) return R(400, { error: "address must be 0x…40 hex (omit for validator set)" });
  try {
    const vals = await hl({ type: "validatorSummaries" }); const name = Object.fromEntries((vals || []).map((v) => [v.validator, v.name]));
    const tot = (vals || []).reduce((s, v) => s + +v.stake, 0) / 1e8; const act = (vals || []).filter((v) => v.isActive && !v.isJailed);
    const set = { validators: (vals || []).length, active: act.length, jailed: (vals || []).filter((v) => v.isJailed).length, total_staked_hype: Math.round(tot),
      top: [...(vals || [])].sort((p, q) => +q.stake - +p.stake).slice(0, n(a.limit, 15, 1, 50)).map((v) => ({ validator: v.validator, name: v.name, stake_hype: Math.round(+v.stake / 1e8), share_pct: +((100 * +v.stake) / 1e8 / tot).toFixed(2), commission_pct: +(+v.commission * 100).toFixed(2), active: v.isActive, jailed: v.isJailed, apr_7d_pct: v.stats?.find?.((s) => s[0] === "week")?.[1]?.predictedApr != null ? +(100 * +v.stats.find((s) => s[0] === "week")[1].predictedApr).toFixed(2) : null })) };
    if (!user) return R(200, { venue: "hyperliquid", validator_set: set });
    const [sum, dels, rew] = await Promise.all([hl({ type: "delegatorSummary", user }), hl({ type: "delegations", user }).catch(() => []), hl({ type: "delegatorRewards", user }).catch(() => [])]);
    const rewards = (rew || []).reduce((s, r) => s + +r.totalAmount, 0);
    return R(200, { venue: "hyperliquid", address: user, delegated_hype: +sum.delegated, undelegated_hype: +sum.undelegated, pending_withdrawal_hype: +sum.totalPendingWithdrawal, pending_withdrawals: sum.nPendingWithdrawals,
      delegations: (dels || []).map((d) => ({ validator: d.validator, name: name[d.validator] || null, amount_hype: +d.amount, locked_until: d.lockedUntilTimestamp ? new Date(d.lockedUntilTimestamp).toISOString() : null })), rewards_received_hype: +rewards.toFixed(4), reward_events: (rew || []).length, validator_set: { ...set, top: set.top.slice(0, 5) } });
  } catch (e) { return err(e); }
}

export async function dexsearch(a) {
  const q = (a.q || a.query || "").trim(); if (!q || q.length > 80 || !/^[\w .$\-]+$/.test(q)) return R(400, { error: "q required: symbol, name or address e.g. q=brett" });
  try {
    const r = await fetch("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q), { signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("dexscreener " + r.status);
    let p = (await r.json()).pairs || []; if (a.chain) p = p.filter((x) => x.chainId === a.chain.toLowerCase()); const minLiq = n(a.min_liquidity, 10000, 0, 1e12); p = p.filter((x) => (x.liquidity?.usd || 0) >= minLiq);
    if (!p.length) return R(404, { error: "no pairs", q });
    p.sort((x, y) => (y.liquidity?.usd || 0) - (x.liquidity?.usd || 0)); const tok = {};
    for (const x of p) { const k = x.chainId + ":" + x.baseToken.address.toLowerCase(); const t = (tok[k] = tok[k] || { chain: x.chainId, address: x.baseToken.address, symbol: x.baseToken.symbol, name: x.baseToken.name, liquidity_usd: 0, volume_24h_usd: 0, pairs: 0, price_usd: +x.priceUsd || null, fdv: x.fdv || null, market_cap: x.marketCap || null }); t.liquidity_usd += x.liquidity?.usd || 0; t.volume_24h_usd += x.volume?.h24 || 0; t.pairs++; }
    const toks = Object.values(tok).sort((x, y) => y.liquidity_usd - x.liquidity_usd); const L = n(a.limit, 10, 1, 30);
    return R(200, { q, matches: p.length, distinct_tokens: toks.length, likely_canonical: toks[0] ? { ...toks[0], liquidity_usd: Math.round(toks[0].liquidity_usd), volume_24h_usd: Math.round(toks[0].volume_24h_usd) } : null, impostor_warning: toks.filter((t) => t.symbol?.toUpperCase() === toks[0].symbol?.toUpperCase()).length > 1 ? "multiple tokens share this symbol; verify the address" : null,
      tokens: toks.slice(0, L).map((t) => ({ ...t, liquidity_usd: Math.round(t.liquidity_usd), volume_24h_usd: Math.round(t.volume_24h_usd) })),
      pairs: p.slice(0, L).map((x) => ({ chain: x.chainId, dex: x.dexId, pair: x.pairAddress, base: x.baseToken.symbol, base_address: x.baseToken.address, quote: x.quoteToken.symbol, price_usd: +x.priceUsd || null, liquidity_usd: Math.round(x.liquidity?.usd || 0), volume_24h_usd: Math.round(x.volume?.h24 || 0), change_24h_pct: x.priceChange?.h24 ?? null, txns_24h: (x.txns?.h24?.buys || 0) + (x.txns?.h24?.sells || 0), created: x.pairCreatedAt ? new Date(x.pairCreatedAt).toISOString() : null, url: x.url })) });
  } catch (e) { return R(502, { error: String(e.message).slice(0, 200) }); }
}
