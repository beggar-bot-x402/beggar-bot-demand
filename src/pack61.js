// pack61: jupborrow (Jupiter Lend borrow vault rates/utilization), jupborrowcap (borrow caps, withdrawable liquidity, LTV/liquidation params), soltokenbal (SPL token account balance + owner/mint), btcblockattime (Bitcoin block at a timestamp)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000), ...o }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const vaults = () => j("https://lite-api.jup.ag/lend/v1/borrow/vaults");
const amt = (v, t) => +v / 10 ** (t?.decimals ?? 6);
const usd = (v, t) => (t?.price ? r2(amt(v, t) * +t.price) : null);
const filt = (l, a) => { const q = String(a.token || a.asset || "").toUpperCase(); return q ? l.filter((v) => v.supplyToken?.symbol?.toUpperCase() === q || v.borrowToken?.symbol?.toUpperCase() === q) : l; };

export async function jupborrow(a) {
  try { const l = filt(await vaults(), a).map((v) => { const s = usd(v.totalSupply, v.supplyToken), b = usd(v.totalBorrow, v.borrowToken);
      return { vault_id: v.id, vault: v.address, pair: `${v.supplyToken?.symbol}/${v.borrowToken?.symbol}`, collateral: v.supplyToken?.symbol, debt: v.borrowToken?.symbol, collateral_usd: s, borrowed_usd: b, ltv_used_pct: s ? r2((b / s) * 100) : null, supply_apr_pct: +v.supplyRate / 100, borrow_apr_pct: +v.borrowRate / 100, borrow_fee_pct: +v.borrowFee / 100, positions: v.totalPositions }; }).sort((x, y) => (y.collateral_usd || 0) - (x.collateral_usd || 0));
    return R(200, { chain: "solana", source: "jupiter lend borrow", vaults: l.length, total_collateral_usd: r2(l.reduce((s, x) => s + (x.collateral_usd || 0), 0)), total_borrowed_usd: r2(l.reduce((s, x) => s + (x.borrowed_usd || 0), 0)), list: l.slice(0, n(a.limit, 100, 1, 500)) }); } catch (e) { return bad(e); }
}

export async function jupborrowcap(a) {
  try { const l = filt(await vaults(), a).map((v) => ({ vault_id: v.id, pair: `${v.supplyToken?.symbol}/${v.borrowToken?.symbol}`, max_ltv_pct: +v.collateralFactor / 10, liquidation_threshold_pct: +v.liquidationThreshold / 10, liquidation_max_pct: +v.liquidationMaxLimit / 10, borrowable_now: r2(amt(v.borrowable, v.borrowToken)), borrowable_now_usd: usd(v.borrowable, v.borrowToken), borrow_limit: r2(amt(v.borrowLimit, v.borrowToken)), withdrawable_collateral: r2(amt(v.withdrawable, v.supplyToken)), withdrawable_collateral_usd: usd(v.withdrawable, v.supplyToken), min_borrow: r2(amt(v.minimumBorrowing, v.borrowToken)), oracle_updated: v.oracleTimestamp ? new Date(+v.oracleTimestamp).toISOString() : null })).sort((x, y) => (y.borrowable_now_usd || 0) - (x.borrowable_now_usd || 0));
    return R(200, { chain: "solana", source: "jupiter lend borrow", vaults: l.length, total_borrowable_usd: r2(l.reduce((s, x) => s + (x.borrowable_now_usd || 0), 0)), list: l.slice(0, n(a.limit, 100, 1, 500)) }); } catch (e) { return bad(e); }
}

export async function soltokenbal(a) {
  const acct = String(a.account || a.address || ""); if (!B58.test(acct)) return R(400, { error: "account required: base58 SPL token account address" });
  try { const d = await j("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [acct, { encoding: "jsonParsed" }] }) });
    if (d.error) throw new Error(d.error.message); const v = d.result?.value; if (!v) return R(404, { error: "account not found" }); const p = v.data?.parsed;
    if (!p || p.type !== "account") return R(422, { error: "not a token account", owner_program: v.owner }); const i = p.info;
    return R(200, { chain: "solana", account: acct, slot: d.result.context?.slot, mint: i.mint, owner: i.owner, amount: i.tokenAmount?.uiAmountString, decimals: i.tokenAmount?.decimals, state: i.state, is_native: !!i.isNative, delegate: i.delegate || null, delegated_amount: i.delegatedAmount?.uiAmountString || null, close_authority: i.closeAuthority || null, program: v.data.program, extensions: (i.extensions || []).map((x) => x.extension) }); } catch (e) { return bad(e); }
}

export async function btcblockattime(a) {
  let t = a.timestamp || a.time || a.date; if (!t) return R(400, { error: "timestamp required: unix seconds or ISO date" });
  t = /^\d+$/.test(String(t)) ? +t : Math.floor(Date.parse(t) / 1000); if (!isFinite(t) || t < 1231006505 || t > Date.now() / 1000 + 600) return R(400, { error: "timestamp out of range" });
  try { const b = await j("https://mempool.space/api/v1/mining/blocks/timestamp/" + t); let d = null; try { d = await j("https://mempool.space/api/block/" + b.hash); } catch {}
    return R(200, { chain: "bitcoin", query_time: new Date(t * 1000).toISOString(), height: b.height, hash: b.hash, block_time: b.timestamp, lag_seconds: Math.round(t - Date.parse(b.timestamp) / 1000), tx_count: d?.tx_count ?? null, size: d?.size ?? null, weight: d?.weight ?? null, difficulty: d?.difficulty ?? null }); } catch (e) { return bad(e); }
}
