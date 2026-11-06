// pack43: solleaders (upcoming Solana leaders for tx routing), solversions (validator client/version mix, stake-weighted), solbalances (batch SOL balances), lnsearch (find Lightning nodes by alias)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
async function rpc(method, params) { for (const u of ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"]) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) }); const d = await r.json(); if (d.error) { if (/personal token|rate|blocked/i.test(d.error.message)) continue; const e = new Error(d.error.message); e.rpc = 1; throw e; } return d.result; } catch (e) { if (e.rpc) throw e; } } throw new Error("solana rpc unavailable"); }
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export async function solleaders(a) {
  const k = n(a.slots, 40, 4, 400);
  try {
    const tip = await rpc("getSlot", [{ commitment: "processed" }]); const [ls, nodes] = await Promise.all([rpc("getSlotLeaders", [tip, k]), rpc("getClusterNodes", []).catch(() => [])]); const nm = Object.fromEntries(nodes.map((x) => [x.pubkey, x]));
    const runs = []; ls.forEach((id, i) => { const last = runs.at(-1); if (last && last.leader === id) last.slots++; else runs.push({ start_slot: tip + i, leader: id, slots: 1, eta_ms: i * 400 }); });
    return R(200, { chain: "solana", tip_slot: tip, window_slots: k, unique_leaders: new Set(ls).size, schedule: runs.map((r) => ({ ...r, client: nm[r.leader]?.clientId || null, version: nm[r.leader]?.version || null, tpu_quic: nm[r.leader]?.tpuQuic || null })) });
  } catch (e) { return bad(e); }
}

export async function solversions() {
  try {
    const [nodes, va] = await Promise.all([rpc("getClusterNodes", []), rpc("getVoteAccounts", [])]); const stake = {}; let tot = 0; for (const v of va.current) { stake[v.nodePubkey] = +v.activatedStake; tot += +v.activatedStake; }
    const agg = (key) => { const m = {}; for (const x of nodes) { const k = key(x) || "unknown"; m[k] = m[k] || { nodes: 0, stake: 0 }; m[k].nodes++; m[k].stake += stake[x.pubkey] || 0; } return Object.entries(m).map(([k, v]) => ({ name: k, nodes: v.nodes, stake_sol: Math.round(v.stake / 1e9), stake_share_pct: r2((100 * v.stake) / tot) })).sort((x, y) => y.stake_sol - x.stake_sol); };
    const cl = agg((x) => x.clientId), ve = agg((x) => x.version);
    return R(200, { chain: "solana", gossip_nodes: nodes.length, voting_validators: va.current.length, delinquent: va.delinquent.length, total_stake_sol: Math.round(tot / 1e9), top_client: cl[0]?.name, top_client_stake_pct: cl[0]?.stake_share_pct, clients: cl, versions: ve.slice(0, 20) });
  } catch (e) { return bad(e); }
}

export async function solbalances(a) {
  const ads = String(a.addresses || "").split(",").map((s) => s.trim()).filter(Boolean); if (!ads.length || ads.length > 100 || ads.some((x) => !B58.test(x))) return R(400, { error: "addresses required: comma list of up to 100 base58 Solana addresses" });
  try {
    const [d, p] = await Promise.all([rpc("getMultipleAccounts", [ads, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]), fetch("https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112", { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({}))]); const px = p.So11111111111111111111111111111111111111112?.usdPrice || null;
    const rows = ads.map((ad, i) => { const v = d.value[i]; const sol = v ? v.lamports / 1e9 : 0; return { address: ad, exists: !!v, balance_sol: sol, balance_usd: px ? r2(sol * px) : null, owner: v?.owner || null, executable: v?.executable || false }; }); const tot = rows.reduce((s, x) => s + x.balance_sol, 0);
    return R(200, { chain: "solana", slot: d.context.slot, sol_usd: px, accounts: rows.length, total_sol: +tot.toFixed(9), total_usd: px ? r2(tot * px) : null, empty: rows.filter((x) => !x.exists).length, list: rows });
  } catch (e) { return e.rpc ? R(400, { error: e.message }) : bad(e); }
}

export async function lnsearch(a) {
  const q = String(a.q || a.query || "").trim(); if (q.length < 2 || q.length > 80 || /[<>]/.test(q)) return R(400, { error: "q required: 2-80 chars alias, pubkey prefix or channel id" });
  try {
    const r = await fetch("https://mempool.space/api/v1/lightning/search?searchText=" + encodeURIComponent(q), { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("upstream " + r.status); const d = await r.json();
    const nodes = (d.nodes || []).map((x) => ({ pubkey: x.public_key, alias: x.alias, capacity_btc: +(x.capacity / 1e8).toFixed(4), channels: x.channels, active: x.status === 1 })).sort((x, y) => y.capacity_btc - x.capacity_btc);
    return R(200, { chain: "bitcoin", layer: "lightning", query: q, nodes: nodes.length, channels: (d.channels || []).length, top: nodes[0] || null, list: nodes.slice(0, 50), channel_matches: (d.channels || []).slice(0, 20) });
  } catch (e) { return bad(e); }
}
