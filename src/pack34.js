// pack34: solprice (Jupiter prices for mints), soltoken (Solana token enrichment + audit), soltrending (trending/top Solana tokens), solinflation (inflation & staking yield)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function jup(p) { const r = await fetch("https://lite-api.jup.ag" + p, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("jupiter " + r.status); return r.json(); }
async function rpc(method, params = [], u = "https://solana-rpc.publicnode.com") { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) }); const d = await r.json(); if (d.error) throw new Error("rpc: " + d.error.message); return d.result; }
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SYM = { SOL: "So11111111111111111111111111111111111111112", USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", USDT: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const card = (t) => { const s = t.stats24h || {}; return { mint: t.id, symbol: t.symbol, name: t.name, price_usd: t.usdPrice ?? null, change_24h_pct: r2(s.priceChange), mcap_usd: t.mcap ? Math.round(t.mcap) : null, fdv_usd: t.fdv ? Math.round(t.fdv) : null, liquidity_usd: t.liquidity ? Math.round(t.liquidity) : null, volume_24h_usd: Math.round((s.buyVolume || 0) + (s.sellVolume || 0)), holders: t.holderCount ?? null, organic_score: r2(t.organicScore), verified: !!t.isVerified, created: t.createdAt || null }; };

export async function solprice(a) {
  const ids = (a.mints || a.mint || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => SYM[x.toUpperCase()] || x); if (!ids.length || ids.length > 50 || ids.some((x) => !B58.test(x))) return R(400, { error: "mints required: comma-separated mint addresses or SOL/USDC/USDT/JUP/BONK (max 50)" });
  try {
    const d = await jup("/price/v3?ids=" + ids.join(",")); const rows = ids.map((m) => { const p = d[m]; return p ? { mint: m, price_usd: p.usdPrice, change_24h_pct: r2(p.priceChange24h), liquidity_usd: p.liquidity ? Math.round(p.liquidity) : null, decimals: p.decimals, block: p.blockId } : { mint: m, price_usd: null, error: "no price" }; });
    return R(200, { chain: "solana", source: "jupiter", priced: rows.filter((x) => x.price_usd != null).length, list: rows });
  } catch (e) { return bad(e); }
}

export async function soltoken(a) {
  const q = (a.token || a.q || "").trim(); if (!/^[A-Za-z0-9$._ -]{1,60}$/.test(q)) return R(400, { error: "token required: mint address, symbol or name" });
  try {
    const d = await jup("/tokens/v2/search?query=" + encodeURIComponent(q)); if (!d.length) return R(404, { error: "token not found", token: q }); const t = B58.test(q) ? d.find((x) => x.id === q) || d[0] : d[0]; const au = t.audit || {};
    const st = (s) => s && { price_change_pct: r2(s.priceChange), volume_usd: Math.round((s.buyVolume || 0) + (s.sellVolume || 0)), buys: s.numBuys, sells: s.numSells, traders: s.numTraders, net_buyers: s.numNetBuyers, holder_change_pct: r2(s.holderChange), liquidity_change_pct: r2(s.liquidityChange) };
    const flags = []; if (au.mintAuthorityDisabled === false) flags.push("mint authority enabled"); if (au.freezeAuthorityDisabled === false) flags.push("freeze authority enabled"); if (au.topHoldersPercentage > 50) flags.push("top holders own >50%"); if ((t.liquidity || 0) < 10000) flags.push("liquidity < $10k"); if (!t.isVerified) flags.push("not verified");
    return R(200, { chain: "solana", source: "jupiter", ...card(t), decimals: t.decimals, token_program: t.tokenProgram, dev: t.dev || null, circulating_supply: t.circSupply, total_supply: t.totalSupply, organic_label: t.organicScoreLabel || null, tags: t.tags || [], first_pool: t.firstPool || null, audit: { mint_authority_disabled: au.mintAuthorityDisabled ?? null, freeze_authority_disabled: au.freezeAuthorityDisabled ?? null, top_holders_pct: r2(au.topHoldersPercentage), dev_balance_pct: au.devBalancePercentage != null ? +au.devBalancePercentage.toFixed(6) : null, dev_mints: au.devMints ?? null }, risk_flags: flags, stats_1h: st(t.stats1h), stats_24h: st(t.stats24h), other_matches: d.filter((x) => x.id !== t.id).slice(0, 5).map((x) => ({ mint: x.id, symbol: x.symbol, verified: !!x.isVerified, liquidity_usd: Math.round(x.liquidity || 0) })) });
  } catch (e) { return bad(e); }
}

export async function soltrending(a) {
  const cat = ["toptrending", "toptraded", "toporganicscore"].includes(a.by) ? a.by : "toptrending"; const iv = ["5m", "1h", "6h", "24h"].includes(a.interval) ? a.interval : "1h";
  try {
    let d = await jup(`/tokens/v2/${cat}/${iv}?limit=${n(a.limit, 25, 1, 100)}`); if (a.verified === "true") d = d.filter((x) => x.isVerified);
    return R(200, { chain: "solana", source: "jupiter", ranking: cat, interval: iv, tokens: d.length, list: d.map((t, i) => ({ rank: i + 1, ...card(t), top_holders_pct: r2(t.audit?.topHoldersPercentage), mint_authority_disabled: t.audit?.mintAuthorityDisabled ?? null })) });
  } catch (e) { return bad(e); }
}

export async function solinflation() {
  try {
    const [inf, sup, va, gov] = await Promise.all([rpc("getInflationRate"), rpc("getSupply", [{ excludeNonCirculatingAccountsList: true }], "https://api.mainnet-beta.solana.com").catch(() => rpc("getSupply", [{ excludeNonCirculatingAccountsList: true }])), rpc("getVoteAccounts"), rpc("getInflationGovernor").catch(() => ({ terminal: 0.015, taper: 0.15 }))]);
    const staked = [...va.current, ...va.delinquent].reduce((s, x) => s + x.activatedStake, 0) / 1e9, tot = sup.value.total / 1e9; const sf = staked / tot; const comm = va.current.reduce((s, x) => s + x.commission * x.activatedStake, 0) / va.current.reduce((s, x) => s + x.activatedStake, 0);
    const gross = inf.validator / sf; const net = gross * (1 - comm / 100);
    return R(200, { chain: "solana", epoch: inf.epoch, inflation_rate_pct: +(100 * inf.total).toFixed(3), terminal_inflation_pct: +(100 * gov.terminal).toFixed(2), taper_per_year_pct: +(100 * gov.taper).toFixed(1), total_supply_sol: Math.round(tot), circulating_sol: Math.round(sup.value.circulating / 1e9), staked_sol: Math.round(staked), staked_pct: +(100 * sf).toFixed(2), stake_weighted_commission_pct: +comm.toFixed(2), est_gross_staking_apr_pct: +(100 * gross).toFixed(2), est_net_staking_apr_pct: +(100 * net).toFixed(2), real_yield_vs_inflation_pct: +(100 * (net - inf.total)).toFixed(2), note: "staking APR estimates = inflation / staked share (excludes MEV/priority-fee tips)" });
  } catch (e) { return bad(e); }
}
