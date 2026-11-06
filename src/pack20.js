// pack20: cctpflows (Base CCTP burns), perpfunding + hlaccount (Hyperliquid), dexboosts (DexScreener)
import { keccakHex } from "./evm.js";
const R = (status, body) => ({ status, body });
const err = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const hx = (x) => "0x" + x.toString(16); const un = (t) => "0x" + t.slice(26);
const RPCS = ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"];
async function rpc(method, params) { let last; for (const u of RPCS) for (let k = 0; k < 2; k++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); if (/limit/i.test(j.error.message)) { await new Promise((z) => setTimeout(z, 800)); continue; } break; } return j.result; } catch (e) { last = e; } } throw last || new Error("rpc failed"); }
const DOMAINS = { 0: "ethereum", 1: "avalanche", 2: "optimism", 3: "arbitrum", 4: "noble", 5: "solana", 6: "base", 7: "polygon", 8: "sui", 9: "aptos", 10: "unichain", 11: "linea", 12: "codex", 13: "sonic", 14: "worldchain", 16: "sei", 17: "bnb", 18: "xdc", 19: "hyperevm", 21: "ink", 22: "plume" };
const V2 = "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d", V1 = "0x1682ae6375c4e4a97e4b583bc394c861a46d8962";
const T2 = keccakHex("DepositForBurn(address,uint256,address,bytes32,uint32,bytes32,bytes32,uint256,uint32,bytes)");
const T1 = keccakHex("DepositForBurn(uint64,address,uint256,address,bytes32,uint32,bytes32,bytes32)");
export async function cctpflows(a) {
  try {
    const hours = n(a.hours, 6, 0.1, 24); const tip = parseInt(await rpc("eth_blockNumber", []), 16); const total = Math.ceil(hours * 1800); const L = [];
    for (let to = tip, left = total; left > 0; ) { const k = Math.min(9000, left); L.push(...(await rpc("eth_getLogs", [{ address: [V1, V2], topics: [[T1, T2]], fromBlock: hx(to - k + 1), toBlock: hx(to) }]))); to -= k; left -= k; }
    const dst = {}, dep = {}; let tot = 0, fast = 0; const big = [];
    for (const l of L) { const w = l.data.slice(2).match(/.{64}/g) || []; const amt = Number(BigInt("0x" + w[0])) / 1e6; const dom = Number(BigInt("0x" + w[2])); const fin = l.topics[0] === T2 ? parseInt(l.topics[3], 16) : null;
      const name = DOMAINS[dom] || "domain-" + dom; const x = (dst[name] = dst[name] || { usdc: 0, transfers: 0 }); x.usdc += amt; x.transfers++; tot += amt; if (fin !== null && fin < 2000) fast++;
      const d = l.topics[0] === T2 ? un(l.topics[2]) : un(l.topics[3]); dep[d] = (dep[d] || 0) + amt; if (amt >= 100000) big.push({ usdc: amt, to_chain: name, depositor: d, tx: l.transactionHash, version: l.topics[0] === T2 ? "v2" : "v1" }); }
    return R(200, { source_chain: "base", hours, to_block: tip, transfers: L.length, usdc_bridged_out: +tot.toFixed(2), fast_transfer_share_pct: L.length ? +((100 * fast) / L.length).toFixed(1) : null,
      by_destination: Object.entries(dst).map(([chain, x]) => ({ chain, usdc: +x.usdc.toFixed(2), transfers: x.transfers, share_pct: +((100 * x.usdc) / (tot || 1)).toFixed(1) })).sort((p, q) => q.usdc - p.usdc),
      top_depositors: Object.entries(dep).sort((p, q) => q[1] - p[1]).slice(0, 10).map(([address, u]) => ({ address, usdc: +u.toFixed(2) })), large_transfers: big.sort((p, q) => q.usdc - p.usdc).slice(0, 15) });
  } catch (e) { return err(e); }
}

async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
export async function perpfunding(a) {
  try {
    const [meta, ctx] = await hl({ type: "metaAndAssetCtxs" }); const want = (a.coins || "").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean);
    let rows = meta.universe.map((u, i) => ({ u, c: ctx[i] })).filter(({ u, c }) => !u.isDelisted && c && c.funding != null).map(({ u, c }) => { const f = +c.funding; const mark = +c.markPx; const oi = +c.openInterest * mark;
      return { coin: u.name, funding_hourly_pct: +(f * 100).toFixed(5), funding_apr_pct: +(f * 24 * 365 * 100).toFixed(2), mark_price: mark, oracle_price: +c.oraclePx, premium_pct: c.premium != null ? +(+c.premium * 100).toFixed(4) : null, open_interest_usd: Math.round(oi), volume_24h_usd: Math.round(+c.dayNtlVlm), change_24h_pct: c.prevDayPx ? +((mark / +c.prevDayPx - 1) * 100).toFixed(2) : null, max_leverage: u.maxLeverage, bias: f > 0.0000125 ? "longs paying" : f < 0 ? "shorts paying" : "neutral" }; });
    if (want.length) { rows = rows.filter((r) => want.includes(r.coin)); if (!rows.length) return R(404, { error: "no matching coins", coins: want }); }
    const sort = a.sort || "oi"; const key = { oi: (r) => r.open_interest_usd, funding: (r) => r.funding_apr_pct, negative: (r) => -r.funding_apr_pct, volume: (r) => r.volume_24h_usd, abs: (r) => Math.abs(r.funding_apr_pct) }[sort]; if (!key) return R(400, { error: "sort must be oi|funding|negative|volume|abs" });
    rows.sort((p, q) => key(q) - key(p)); const totOi = rows.reduce((s, r) => s + r.open_interest_usd, 0);
    return R(200, { venue: "hyperliquid", markets: rows.length, total_open_interest_usd: totOi, oi_weighted_funding_apr_pct: +(rows.reduce((s, r) => s + r.funding_apr_pct * r.open_interest_usd, 0) / (totOi || 1)).toFixed(2), sort, data: rows.slice(0, n(a.limit, 25, 1, 200)) });
  } catch (e) { return err(e); }
}

export async function hlaccount(a) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(a.address || "")) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(); const [st, spot, fills] = await Promise.all([hl({ type: "clearinghouseState", user }), hl({ type: "spotClearinghouseState", user }).catch(() => null), hl({ type: "userFills", user }).catch(() => [])]);
    const ms = st.marginSummary || {}; const pos = (st.assetPositions || []).map((p) => p.position).map((p) => ({ coin: p.coin, side: +p.szi > 0 ? "long" : "short", size: +p.szi, entry_price: +p.entryPx, position_value_usd: +p.positionValue, unrealized_pnl_usd: +p.unrealizedPnl, roe_pct: +(+p.returnOnEquity * 100).toFixed(2), leverage: p.leverage?.value, leverage_type: p.leverage?.type, liquidation_price: p.liquidationPx ? +p.liquidationPx : null, margin_used_usd: +p.marginUsed }));
    const pnl = (fills || []).reduce((s, f) => s + +(f.closedPnl || 0), 0);
    return R(200, { venue: "hyperliquid", address: user, account_value_usd: +(ms.accountValue || 0), total_position_notional_usd: +(ms.totalNtlPos || 0), margin_used_usd: +(ms.totalMarginUsed || 0), withdrawable_usd: +(st.withdrawable || 0),
      effective_leverage: +ms.accountValue ? +(+ms.totalNtlPos / +ms.accountValue).toFixed(2) : 0, open_positions: pos.length, unrealized_pnl_usd: +pos.reduce((s, p) => s + p.unrealized_pnl_usd, 0).toFixed(2), positions: pos.sort((p, q) => q.position_value_usd - p.position_value_usd).slice(0, 50),
      spot_balances: (spot?.balances || []).filter((b) => +b.total > 0).slice(0, 20).map((b) => ({ coin: b.coin, total: +b.total })), recent_fills: (fills || []).slice(0, 20).map((f) => ({ coin: f.coin, side: f.side === "B" ? "buy" : "sell", px: +f.px, sz: +f.sz, dir: f.dir, closed_pnl: +f.closedPnl, time: new Date(f.time).toISOString() })), realized_pnl_recent_fills_usd: +pnl.toFixed(2), fills_counted: (fills || []).length });
  } catch (e) { return err(e); }
}

export async function dexboosts(a) {
  try {
    const kind = a.kind || "top"; const url = { top: "https://api.dexscreener.com/token-boosts/top/v1", latest: "https://api.dexscreener.com/token-boosts/latest/v1", profiles: "https://api.dexscreener.com/token-profiles/latest/v1" }[kind]; if (!url) return R(400, { error: "kind must be top|latest|profiles" });
    let rows = await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json(); if (!Array.isArray(rows)) rows = [];
    if (a.chain) rows = rows.filter((r) => r.chainId === a.chain.toLowerCase()); rows = rows.slice(0, n(a.limit, 20, 1, 30));
    const by = {}; for (const r of rows) (by[r.chainId] = by[r.chainId] || []).push(r.tokenAddress); const mk = {};
    for (const [c, addrs] of Object.entries(by)) { try { const p = await (await fetch(`https://api.dexscreener.com/tokens/v1/${c}/${addrs.slice(0, 30).join(",")}`, { signal: AbortSignal.timeout(10000) })).json(); for (const x of p || []) { const k = x.baseToken.address.toLowerCase(); if (!mk[k] || (x.liquidity?.usd || 0) > (mk[k].liquidity?.usd || 0)) mk[k] = x; } } catch {} }
    const ageH = (t) => (t ? +((Date.now() - t) / 3.6e6).toFixed(1) : null);
    return R(200, { source: "dexscreener", kind, count: rows.length, note: "boosts are paid promotion — a marketing/attention signal, not an endorsement",
      tokens: rows.map((r) => { const m = mk[r.tokenAddress.toLowerCase()]; const liq = m?.liquidity?.usd ?? null; const age = ageH(m?.pairCreatedAt);
        return { chain: r.chainId, token: r.tokenAddress, symbol: m?.baseToken?.symbol ?? null, name: m?.baseToken?.name ?? null, boost_amount: r.amount ?? null, boost_total: r.totalAmount ?? null, price_usd: m ? +m.priceUsd : null, market_cap_usd: m?.marketCap ?? m?.fdv ?? null, liquidity_usd: liq, volume_24h_usd: m?.volume?.h24 ?? null, change_24h_pct: m?.priceChange?.h24 ?? null, pair_age_hours: age, dex: m?.dexId ?? null,
          links: (r.links || []).map((l) => l.url).slice(0, 4), url: r.url, risk_flags: [liq != null && liq < 10000 ? "low-liquidity" : null, age != null && age < 24 ? "new-pair<24h" : null, !m ? "no-active-pair" : null].filter(Boolean) }; }) });
  } catch (e) { return err(e); }
}
