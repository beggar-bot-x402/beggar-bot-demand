// pack11: blobfee, stablepeg, dexvolume, chainfees — keyless public data
const R = (status, body) => ({ status, body });
const gj = async (u) => { const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]; };
const CHAINS = { base: "base", ethereum: "ethereum", arbitrum: "arbitrum", optimism: "optimism", polygon: "polygon", solana: "solana", bsc: "bsc", avalanche: "avalanche" };

export async function blobfee(a) {
  const n = Math.max(10, Math.min(1024, parseInt(a.blocks || "100", 10) || 100));
  try {
    let h = null; for (const u of ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"]) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_feeHistory", params: ["0x" + n.toString(16), "latest", [50]] }), signal: AbortSignal.timeout(10000) }); const j = await r.json(); if (j.result) { h = j.result; break; } } catch {} }
    if (!h) return R(502, { error: "public rpc unavailable" }); const bf = (h.baseFeePerBlobGas || []).map((x) => parseInt(x, 16) / 1e9); const used = h.blobGasUsedRatio || [];
    if (!bf.length) return R(502, { error: "no blob data" });
    const cur = bf[bf.length - 1], first = bf[0]; const avgUse = used.reduce((s, x) => s + x, 0) / (used.length || 1);
    const half = Math.floor(bf.length / 2); const m1 = bf.slice(0, half).reduce((s, x) => s + x, 0) / half, m2 = bf.slice(half).reduce((s, x) => s + x, 0) / (bf.length - half);
    return R(200, { chain: "ethereum", blocks: used.length, oldest_block: parseInt(h.oldestBlock, 16), blob_base_fee_gwei: { current: cur, min: Math.min(...bf), p50: pct(bf, 50), p90: pct(bf, 90), max: Math.max(...bf) },
      change_pct: first ? +((cur / first - 1) * 100).toFixed(2) : null, trend: m2 > m1 * 1.1 ? "rising" : m2 < m1 * 0.9 ? "falling" : "flat",
      avg_blob_utilization: +avgUse.toFixed(4), full_blocks: used.filter((x) => x >= 0.99).length, cost_per_blob_eth: +(cur * 131072 / 1e9).toFixed(9),
      advice: avgUse > 0.66 ? "blob space congested; fees compounding upward" : "blob space below target; fees at/near floor" });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}

export async function stablepeg(a) {
  const want = (a.symbols || "").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean); const th = parseFloat(a.threshold || "0.005") || 0.005;
  try {
    const d = await gj("https://stablecoins.llama.fi/stablecoins?includePrices=true");
    let rows = d.peggedAssets.filter((p) => p.pegType === "peggedUSD" && typeof p.price === "number").map((p) => { const c = p.circulating?.peggedUSD || 0, pd = p.circulatingPrevDay?.peggedUSD || 0, pw = p.circulatingPrevWeek?.peggedUSD || 0;
      return { symbol: p.symbol, name: p.name, mechanism: p.pegMechanism, price: p.price, deviation_pct: +((p.price - 1) * 100).toFixed(3), depegged: Math.abs(p.price - 1) > th, circulating_usd: Math.round(c), supply_change_1d_pct: pd ? +((c / pd - 1) * 100).toFixed(2) : null, supply_change_7d_pct: pw ? +((c / pw - 1) * 100).toFixed(2) : null }; });
    if (want.length) rows = rows.filter((r) => want.includes(r.symbol.toUpperCase())); else rows = rows.filter((r) => r.circulating_usd > 1e7);
    rows.sort((x, y) => y.circulating_usd - x.circulating_usd);
    return R(200, { threshold: th, count: rows.length, depegged: rows.filter((r) => r.depegged).map((r) => r.symbol), stablecoins: rows.slice(0, Math.min(100, parseInt(a.limit || "40", 10) || 40)) });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}

async function overview(kind, a) {
  const c = String(a.chain || "base").toLowerCase(); if (!CHAINS[c]) return R(400, { error: "chain must be one of " + Object.keys(CHAINS).join(",") });
  try {
    const d = await gj(`https://api.llama.fi/overview/${kind}/${CHAINS[c]}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true${kind === "fees" ? "&dataType=dailyFees" : ""}`);
    const ps = (d.protocols || []).filter((p) => p.total24h > 0 && (!d.total24h || p.total24h <= d.total24h)).sort((x, y) => y.total24h - x.total24h).slice(0, Math.min(50, parseInt(a.limit || "20", 10) || 20))
      .map((p) => ({ name: p.displayName || p.name, category: p.category, usd_24h: Math.round(p.total24h), usd_7d: Math.round(p.total7d || 0), change_1d_pct: p.change_1d ?? null, share_pct: d.total24h ? +((p.total24h / d.total24h) * 100).toFixed(2) : null }));
    return R(200, { chain: c, total_24h_usd: Math.round(d.total24h || 0), total_7d_usd: Math.round(d.total7d || 0), change_1d_pct: d.change_1d ?? null, protocols: ps });
  } catch (e) { return R(502, { error: String(e.message || e) }); }
}
export const dexvolume = (a) => overview("dexs", a);
export const chainfees = (a) => overview("fees", a);
