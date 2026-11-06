// pack52: mcaptvl (protocol mcap/TVL ratio ranking), categorymcap (mcap & TVL by category), multichain (protocols by chain footprint), solblock (Solana block summary by slot)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { ...o, signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const pct = (a, b) => (b ? r2((100 * (a - b)) / b) : null);
const protos = async () => (await j("https://api.llama.fi/lite/protocols2")).protocols || [];
const lc = (x) => String(x || "").toLowerCase();

export async function mcaptvl(a) {
  try { const min = +a.min_tvl || 10e6; let l = (await protos()).filter((p) => p.mcap > 0 && p.tvl >= min && (!a.category || lc(p.category) === lc(a.category)) && (!a.chain || (p.chains || []).some((c) => lc(c) === lc(a.chain))));
    l = l.map((p) => ({ name: p.name, symbol: p.symbol, category: p.category, chains: (p.chains || []).slice(0, 8), mcap_usd: Math.round(p.mcap), tvl_usd: Math.round(p.tvl), mcap_tvl: +(p.mcap / p.tvl).toFixed(3), tvl_change_7d_pct: pct(p.tvl, p.tvlPrevWeek) })).sort((x, y) => (a.order === "high" ? y.mcap_tvl - x.mcap_tvl : x.mcap_tvl - y.mcap_tvl));
    const m = l.map((x) => x.mcap_tvl).sort((x, y) => x - y);
    return R(200, { source: "defillama", order: a.order === "high" ? "highest" : "lowest (cheapest vs TVL)", min_tvl: min, eligible: l.length, median_mcap_tvl: m.length ? m[m.length >> 1] : null, list: l.slice(0, n(a.limit, 25, 1, 500)) }); } catch (e) { return bad(e); }
}

export async function categorymcap(a) {
  try { const g = {}; for (const p of await protos()) { if (!p.category || !(p.tvl > 0)) continue; const c = (g[p.category] ||= { category: p.category, protocols: 0, tvl: 0, tvl_week: 0, tvl_month: 0, mcap: 0, tvl_with_token: 0 }); c.protocols++; c.tvl += p.tvl; c.tvl_week += p.tvlPrevWeek || 0; c.tvl_month += p.tvlPrevMonth || 0; if (p.mcap > 0) { c.mcap += p.mcap; c.tvl_with_token += p.tvl; } }
    const tot = Object.values(g).reduce((s, c) => s + c.tvl, 0);
    const l = Object.values(g).map((c) => ({ category: c.category, protocols: c.protocols, tvl_usd: Math.round(c.tvl), tvl_share_pct: r2((100 * c.tvl) / tot), tvl_change_7d_pct: pct(c.tvl, c.tvl_week), tvl_change_30d_pct: pct(c.tvl, c.tvl_month), token_mcap_usd: Math.round(c.mcap), mcap_tvl: c.tvl_with_token ? +(c.mcap / c.tvl_with_token).toFixed(3) : null }));
    const k = { mcap: "token_mcap_usd", growth: "tvl_change_7d_pct", ratio: "mcap_tvl" }[a.sort] || "tvl_usd"; l.sort((x, y) => (y[k] ?? -1e18) - (x[k] ?? -1e18));
    return R(200, { source: "defillama", sort: k, categories: l.length, total_tvl_usd: Math.round(tot), list: l.slice(0, n(a.limit, 50, 1, 200)) }); } catch (e) { return bad(e); }
}

export async function multichain(a) {
  try { const min = +a.min_tvl || 1e6; const l = (await protos()).filter((p) => p.tvl >= min && (!a.category || lc(p.category) === lc(a.category))).map((p) => ({ name: p.name, symbol: p.symbol, category: p.category, chain_count: (p.chains || []).length, chains: p.chains, tvl_usd: Math.round(p.tvl) })).sort((x, y) => y.chain_count - x.chain_count || y.tvl_usd - x.tvl_usd);
    const freq = {}; l.forEach((p) => (p.chains || []).forEach((c) => (freq[c] = (freq[c] || 0) + 1)));
    return R(200, { source: "defillama", min_tvl: min, eligible: l.length, single_chain: l.filter((p) => p.chain_count === 1).length, avg_chains: r2(l.reduce((s, p) => s + p.chain_count, 0) / (l.length || 1)), top_chains_by_protocol_count: Object.entries(freq).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([chain, protocols]) => ({ chain, protocols })), list: l.slice(0, n(a.limit, 25, 1, 300)) }); } catch (e) { return bad(e); }
}

export async function solblock(a) {
  try { const rpc = async (m, p) => { const d = await j("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (d.error) { const e = new Error(d.error.message); e.rpc = true; throw e; } return d.result; };
    let slot = a.slot != null && a.slot !== "" ? parseInt(a.slot) : null; if (slot != null && !(slot >= 0)) return R(400, { error: "slot must be a non-negative integer" });
    if (slot == null) slot = (await rpc("getSlot", [{ commitment: "finalized" }])) - 2;
    const b = await rpc("getBlock", [slot, { transactionDetails: "signatures", rewards: true, maxSupportedTransactionVersion: 0, commitment: "finalized" }]);
    const fee = (b.rewards || []).filter((r) => r.rewardType === "Fee");
    return R(200, { chain: "solana", slot, parent_slot: b.parentSlot, block_height: b.blockHeight, block_time: b.blockTime ? new Date(b.blockTime * 1000).toISOString() : null, blockhash: b.blockhash, previous_blockhash: b.previousBlockhash, tx_count: (b.signatures || []).length, leader: fee[0]?.pubkey || null, leader_fee_reward_sol: fee.length ? fee.reduce((s, r) => s + r.lamports, 0) / 1e9 : null, reward_entries: (b.rewards || []).length, reward_partitions: b.numRewardPartitions ?? null, first_signatures: (b.signatures || []).slice(0, n(a.sigs, 5, 0, 50)) }); }
  catch (e) { return e.rpc ? R(404, { error: e.message.slice(0, 200), slot: a.slot }) : bad(e); }
}
