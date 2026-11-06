// pack22: hltrades, hlorders, hlvault (Hyperliquid) + cctpinflows (CCTP USDC mints into Base)
import { keccakHex } from "./evm.js";
const R = (status, body) => ({ status, body });
const err = (e) => /hyperliquid (422|500)/.test(String(e.message)) ? R(404, { error: "unknown coin/address on hyperliquid" }) : R(502, { error: String(e.message || e).slice(0, 200) });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
const coinOf = (a) => { const c = (a.coin || "").trim(); if (!/^[A-Za-z0-9@:\/\-]{1,24}$/.test(c)) return null; return c.includes(":") || c.startsWith("@") ? c : c.toUpperCase(); };

export async function hltrades(a) {
  const coin = coinOf(a); if (!coin) return R(400, { error: "coin required e.g. BTC" });
  try {
    const t = await hl({ type: "recentTrades", coin }); if (!Array.isArray(t) || !t.length) return R(404, { error: "no trades", coin });
    const rows = t.map((x) => ({ side: x.side === "B" ? "buy" : "sell", px: +x.px, sz: +x.sz, usd: +x.px * +x.sz, time: x.time, hash: x.hash, buyer: x.users?.[0], seller: x.users?.[1] }));
    const buy = rows.filter((r) => r.side === "buy").reduce((s, r) => s + r.usd, 0), sell = rows.filter((r) => r.side === "sell").reduce((s, r) => s + r.usd, 0); const vol = buy + sell;
    const vwap = rows.reduce((s, r) => s + r.px * r.sz, 0) / rows.reduce((s, r) => s + r.sz, 0); const span = (Math.max(...rows.map((r) => r.time)) - Math.min(...rows.map((r) => r.time))) / 1000;
    const min = n(a.min_usd, 50000, 0, 1e9);
    return R(200, { venue: "hyperliquid", coin, trades: rows.length, window_seconds: +span.toFixed(1), volume_usd: Math.round(vol), buy_usd: Math.round(buy), sell_usd: Math.round(sell), taker_buy_ratio: +(buy / (vol || 1)).toFixed(3), flow: buy > sell * 1.2 ? "aggressive buying" : sell > buy * 1.2 ? "aggressive selling" : "balanced", vwap: +vwap.toPrecision(8), last_px: rows[0].px,
      large_prints: rows.filter((r) => r.usd >= min).sort((p, q) => q.usd - p.usd).slice(0, 15).map((r) => ({ ...r, usd: Math.round(r.usd), time: new Date(r.time).toISOString() })), recent: rows.slice(0, n(a.limit, 10, 0, 50)).map((r) => ({ ...r, usd: Math.round(r.usd), time: new Date(r.time).toISOString() })) });
  } catch (e) { return err(e); }
}

export async function hlorders(a) {
  if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(); const [open, hist] = await Promise.all([hl({ type: "frontendOpenOrders", user }), hl({ type: "historicalOrders", user }).catch(() => [])]);
    const mids = await hl({ type: "allMids" }).catch(() => ({}));
    const rows = (open || []).map((o) => { const mid = +mids[o.coin] || null; return { coin: o.coin, side: o.side === "B" ? "buy" : "sell", type: o.orderType, px: +o.limitPx, trigger_px: o.isTrigger ? +o.triggerPx : null, size: +o.sz, notional_usd: Math.round(+o.limitPx * +o.sz), reduce_only: !!o.reduceOnly, tpsl: o.isPositionTpsl || false, distance_from_mid_pct: mid ? +((+o.limitPx / mid - 1) * 100).toFixed(3) : null, placed: new Date(o.timestamp).toISOString(), oid: o.oid }; });
    const st = {}; for (const h of hist || []) st[h.status] = (st[h.status] || 0) + 1;
    return R(200, { venue: "hyperliquid", address: user, open_orders: rows.length, open_notional_usd: rows.reduce((s, r) => s + r.notional_usd, 0), by_coin: Object.entries(rows.reduce((m, r) => ((m[r.coin] = (m[r.coin] || 0) + r.notional_usd), m), {})).sort((p, q) => q[1] - p[1]).slice(0, 15).map(([coin, usd]) => ({ coin, notional_usd: usd })),
      stops_and_tps: rows.filter((r) => r.trigger_px != null).length, orders: rows.sort((p, q) => q.notional_usd - p.notional_usd).slice(0, n(a.limit, 50, 1, 200)), recent_order_status_counts: st, recent_orders_counted: (hist || []).length });
  } catch (e) { return err(e); }
}

const HLP = "0xdfc24b077bc1425ad1dea75bcb6f8158e10df303";
export async function hlvault(a) {
  const v = (a.vault || HLP).toLowerCase(); if (!isAddr(v)) return R(400, { error: "vault must be a 0x address (default HLP)" });
  try {
    const d = await hl({ type: "vaultDetails", vaultAddress: v }); if (!d || !d.name) return R(404, { error: "vault not found", vault: v });
    const port = Object.fromEntries((d.portfolio || []).map(([k, x]) => [k, x])); const perf = {};
    for (const k of ["day", "week", "month", "allTime"]) { const p = port[k]; if (!p) continue; const av = p.accountValueHistory || [], pn = p.pnlHistory || []; const a0 = av.length ? +av[0][1] : 0, a1 = av.length ? +av[av.length - 1][1] : 0; const pnl = pn.length ? +pn[pn.length - 1][1] - +pn[0][1] : 0; perf[k] = { pnl_usd: Math.round(pnl), return_pct_approx: a0 ? +((100 * pnl) / a0).toFixed(3) : null, account_value_start: Math.round(a0), account_value_end: Math.round(a1), volume_usd: p.vlm ? Math.round(+p.vlm) : null }; }
    const st = await hl({ type: "clearinghouseState", user: v }).catch(() => null); const pos = (st?.assetPositions || []).map((x) => x.position).map((p) => ({ coin: p.coin, side: +p.szi > 0 ? "long" : "short", value_usd: Math.round(+p.positionValue), upnl_usd: Math.round(+p.unrealizedPnl), leverage: p.leverage?.value })).sort((p, q) => q.value_usd - p.value_usd);
    return R(200, { venue: "hyperliquid", vault: v, name: d.name, leader: d.leader, description: (d.description || "").slice(0, 400), apr_pct: d.apr != null ? +(d.apr * 100).toFixed(2) : null, leader_fraction: d.leaderFraction, leader_commission: d.leaderCommission, followers: Array.isArray(d.followers) ? d.followers.length : null, allow_deposits: d.allowDeposits, is_closed: d.isClosed,
      tvl_usd: st ? Math.round(+st.marginSummary.accountValue) : null, gross_exposure_usd: st ? Math.round(+st.marginSummary.totalNtlPos) : null, performance: perf, top_positions: pos.slice(0, 15), net_long_usd: pos.reduce((s, p) => s + (p.side === "long" ? p.value_usd : -p.value_usd), 0) });
  } catch (e) { return err(e); }
}

const RPCS = ["https://base-rpc.publicnode.com", "https://base.drpc.org", "https://mainnet.base.org"];
async function rpc(method, params) { let last; for (const u of RPCS) for (let k = 0; k < 2; k++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); if (/limit/i.test(j.error.message)) { await new Promise((z) => setTimeout(z, 800)); continue; } break; } return j.result; } catch (e) { last = e; } } throw last || new Error("rpc failed"); }
const DOMAINS = { 0: "ethereum", 1: "avalanche", 2: "optimism", 3: "arbitrum", 4: "noble", 5: "solana", 6: "base", 7: "polygon", 8: "sui", 9: "aptos", 10: "unichain", 11: "linea", 12: "codex", 13: "sonic", 14: "worldchain", 16: "sei", 17: "bnb", 18: "xdc", 19: "hyperevm", 21: "ink", 22: "plume" };
const MT1 = "0xad09780d193884d503182ad4588450c416d6f9d4", MT2 = "0x81d40f21f12a8f0e3252bccb954d722d4c464b64";
const MR1 = keccakHex("MessageReceived(address,uint32,uint64,bytes32,bytes)"), MR2 = keccakHex("MessageReceived(address,uint32,bytes32,bytes32,uint32,bytes)");
export async function cctpinflows(a) {
  try {
    const hours = n(a.hours, 6, 0.1, 24); const tip = parseInt(await rpc("eth_blockNumber", []), 16); const total = Math.ceil(hours * 1800); const L = []; const hx = (x) => "0x" + x.toString(16);
    for (let to = tip, left = total; left > 0; ) { const k = Math.min(9000, left); L.push(...(await rpc("eth_getLogs", [{ address: [MT1, MT2], topics: [[MR1, MR2]], fromBlock: hx(to - k + 1), toBlock: hx(to) }]))); to -= k; left -= k; }
    const src = {}, rec = {}; let tot = 0, fast = 0, cnt = 0; const big = [];
    for (const l of L) { const d = l.data.slice(2); const w = (i) => d.slice(i * 64, i * 64 + 64); const dom = Number(BigInt("0x" + w(0)));
      const off = parseInt(w(2), 16) * 2; const len = parseInt(d.slice(off, off + 64), 16); const body = d.slice(off + 64, off + 64 + len * 2); if (body.length < 200) continue;
      const recipient = "0x" + body.slice(8 + 64 + 24, 8 + 128); const amt = Number(BigInt("0x" + body.slice(8 + 128, 8 + 192))) / 1e6; if (!(amt > 0) || amt > 1e10) continue;
      cnt++; const v2 = l.topics[0] === MR2; if (v2 && parseInt(l.topics[3], 16) < 2000) fast++;
      const name = DOMAINS[dom] || "domain-" + dom; const x = (src[name] = src[name] || { usdc: 0, transfers: 0 }); x.usdc += amt; x.transfers++; tot += amt; rec[recipient] = (rec[recipient] || 0) + amt;
      if (amt >= 100000) big.push({ usdc: amt, from_chain: name, recipient, tx: l.transactionHash, version: v2 ? "v2" : "v1" }); }
    return R(200, { dest_chain: "base", hours, to_block: tip, transfers: cnt, usdc_bridged_in: +tot.toFixed(2), fast_transfer_share_pct: cnt ? +((100 * fast) / cnt).toFixed(1) : null,
      by_source: Object.entries(src).map(([chain, x]) => ({ chain, usdc: +x.usdc.toFixed(2), transfers: x.transfers, share_pct: +((100 * x.usdc) / (tot || 1)).toFixed(1) })).sort((p, q) => q.usdc - p.usdc),
      top_recipients: Object.entries(rec).sort((p, q) => q[1] - p[1]).slice(0, 10).map(([address, u]) => ({ address, usdc: +u.toFixed(2) })), large_transfers: big.sort((p, q) => q.usdc - p.usdc).slice(0, 15), pair_with: "/v1/cctpflows for outflows" });
  } catch (e) { return err(e); }
}
