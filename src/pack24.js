// pack24: hlledger (deposits/withdrawals/transfers), hlpnl (equity curve, drawdown), hltwap (TWAP slice fills), hloi (open interest board)
const R = (status, body) => ({ status, body });
const err = (e) => /hyperliquid (422|500)/.test(String(e.message)) ? R(404, { error: "unknown address on hyperliquid" }) : R(502, { error: String(e.message || e).slice(0, 200) });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
async function hl(body) { const r = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("hyperliquid " + r.status); return r.json(); }
const iso = (t) => new Date(t).toISOString();

export async function hlledger(a) {
  if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(), days = n(a.days, 90, 1, 365); const L = await hl({ type: "userNonFundingLedgerUpdates", user, startTime: Date.now() - days * 864e5 });
    const by = {}; let inflow = 0, outflow = 0; const cps = {};
    const rows = L.map((x) => { const d = x.delta || {}; let usd = +(d.usdc ?? d.usdcValue ?? d.netWithdrawnUsd ?? d.amount ?? d.usd ?? 0); let dir = 0;
      if (d.type === "deposit" || d.type === "vaultWithdraw" && (d.user || "").toLowerCase() === user) dir = 1; else if (d.type === "withdraw" || d.type === "vaultDeposit" && (d.user || "").toLowerCase() === user) dir = -1;
      else if (/send|transfer/i.test(d.type)) { const dest = (d.destination || "").toLowerCase(); dir = dest === user ? 1 : (d.user || "").toLowerCase() === user ? -1 : 0; const cp = dir > 0 ? d.user : dest; if (cp) cps[cp] = (cps[cp] || 0) + usd * dir; }
      if (d.type === "vaultWithdraw" && (d.vault || "").toLowerCase() === user) dir = -1; if (d.type === "vaultDeposit" && (d.vault || "").toLowerCase() === user) dir = 1;
      if (dir > 0) inflow += usd; if (dir < 0) outflow += usd; const b = (by[d.type] = by[d.type] || { count: 0, usd: 0 }); b.count++; b.usd += usd;
      return { time: iso(x.time), type: d.type, usd: +usd.toFixed(2), direction: dir > 0 ? "in" : dir < 0 ? "out" : "internal", token: d.token || "USDC", counterparty: d.destination || ((d.vault || "").toLowerCase() === user ? d.user : d.vault) || d.user || null, fee: d.fee != null ? +d.fee : null, hash: x.hash }; });
    return R(200, { venue: "hyperliquid", address: user, days, events: rows.length, inflow_usd: +inflow.toFixed(2), outflow_usd: +outflow.toFixed(2), net_flow_usd: +(inflow - outflow).toFixed(2),
      by_type: Object.entries(by).map(([type, b]) => ({ type, count: b.count, usd: +b.usd.toFixed(2) })).sort((p, q) => q.usd - p.usd),
      top_counterparties: Object.entries(cps).sort((p, q) => Math.abs(q[1]) - Math.abs(p[1])).slice(0, 10).map(([address, u]) => ({ address, net_usd: +u.toFixed(2) })), recent: rows.reverse().slice(0, n(a.limit, 25, 0, 200)) });
  } catch (e) { return err(e); }
}

export async function hlpnl(a) {
  if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(); const P = Object.fromEntries(await hl({ type: "portfolio", user })); const out = {};
    for (const k of ["day", "week", "month", "allTime", "perpDay", "perpWeek", "perpMonth", "perpAllTime"]) { const p = P[k]; if (!p) continue; const av = (p.accountValueHistory || []).map((x) => +x[1]), pn = (p.pnlHistory || []).map((x) => +x[1]); if (!av.length) continue;
      let peak = -Infinity, mdd = 0, pk = -Infinity, mddUsd = 0; for (const v of pn) { pk = Math.max(pk, v); mddUsd = Math.max(mddUsd, pk - v); } for (const v of av) { peak = Math.max(peak, v); if (peak > 0) mdd = Math.max(mdd, (peak - v) / peak); }
      const pnl = pn.length ? pn[pn.length - 1] - pn[0] : 0; const base = av[0] || av.find((v) => v > 0) || 0;
      out[k] = { pnl_usd: Math.round(pnl), return_pct_approx: base ? +((100 * pnl) / base).toFixed(2) : null, account_value_end: Math.round(av[av.length - 1]), account_value_peak: Math.round(Math.max(...av)), max_drawdown_pct: +(100 * mdd).toFixed(2), max_pnl_drawdown_usd: Math.round(mddUsd), volume_usd: p.vlm ? Math.round(+p.vlm) : null, points: av.length }; }
    if (!Object.keys(out).length || !out.allTime?.account_value_peak && !out.allTime?.volume_usd) return R(404, { error: "no portfolio history", address: user });
    const at = out.allTime || {}; const grade = !at.pnl_usd && !at.volume_usd ? "flat / inactive" : at.pnl_usd > 0 && at.max_drawdown_pct < 30 ? "profitable, controlled drawdown" : at.pnl_usd > 0 ? "profitable, volatile" : "net losing";
    return R(200, { venue: "hyperliquid", address: user, summary: grade, periods: out });
  } catch (e) { return err(e); }
}

export async function hltwap(a) {
  if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const user = a.address.toLowerCase(); const F = await hl({ type: "userTwapSliceFills", user }); const tw = {};
    for (const x of F) { const f = x.fill || x; const id = x.twapId ?? f.twapId ?? "?"; const t = (tw[id] = tw[id] || { twap_id: id, coin: f.coin, side: f.side === "B" ? "buy" : "sell", slices: 0, size: 0, usd: 0, first: f.time, last: f.time, fees: 0, pnl: 0 }); t.slices++; t.size += +f.sz; t.usd += +f.px * +f.sz; t.fees += +f.fee; t.pnl += +f.closedPnl; t.first = Math.min(t.first, f.time); t.last = Math.max(t.last, f.time); }
    const list = Object.values(tw).sort((p, q) => q.last - p.last).map((t) => ({ ...t, avg_px: t.size ? +(t.usd / t.size).toPrecision(8) : null, usd: Math.round(t.usd), size: +t.size.toPrecision(10), fees: +t.fees.toFixed(2), pnl: +t.pnl.toFixed(2), duration_min: +((t.last - t.first) / 6e4).toFixed(1), first: iso(t.first), last: iso(t.last) }));
    return R(200, { venue: "hyperliquid", address: user, slice_fills: F.length, twaps: list.length, twap_volume_usd: list.reduce((s, t) => s + t.usd, 0), net_buy_usd: list.reduce((s, t) => s + (t.side === "buy" ? t.usd : -t.usd), 0), uses_twap: list.length > 0, orders: list.slice(0, n(a.limit, 20, 1, 100)) });
  } catch (e) { return err(e); }
}

export async function hloi(a) {
  try {
    const [meta, ctx] = await hl({ type: "metaAndAssetCtxs" }); const rows = meta.universe.map((u, i) => ({ u, c: ctx[i] })).filter((x) => x.c && !x.u.isDelisted).map(({ u, c }) => { const px = +c.markPx; const oi = +c.openInterest * px; const prev = +c.prevDayPx; return { coin: u.name, oi_usd: Math.round(oi), volume_24h_usd: Math.round(+c.dayNtlVlm), oi_turnover: oi ? +(+c.dayNtlVlm / oi).toFixed(2) : null, mark_px: px, change_24h_pct: prev ? +((100 * (px - prev)) / prev).toFixed(2) : null, funding_apr_pct: +(+c.funding * 24 * 365 * 100).toFixed(2), premium_bps: c.premium != null ? +(+c.premium * 1e4).toFixed(1) : null, max_leverage: u.maxLeverage, at_oi_cap: false }; });
    const tot = rows.reduce((s, r) => s + r.oi_usd, 0); const sort = { volume: "volume_24h_usd", funding: "funding_apr_pct", turnover: "oi_turnover" }[a.sort] || "oi_usd";
    let caps = []; try { caps = await hl({ type: "perpsAtOpenInterestCap" }); } catch {} const capSet = new Set(caps || []); rows.forEach((r) => (r.at_oi_cap = capSet.has(r.coin)));
    const out = rows.filter((r) => !a.coin || r.coin.toUpperCase() === a.coin.toUpperCase()); if (!out.length) return R(404, { error: "unknown coin", coin: a.coin });
    out.sort((p, q) => Math.abs(q[sort] || 0) - Math.abs(p[sort] || 0));
    return R(200, { venue: "hyperliquid", markets: rows.length, total_oi_usd: tot, total_volume_24h_usd: rows.reduce((s, r) => s + r.volume_24h_usd, 0), sorted_by: sort, at_oi_cap: [...capSet], markets_list: out.slice(0, n(a.limit, 25, 1, 300)).map((r) => ({ ...r, oi_share_pct: +((100 * r.oi_usd) / (tot || 1)).toFixed(2) })) });
  } catch (e) { return err(e); }
}
