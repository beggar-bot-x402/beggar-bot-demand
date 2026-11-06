// pack42: solskiprate (epoch leader skip rates), soltxhist (address signature history/activity), solaccount (account owner/type/rent), solblocktime (slot -> time + finality)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
async function rpc(method, params) { for (const u of ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"]) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(20000) }); const d = await r.json(); if (d.error) { if (/personal token|rate/i.test(d.error.message)) continue; const e = new Error(d.error.message); e.rpc = 1; throw e; } return d.result; } catch (e) { if (e.rpc) throw e; } } throw new Error("solana rpc unavailable"); }
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const OWN = { "11111111111111111111111111111111": "system (wallet)", TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "spl-token", TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "token-2022", "BPFLoaderUpgradeab1e11111111111111111111111": "upgradeable loader (program)", Stake11111111111111111111111111111111111111: "stake", Vote111111111111111111111111111111111111111: "vote", ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "associated token" };

export async function solskiprate(a) {
  try {
    const d = await rpc("getBlockProduction", []); const by = d.value.byIdentity; let L = 0, P = 0; const rows = Object.entries(by).map(([id, [l, p]]) => { L += l; P += p; return { identity: id, leader_slots: l, produced: p, skipped: l - p, skip_rate_pct: l ? r2((100 * (l - p)) / l) : 0 }; });
    const minS = n(a.min_slots, 40, 1, 1e6); const big = rows.filter((x) => x.leader_slots >= minS); big.sort((x, y) => y.skip_rate_pct - x.skip_rate_pct);
    return R(200, { chain: "solana", slot_range: d.value.range, leaders: rows.length, leader_slots: L, produced: P, skip_rate_pct: r2((100 * (L - P)) / L), leaders_over_5pct: big.filter((x) => x.skip_rate_pct > 5).length, worst: big.slice(0, n(a.limit, 20, 1, 100)), best_large: [...big].sort((x, y) => y.leader_slots - x.leader_slots).slice(0, 10) });
  } catch (e) { return bad(e); }
}

export async function soltxhist(a) {
  const ad = (a.address || "").trim(); if (!B58.test(ad)) return R(400, { error: "address required: base58 Solana address" });
  try {
    const s = await rpc("getSignaturesForAddress", [ad, { limit: n(a.limit, 100, 1, 1000) }]); const t = s.map((x) => x.blockTime).filter(Boolean); const err = s.filter((x) => x.err).length; const span = t.length > 1 ? t[0] - t.at(-1) : 0;
    return R(200, { chain: "solana", address: ad, signatures: s.length, failed: err, fail_rate_pct: s.length ? r2((100 * err) / s.length) : null, latest_time: t[0] ? new Date(t[0] * 1000).toISOString() : null, oldest_in_page: t.length ? new Date(t.at(-1) * 1000).toISOString() : null, idle_minutes: t[0] ? Math.round((Date.now() / 1000 - t[0]) / 60) : null, tx_per_hour: span ? r2((3600 * s.length) / span) : null, with_memo: s.filter((x) => x.memo).length, list: s.slice(0, 25).map((x) => ({ signature: x.signature, slot: x.slot, time: x.blockTime ? new Date(x.blockTime * 1000).toISOString() : null, ok: !x.err, memo: x.memo })) });
  } catch (e) { return e.rpc ? R(400, { error: e.message }) : bad(e); }
}

export async function solaccount(a) {
  const ad = (a.address || "").trim(); if (!B58.test(ad)) return R(400, { error: "address required: base58 Solana address" });
  try {
    const d = await rpc("getAccountInfo", [ad, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }]); const v = d.value; if (!v) return R(200, { chain: "solana", address: ad, exists: false, note: "no account (unfunded or closed)" });
    const rent = await rpc("getMinimumBalanceForRentExemption", [v.space]);
    return R(200, { chain: "solana", address: ad, exists: true, owner: v.owner, owner_label: OWN[v.owner] || "program-owned", kind: v.executable ? "program" : OWN[v.owner] === "system (wallet)" ? "wallet" : "data account", executable: v.executable, balance_sol: v.lamports / 1e9, data_bytes: v.space, rent_exempt_min_sol: rent / 1e9, rent_exempt: v.lamports >= rent, slot: d.context.slot });
  } catch (e) { return e.rpc ? R(400, { error: e.message }) : bad(e); }
}

export async function solblocktime(a) {
  try {
    const tip = await rpc("getSlot", [{ commitment: "confirmed" }]); const fin = await rpc("getSlot", [{ commitment: "finalized" }]); const s = a.slot ? parseInt(a.slot) : tip; if (!(s >= 0) || s > tip + 1000) return R(400, { error: "slot must be a non-negative integer not far beyond tip", tip });
    let t = null; try { t = await rpc("getBlockTime", [s]); } catch (e) { if (!e.rpc) throw e; }
    return R(200, { chain: "solana", slot: s, block_time: t, block_iso: t ? new Date(t * 1000).toISOString() : null, skipped_or_unavailable: t == null, tip_slot: tip, finalized_slot: fin, finalized: s <= fin, slots_behind_tip: tip - s, est_age_sec: r2((tip - s) * 0.4) });
  } catch (e) { return bad(e); }
}
