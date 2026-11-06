// pack28: hip3dexs, hip3markets (HIP-3 builder-deployed perp dexs incl. stock/commodity perps), hlauction (deploy gas auctions), hltoken (HIP-1 spot token details)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const err = (e) => /hyperliquid (422|500)/.test(String(e.message)) ? R(404, { error: "not found on hyperliquid" }) : R(502, { error: String(e.message || e).slice(0, 200) });
async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
const mk = (u, c) => { const px = +c.markPx, prev = +c.prevDayPx; return { market: u.name, mark_px: px, change_24h_pct: prev ? +((100 * (px - prev)) / prev).toFixed(2) : null, oi_usd: Math.round(+c.openInterest * px), volume_24h_usd: Math.round(+c.dayNtlVlm), funding_apr_pct: +(+c.funding * 24 * 365 * 100).toFixed(2), max_leverage: u.maxLeverage, oracle_px: +c.oraclePx || null, delisted: !!u.isDelisted }; };

export async function hip3dexs(a) {
  try {
    const D = (await hl({ type: "perpDexs" })).filter(Boolean); const lim = n(a.limit, 20, 1, 60);
    const rows = await Promise.all(D.slice(0, lim).map(async (d) => { let m = []; try { const [meta, ctx] = await hl({ type: "metaAndAssetCtxs", dex: d.name }); m = meta.universe.map((u, i) => ctx[i] && mk(u, ctx[i])).filter((x) => x && !x.delisted); } catch {}
      const oi = m.reduce((s, x) => s + x.oi_usd, 0), vol = m.reduce((s, x) => s + x.volume_24h_usd, 0); return { dex: d.name, full_name: d.fullName, deployer: d.deployer, fee_recipient: d.feeRecipient, oracle_updater: d.oracleUpdater, markets: m.length, oi_usd: oi, volume_24h_usd: vol, oi_cap_total_usd: Math.round((d.assetToStreamingOiCap || []).reduce((s, x) => s + +x[1], 0)), top_markets: m.sort((p, q) => q.volume_24h_usd - p.volume_24h_usd).slice(0, 5).map((x) => x.market) }; }));
    rows.sort((p, q) => q.volume_24h_usd - p.volume_24h_usd);
    return R(200, { venue: "hyperliquid HIP-3", dexs: D.length, total_oi_usd: rows.reduce((s, x) => s + x.oi_usd, 0), total_volume_24h_usd: rows.reduce((s, x) => s + x.volume_24h_usd, 0), list: rows });
  } catch (e) { return err(e); }
}

export async function hip3markets(a) {
  const dex = (a.dex || "").toLowerCase(); if (!/^[a-z0-9]{1,12}$/.test(dex)) return R(400, { error: "dex required (see /v1/hip3dexs), e.g. xyz" });
  try {
    const r = await hl({ type: "metaAndAssetCtxs", dex }).catch((e) => { if (/hyperliquid (422|500)/.test(e.message)) return null; throw e; }); if (!r || !r[0]?.universe?.length) return R(404, { error: "unknown dex", dex });
    const [meta, ctx] = r; let m = meta.universe.map((u, i) => ctx[i] && mk(u, ctx[i])).filter((x) => x && !x.delisted); if (a.q) m = m.filter((x) => x.market.toLowerCase().includes(a.q.toLowerCase()));
    const key = { oi: "oi_usd", change: "change_24h_pct", funding: "funding_apr_pct" }[a.sort] || "volume_24h_usd"; m.sort((p, q) => Math.abs(q[key] || 0) - Math.abs(p[key] || 0));
    return R(200, { venue: "hyperliquid HIP-3", dex, markets: m.length, oi_usd: m.reduce((s, x) => s + x.oi_usd, 0), volume_24h_usd: m.reduce((s, x) => s + x.volume_24h_usd, 0), sorted_by: key, list: m.slice(0, n(a.limit, 50, 1, 300)) });
  } catch (e) { return err(e); }
}

export async function hlauction() {
  try {
    const [perp, spot] = await Promise.all([hl({ type: "perpDeployAuctionStatus" }), hl({ type: "spotDeployState", user: "0x0000000000000000000000000000000000000000" }).catch(() => null)]);
    const fmt = (g) => { if (!g) return null; const st = g.startTimeSeconds * 1000, end = st + g.durationSeconds * 1000, now = Date.now(); const s0 = +g.startGas, cur = g.currentGas != null ? +g.currentGas : null;
      const est = now >= st && now < end ? +(s0 * Math.max(0, 1 - (now - st) / (end - st)) + (g.endGas ? 0 : 0)).toFixed(4) : null; return { start: new Date(st).toISOString(), end: new Date(end).toISOString(), active: now >= st && now < end, progress_pct: +Math.min(100, Math.max(0, (100 * (now - st)) / (end - st))).toFixed(1), start_gas_hype: s0, current_gas_hype: cur, last_winning_gas_hype: g.endGas != null ? +g.endGas : null, est_current_price_hype: cur ?? est, seconds_to_end: Math.max(0, Math.round((end - now) / 1000)) }; };
    return R(200, { venue: "hyperliquid", note: "Dutch auctions; est_current_price_hype is a linear-decay estimate when current_gas is not reported", perp_dex_asset_auction: fmt(perp), spot_token_ticker_auction: fmt(spot?.gasAuction) });
  } catch (e) { return err(e); }
}

export async function hltoken(a) {
  const t = (a.token || "").trim(); if (!/^[A-Za-z0-9]{1,12}$/.test(t) && !/^0x[0-9a-fA-F]{32}$/.test(t)) return R(400, { error: "token required: spot symbol (e.g. HYPE, PURR) or 0x tokenId" });
  try {
    const meta = await hl({ type: "spotMeta" }); const tk = t.startsWith("0x") && t.length === 34 ? meta.tokens.find((x) => x.tokenId.toLowerCase() === t.toLowerCase()) : meta.tokens.find((x) => x.name.toUpperCase() === t.toUpperCase()); if (!tk) return R(404, { error: "unknown spot token", token: t });
    const d = await hl({ type: "tokenDetails", tokenId: tk.tokenId }); const px = +d.markPx || +d.midPx || null, prev = +d.prevDayPx; const circ = +d.circulatingSupply, tot = +d.totalSupply;
    const gb = (d.genesis?.userBalances || []).map(([u, b]) => [u, +b]).sort((p, q) => q[1] - p[1]); const gsum = gb.reduce((s, x) => s + x[1], 0);
    return R(200, { venue: "hyperliquid spot", token: d.name, token_id: tk.tokenId, index: tk.index, evm_contract: tk.evmContract?.address || null, price_usd: px, change_24h_pct: prev && px ? +((100 * (px - prev)) / prev).toFixed(2) : null, max_supply: +d.maxSupply, total_supply: tot, circulating_supply: circ, circulating_pct: tot ? +((100 * circ) / tot).toFixed(2) : null, market_cap_usd: px ? Math.round(px * circ) : null, fdv_usd: px ? Math.round(px * tot) : null,
      deployer: d.deployer || null, deploy_gas_hype: d.deployGas != null ? +d.deployGas : null, deploy_time: d.deployTime || null, seeded_usdc: d.seededUsdc != null ? +d.seededUsdc : null, non_circulating_users: (d.nonCirculatingUserBalances || []).slice(0, 10), future_emissions: d.futureEmissions != null ? +d.futureEmissions : null,
      genesis: { recipients: gb.length, total: +gsum.toFixed(2), top10_share_pct: gsum ? +((100 * gb.slice(0, 10).reduce((s, x) => s + x[1], 0)) / gsum).toFixed(2) : null, top: gb.slice(0, n(a.limit, 10, 0, 50)).map(([address, amount]) => ({ address, amount })), existing_token_airdrops: (d.genesis?.existingTokenBalances || []).length } });
  } catch (e) { return err(e); }
}
