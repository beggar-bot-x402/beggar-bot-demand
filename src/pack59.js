// pack59: juplend (Jupiter Lend earn vault rates/TVL), juplendpos (wallet Jupiter Lend positions), juplst (Solana LST tokens via Jupiter tag), jupdexlabels (Jupiter-routed DEX/AMM program labels)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const J = "https://lite-api.jup.ag";
const j = async (u) => { const r = await fetch(J + u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const vault = (x) => { const dec = x.asset?.decimals ?? x.decimals ?? 6, px = +x.asset?.price || null, ta = +x.totalAssets / 10 ** dec, wd = +(x.liquiditySupplyData?.withdrawable || 0) / 10 ** dec;
  return { vault: x.address, symbol: x.symbol, asset: x.asset?.symbol, asset_mint: x.assetAddress, asset_price_usd: px, total_assets: r2(ta), tvl_usd: px ? r2(ta * px) : null, supply_apr_pct: +x.supplyRate / 100, rewards_apr_pct: +x.rewardsRate / 100, total_apr_pct: +x.totalRate / 100, share_price: +x.convertToAssets / 10 ** dec, withdrawable_now: r2(wd), withdrawable_pct: ta ? r2((wd / ta) * 100) : null }; };

export async function juplend(a) {
  try { const l = (await j("/lend/v1/earn/tokens")).map(vault).sort((x, y) => (y.tvl_usd || 0) - (x.tvl_usd || 0));
    return R(200, { chain: "solana", source: "jupiter lend earn", vaults: l.length, total_tvl_usd: r2(l.reduce((s, x) => s + (x.tvl_usd || 0), 0)), best_apr: l.reduce((b, x) => (!b || x.total_apr_pct > b.total_apr_pct ? x : b), null)?.symbol, list: l }); } catch (e) { return bad(e); }
}

export async function juplendpos(a) {
  const w = String(a.wallet || a.user || ""); if (!B58.test(w)) return R(400, { error: "wallet required: base58 Solana address" });
  try { const d = await j("/lend/v1/earn/positions?users=" + w); const l = d.map((p) => { const v = vault(p.token), dec = p.token.asset?.decimals ?? 6, bal = +p.underlyingBalance / 10 ** dec, sup = +p.underlyingAssets / 10 ** dec;
      return { vault: v.vault, symbol: v.symbol, asset: v.asset, shares: +p.shares / 10 ** dec, underlying: r2(sup), value_usd: v.asset_price_usd ? r2(sup * v.asset_price_usd) : null, wallet_asset_balance: r2(bal), total_apr_pct: v.total_apr_pct }; }).filter((x) => x.shares > 0 || x.wallet_asset_balance > 0 || a.include_zero === "true");
    return R(200, { chain: "solana", source: "jupiter lend earn", wallet: w, positions: l.filter((x) => x.shares > 0).length, deposited_usd: r2(l.reduce((s, x) => s + (x.value_usd || 0), 0)), list: l }); } catch (e) { return bad(e); }
}

export async function juplst(a) {
  try { const d = await j("/tokens/v2/tag?query=lst"); const l = d.map((t) => ({ mint: t.id, symbol: t.symbol, name: t.name, price_usd: t.usdPrice ?? null, liquidity_usd: r2(t.liquidity), mcap_usd: r2(t.mcap), holders: t.holderCount ?? null, verified: !!t.isVerified, organic_score: t.organicScore ?? null, change_24h_pct: r2(t.stats24h?.priceChange) })).sort((x, y) => (y.mcap_usd || 0) - (x.mcap_usd || 0));
    const sol = l.find((x) => x.mint.startsWith("So1111"))?.price_usd; l.forEach((x) => (x.sol_ratio = sol && x.price_usd ? +(x.price_usd / sol).toFixed(5) : null));
    return R(200, { chain: "solana", source: "jupiter tokens tag=lst", count: l.length, list: l.slice(0, n(a.limit, 100, 1, 1000)) }); } catch (e) { return bad(e); }
}

export async function jupdexlabels(a) {
  const q = String(a.q || a.query || "").toLowerCase();
  try { const d = await j("/swap/v1/program-id-to-label"); let l = Object.entries(d).map(([program, label]) => ({ program, label })); if (q) l = l.filter((x) => x.label.toLowerCase().includes(q) || x.program === a.q);
    l.sort((x, y) => x.label.localeCompare(y.label)); return R(200, { chain: "solana", source: "jupiter swap router", total: l.length, query: q || null, list: l.slice(0, n(a.limit, 500, 1, 2000)) }); } catch (e) { return bad(e); }
}
