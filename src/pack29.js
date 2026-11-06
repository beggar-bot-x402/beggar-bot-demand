// pack29: stablechains (stablecoin supply by chain), stableflows (stablecoin supply changes), chaindexvol (DEX volume by chain), hlvalidators (Hyperliquid validator set)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
async function j(u, opt) { const r = await fetch(u, { ...opt, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const pct = (a, b) => (b ? +((100 * (a - b)) / b).toFixed(2) : null);

export async function stablechains(a) {
  try {
    const d = await j("https://stablecoins.llama.fi/stablecoinchains"); let rows = d.map((c) => ({ chain: c.name, stablecoin_supply_usd: Math.round(c.totalCirculatingUSD?.peggedUSD || 0), other_pegs_usd: Math.round(Object.entries(c.totalCirculatingUSD || {}).filter(([k]) => k !== "peggedUSD").reduce((s, [, v]) => s + v, 0)) })).filter((x) => x.stablecoin_supply_usd > 0);
    const tot = rows.reduce((s, x) => s + x.stablecoin_supply_usd, 0); rows.sort((p, q) => q.stablecoin_supply_usd - p.stablecoin_supply_usd); rows.forEach((x, i) => { x.rank = i + 1; x.share_pct = +((100 * x.stablecoin_supply_usd) / tot).toFixed(3); });
    if (a.chain) { const c = rows.find((x) => x.chain.toLowerCase() === a.chain.toLowerCase()); if (!c) return R(404, { error: "unknown chain", chain: a.chain }); return R(200, { source: "defillama", total_usd: tot, ...c }); }
    return R(200, { source: "defillama", chains: rows.length, total_usd: tot, list: rows.slice(0, n(a.limit, 50, 1, 300)) });
  } catch (e) { return bad(e); }
}

export async function stableflows(a) {
  try {
    const d = await j("https://stablecoins.llama.fi/stablecoins?includePrices=true"); const win = { "1d": "circulatingPrevDay", "7d": "circulatingPrevWeek", "30d": "circulatingPrevMonth" }; const w = win[a.window] ? a.window : "7d";
    const ch = a.chain ? a.chain.toLowerCase() : null; const rows = [];
    for (const s of d.peggedAssets) { const peg = s.pegType; let cur, prev; if (ch) { const k = Object.keys(s.chainCirculating || {}).find((x) => x.toLowerCase() === ch); if (!k) continue; const c = s.chainCirculating[k]; cur = c.current?.[peg]; prev = c[win[w]]?.[peg]; } else { cur = s.circulating?.[peg]; prev = s[win[w]]?.[peg]; }
      if (!cur || cur < 1e6 || !prev) continue; const px = s.price ?? 1; rows.push({ symbol: s.symbol, name: s.name, peg: peg, mechanism: s.pegMechanism, price: px, supply: Math.round(cur), net_flow: Math.round(cur - (prev || 0)), net_flow_usd: Math.round((cur - (prev || 0)) * (peg === "peggedUSD" ? 1 : px || 1)), change_pct: pct(cur, prev) }); }
    if (ch && !rows.length) return R(404, { error: "no stablecoins found on chain", chain: a.chain });
    const net = rows.reduce((s, x) => s + x.net_flow_usd, 0); const by = [...rows].sort((p, q) => q.net_flow_usd - p.net_flow_usd); const L = n(a.limit, 10, 1, 50);
    return R(200, { source: "defillama", chain: a.chain || "all", window: w, stablecoins: rows.length, net_flow_usd: net, mints: by.filter((x) => x.net_flow_usd > 0).slice(0, L), burns: by.filter((x) => x.net_flow_usd < 0).reverse().slice(0, L) });
  } catch (e) { return bad(e); }
}

export async function chaindexvol(a) {
  const c = (a.chain || "").trim(); if (!/^[A-Za-z0-9 _.-]{2,30}$/.test(c)) return R(400, { error: "chain required, e.g. base, solana, ethereum, arbitrum" });
  try {
    const r = await fetch("https://api.llama.fi/overview/dexs/" + encodeURIComponent(c) + "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true", { signal: AbortSignal.timeout(20000) }); if (r.status === 400 || r.status === 404 || r.status === 500) return R(404, { error: "unknown chain", chain: c }); if (!r.ok) throw new Error("upstream " + r.status); const d = await r.json();
    const ps = (d.protocols || []).filter((p) => p.total24h > 0 && !(p.total7d > 0 && p.total24h > p.total7d)).map((p) => ({ name: p.name, category: p.category, volume_24h_usd: Math.round(p.total24h), volume_7d_usd: Math.round(p.total7d || 0), volume_30d_usd: Math.round(p.total30d || 0), change_1d_pct: p.change_1d ?? null, change_7d_pct: p.change_7d ?? null })).sort((p, q) => q.volume_24h_usd - p.volume_24h_usd);
    const t = ps.reduce((s, x) => s + x.volume_24h_usd, 0); ps.forEach((x) => (x.share_pct = t ? +((100 * x.volume_24h_usd) / t).toFixed(2) : null));
    return R(200, { source: "defillama", chain: d.chain || c, volume_24h_usd: Math.round(t), volume_7d_usd: Math.round(d.total7d || 0), volume_30d_usd: Math.round(d.total30d || 0), change_1d_pct: d.change_1d ?? null, change_7d_pct: d.change_7d ?? null, dexes: ps.length, top3_share_pct: +ps.slice(0, 3).reduce((s, x) => s + (x.share_pct || 0), 0).toFixed(2), list: ps.slice(0, n(a.limit, 25, 1, 200)) });
  } catch (e) { return bad(e); }
}

export async function hlvalidators(a) {
  try {
    const v = await j("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "validatorSummaries" }) });
    const st = (x, k) => Object.fromEntries(x.stats || [])[k] || {};
    let rows = v.map((x) => ({ validator: x.validator, signer: x.signer, name: x.name, stake_hype: +(x.stake / 1e8).toFixed(2), active: x.isActive, jailed: x.isJailed, commission_pct: +(100 * +x.commission).toFixed(2), uptime_week_pct: +(100 * +(st(x, "week").uptimeFraction || 0)).toFixed(3), predicted_apr_pct: +(100 * +(st(x, "week").predictedApr || 0)).toFixed(3), recent_blocks: x.nRecentBlocks }));
    const tot = rows.reduce((s, x) => s + x.stake_hype, 0); rows.sort((p, q) => q.stake_hype - p.stake_hype); let cum = 0, nak = 0; for (const x of rows) { x.stake_share_pct = +((100 * x.stake_hype) / tot).toFixed(3); cum += x.stake_hype; if (!nak && cum > tot / 3) nak = rows.indexOf(x) + 1; }
    if (a.validator) { const q = a.validator.toLowerCase(); const f = rows.find((x) => x.validator === q || x.signer === q || (x.name || "").toLowerCase() === q); if (!f) return R(404, { error: "unknown validator", validator: a.validator }); return R(200, { venue: "hyperliquid", total_stake_hype: +tot.toFixed(2), rank: rows.indexOf(f) + 1, ...f }); }
    return R(200, { venue: "hyperliquid", validators: rows.length, active: rows.filter((x) => x.active).length, jailed: rows.filter((x) => x.jailed).length, total_stake_hype: +tot.toFixed(2), nakamoto_coefficient: nak, list: rows.slice(0, n(a.limit, 50, 1, 200)) });
  } catch (e) { return bad(e); }
}
