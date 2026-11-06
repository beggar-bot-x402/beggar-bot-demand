// pack54: lnchannel (one Lightning channel's detail & both policies), lnfees (a node's channel fee-rate distribution), solleaderslots (a validator's leader slots this epoch), soltxcount (Solana cumulative tx count, snapshot & ledger slots)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { ...o, signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const LN = "https://mempool.space/api/v1/lightning";
const rpc = async (m, p = []) => { const d = await j("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (d.error) { const e = new Error(d.error.message); e.rpc = 1; throw e; } return d.result; };
const pol = (x) => x && { alias: x.alias, pubkey: x.public_key, fee_rate_ppm: x.fee_rate, base_fee_msat: x.base_fee_mtokens, cltv_delta: x.cltv_delta, min_htlc_msat: x.min_htlc_mtokens, max_htlc_msat: x.max_htlc_mtokens, disabled: !!x.is_disabled, node_channels: x.channels, node_capacity_btc: x.capacity != null ? r2(x.capacity / 1e8) : null };

export async function lnchannel(a) {
  const id = String(a.id || a.channel || a.short_id || "").trim(); if (!/^\d{6,20}$/.test(id) && !/^\d+x\d+x\d+$/.test(id)) return R(400, { error: "id required: numeric channel id or short id (e.g. 811984x2037x0)" });
  try { let cid = id; if (id.includes("x")) { const [b, t, o] = id.split("x").map(BigInt); cid = String((b << 40n) | (t << 16n) | o); }
    const c = await j(LN + "/channels/" + cid); const st = { 0: "inactive", 1: "active", 2: "closed" }[c.status] ?? c.status;
    return R(200, { network: "lightning", id: c.id, short_id: c.short_id, status: st, capacity_btc: c.capacity / 1e8, created: c.created, updated_at: c.updated_at, age_days: c.created ? Math.floor((Date.now() - Date.parse(c.created)) / 864e5) : null, funding_txid: c.transaction_id, funding_vout: c.transaction_vout, closing_txid: c.closing_transaction_id, closing_date: c.closing_date, closing_reason: c.closing_reason, closing_fee_sat: c.closing_fee, single_funded: c.single_funded, node_left: pol(c.node_left), node_right: pol(c.node_right) }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "channel not found", id }) : bad(e); }
}

export async function lnfees(a) {
  const pk = String(a.pubkey || a.node || "").toLowerCase(); if (!/^0[23][0-9a-f]{64}$/.test(pk)) return R(400, { error: "pubkey required: 66-hex lightning node public key" });
  try { const pages = n(a.pages, 5, 1, 20); let l = [];
    for (let i = 0; i < pages; i++) { const d = await j(LN + "/channels?public_key=" + pk + "&status=open&index=" + i * 10); if (!Array.isArray(d) || !d.length) break; l = l.concat(d); if (d.length < 10) break; }
    if (!l.length) return R(404, { error: "no open channels found", pubkey: pk });
    const f = l.map((c) => c.fee_rate).filter((x) => x != null).sort((x, y) => x - y); const q = (p) => f[Math.min(f.length - 1, Math.floor(p * f.length))]; const cap = l.reduce((s, c) => s + c.capacity, 0);
    return R(200, { network: "lightning", pubkey: pk, channels_sampled: l.length, capacity_sampled_btc: r2(cap / 1e8), fee_rate_ppm: { min: f[0], p25: q(0.25), median: q(0.5), p75: q(0.75), max: f[f.length - 1], mean: r2(f.reduce((s, x) => s + x, 0) / f.length), capacity_weighted: r2(l.reduce((s, c) => s + (c.fee_rate || 0) * c.capacity, 0) / cap) }, zero_fee_channels: f.filter((x) => x === 0).length,
      list: l.slice(0, n(a.limit, 25, 1, 200)).map((c) => ({ id: c.id, short_id: c.short_id, capacity_btc: c.capacity / 1e8, fee_rate_ppm: c.fee_rate, peer_alias: c.node?.alias, peer_pubkey: c.node?.public_key })), note: "fee_rate as reported by mempool.space channel list (first pages, newest first)" }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "node not found", pubkey: pk }) : bad(e); }
}

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export async function solleaderslots(a) {
  const id = String(a.identity || a.validator || ""); if (!B58.test(id)) return R(400, { error: "identity required: base58 validator identity (node) pubkey" });
  try { const [ep, sch] = await Promise.all([rpc("getEpochInfo"), rpc("getLeaderSchedule", [null, { identity: id }])]); const first = ep.absoluteSlot - ep.slotIndex; const rel = (sch && sch[id]) || [];
    const abs = rel.map((s) => first + s), up = abs.filter((s) => s > ep.absoluteSlot), done = abs.length - up.length;
    return R(200, { chain: "solana", identity: id, epoch: ep.epoch, epoch_first_slot: first, current_slot: ep.absoluteSlot, epoch_progress_pct: r2((100 * ep.slotIndex) / ep.slotsInEpoch), leader_slots: abs.length, share_of_epoch_pct: r2((100 * abs.length) / ep.slotsInEpoch), elapsed_slots: done, upcoming_slots: up.length, next_slot: up[0] ?? null, next_slot_eta_sec: up[0] ? Math.round((up[0] - ep.absoluteSlot) * 0.4) : null, upcoming: up.slice(0, n(a.limit, 40, 0, 2000)), note: abs.length ? undefined : "not in this epoch's leader schedule (use the node identity, not the vote account)" }); }
  catch (e) { return e.rpc ? R(400, { error: e.message.slice(0, 200) }) : bad(e); }
}

export async function soltxcount(a) {
  try { const [c, snap, first, ep] = await Promise.all([rpc("getTransactionCount"), rpc("getHighestSnapshotSlot").catch(() => null), rpc("getFirstAvailableBlock").catch(() => null), rpc("getEpochInfo")]);
    return R(200, { chain: "solana", cumulative_tx_count: c, epoch: ep.epoch, current_slot: ep.absoluteSlot, block_height: ep.blockHeight, slots_in_epoch: ep.slotsInEpoch, snapshot: snap && { full_slot: snap.full, incremental_slot: snap.incremental ?? null, full_age_slots: ep.absoluteSlot - snap.full }, first_available_block: first, rpc: "api.mainnet-beta.solana.com" }); } catch (e) { return bad(e); }
}
