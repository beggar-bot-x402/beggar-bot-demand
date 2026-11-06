// pack57: lngeo (a Lightning node's peer geography & distances), lnfeatures (node feature bits, sockets/Tor reach, channel churn), btcrewardhist (avg block reward history BTC+USD), solstakeparams (Solana staking/epoch parameters)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { ...o, signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const LN = "https://mempool.space/api/v1/lightning";
const PK = (a) => { const pk = String(a.pubkey || a.node || "").toLowerCase(); return /^0[23][0-9a-f]{64}$/.test(pk) ? pk : null; };
const hav = (lo1, la1, lo2, la2) => { const t = Math.PI / 180, dl = (la2 - la1) * t, dn = (lo2 - lo1) * t, x = Math.sin(dl / 2) ** 2 + Math.cos(la1 * t) * Math.cos(la2 * t) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };

export async function lngeo(a) {
  const pk = PK(a); if (!pk) return R(400, { error: "pubkey required: 66-hex lightning node public key" });
  try { const d = await j(LN + "/channels-geo/" + pk); if (!Array.isArray(d) || !d.length) return R(404, { error: "no geolocated channels", pubkey: pk });
    const seen = new Map(); d.forEach(([p1, a1, lo1, la1, p2, a2, lo2, la2]) => { const me = p1 === pk; const peer = me ? { pubkey: p2, alias: a2, lon: lo2, lat: la2 } : { pubkey: p1, alias: a1, lon: lo1, lat: la1 }; const self = me ? [lo1, la1] : [lo2, la2]; if (!seen.has(peer.pubkey)) seen.set(peer.pubkey, { ...peer, channels: 0, km: Math.round(hav(self[0], self[1], peer.lon, peer.lat)), self }); seen.get(peer.pubkey).channels++; });
    const l = [...seen.values()].sort((x, y) => x.km - y.km); const ks = l.map((x) => x.km); const self = l[0].self;
    return R(200, { network: "lightning", pubkey: pk, location: { lon: self[0], lat: self[1] }, geolocated_channels: d.length, peers: l.length, distance_km: { min: ks[0], median: ks[ks.length >> 1], mean: Math.round(ks.reduce((s, x) => s + x, 0) / ks.length), max: ks[ks.length - 1] }, within_1000km: ks.filter((x) => x <= 1000).length, intercontinental_5000km: ks.filter((x) => x > 5000).length, nearest: l.slice(0, 5).map(({ self, ...x }) => x), farthest: l.slice(-5).reverse().map(({ self, ...x }) => x) }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "node not found", pubkey: pk }) : bad(e); }
}

export async function lnfeatures(a) {
  const pk = PK(a); if (!pk) return R(400, { error: "pubkey required: 66-hex lightning node public key" });
  try { const d = await j(LN + "/nodes/" + pk); const so = String(d.sockets || "").split(",").filter(Boolean); const kind = (s) => (/\.onion/.test(s) ? "tor" : /^\[|::/.test(s) ? "ipv6" : /^\d+\.\d+\.\d+\.\d+/.test(s) ? "ipv4" : "dns");
    const f = d.features || []; const op = d.opened_channel_count || 0, cl = d.closed_channel_count || 0;
    return R(200, { network: "lightning", pubkey: pk, alias: d.alias, first_seen: d.first_seen ? new Date(d.first_seen * 1000).toISOString() : null, updated_at: d.updated_at ? new Date(d.updated_at * 1000).toISOString() : null, sockets: so.map((s) => ({ address: s, type: kind(s) })), reachability: { clearnet: so.some((s) => kind(s) !== "tor"), tor: so.some((s) => kind(s) === "tor"), hybrid: so.some((s) => kind(s) === "tor") && so.some((s) => kind(s) !== "tor") }, as: d.as_number ? { number: d.as_number, org: d.as_organization } : null, country: d.country?.en || null, features_bits: d.featuresBits, features: f.map((x) => ({ bit: x.bit, name: x.name, required: x.is_required, known: x.is_known })), supports: { anchors: f.some((x) => /anchor/.test(x.name || "")), taproot: f.some((x) => /taproot/.test(x.name || "")), route_blinding: f.some((x) => /route-blinding/.test(x.name || "")), dual_fund: f.some((x) => /dual-fund/.test(x.name || "")), splicing: f.some((x) => /splic/.test(x.name || "")), keysend: f.some((x) => /keysend/.test(x.name || "")) }, channels: { active: d.active_channel_count, opened_total: op, closed_total: cl, churn_ratio: op ? r2(cl / op) : null }, capacity_btc: d.capacity != null ? r2(d.capacity / 1e8) : null }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "node not found", pubkey: pk }) : bad(e); }
}

export async function btcrewardhist(a) {
  const per = ["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y", "all"].includes(a.period) ? a.period : "1m";
  try { const d = await j("https://mempool.space/api/v1/mining/blocks/rewards/" + per); const l = d.map((x) => ({ date: new Date(x.timestamp * 1000).toISOString().slice(0, 10), height: x.avgHeight, avg_reward_btc: +(x.avgRewards / 1e8).toFixed(6), btc_usd: x.USD, avg_reward_usd: x.USD ? Math.round((x.avgRewards / 1e8) * x.USD) : null }));
    const f = l[0], z = l[l.length - 1];
    return R(200, { chain: "bitcoin", period: per, points: l.length, latest: z, first: f, reward_btc_change_pct: f ? r2((100 * (z.avg_reward_btc - f.avg_reward_btc)) / f.avg_reward_btc) : null, reward_usd_change_pct: f?.avg_reward_usd ? r2((100 * (z.avg_reward_usd - f.avg_reward_usd)) / f.avg_reward_usd) : null, fee_share_latest_pct: z ? r2((100 * Math.max(0, z.avg_reward_btc - 3.125)) / z.avg_reward_btc) : null, list: l.slice(-n(a.limit, 120, 1, 5000)) }); } catch (e) { return bad(e); }
}

export async function solstakeparams(a) {
  try { const rpc = async (m, p = []) => { const d = await j("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (d.error) throw new Error(d.error.message); return d.result; };
    const [md, es, ep, ig, ir, rent] = await Promise.all([rpc("getStakeMinimumDelegation"), rpc("getEpochSchedule"), rpc("getEpochInfo"), rpc("getInflationGovernor"), rpc("getInflationRate"), rpc("getMinimumBalanceForRentExemption", [200])]);
    const left = ep.slotsInEpoch - ep.slotIndex;
    return R(200, { chain: "solana", min_delegation_sol: (md.value ?? md) / 1e9, stake_account_rent_sol: rent / 1e9, min_new_stake_sol: +(((md.value ?? md) + rent) / 1e9).toFixed(9), epoch: ep.epoch, slots_per_epoch: es.slotsPerEpoch, leader_schedule_slot_offset: es.leaderScheduleSlotOffset, warmup: es.warmup, epoch_progress_pct: r2((100 * ep.slotIndex) / ep.slotsInEpoch), slots_remaining: left, epoch_ends_in_hours_est: r2((left * 0.4) / 3600), inflation: { current_total_pct: r2(ir.total * 100), validator_pct: r2(ir.validator * 100), initial_pct: r2(ig.initial * 100), terminal_pct: r2(ig.terminal * 100), taper_pct: r2(ig.taper * 100), foundation_pct: r2(ig.foundation * 100) } }); } catch (e) { return bad(e); }
}
