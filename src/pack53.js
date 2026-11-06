// pack53: btcblockaudit (block vs mempool template audit), btcauditscores (recent blocks' template match & fee delta), btcpredictions (block prediction match-rate history), btcpoolaudit (per-pool template match over recent blocks)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const M = "https://mempool.space/api";
const j = async (u) => { const r = await fetch(M + u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const t = async (u) => { const r = await fetch(M + u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.text(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const iso = (s) => new Date(s * 1000).toISOString();
async function resolve(b) { b = String(b || "").trim(); if (/^[0-9a-f]{64}$/i.test(b)) return b.toLowerCase(); if (/^\d+$/.test(b)) return (await t("/block-height/" + b)).trim(); if (!b) return (await t("/blocks/tip/hash")).trim(); return null; }

export async function btcblockaudit(a) {
  try { const h = await resolve(a.block ?? a.hash ?? a.height); if (!h) return R(400, { error: "block must be a height or 64-hex hash (default tip)" });
    const [s, b] = await Promise.all([j("/v1/block/" + h + "/audit-summary"), j("/v1/block/" + h)]); const ex = b.extras || {};
    const tl = (s.template || []).length, miss = Array.isArray(s.missingTxs) ? s.missingTxs.length : s.missingTxs, add = Array.isArray(s.addedTxs) ? s.addedTxs.length : s.addedTxs;
    return R(200, { chain: "bitcoin", height: s.height, hash: h, time: iso(s.timestamp), pool: ex.pool?.name || null, tx_count: b.tx_count, audit_entries: tl, match_rate_pct: s.matchRate, missing_txs: miss, added_txs: add, fresh_txs: s.freshTxs, prioritized_txs: s.prioritizedTxs, accelerated_txs: s.acceleratedTxs, fullrbf_txs: s.fullrbfTxs, sigop_txs: s.sigopTxs, unseen_txs: s.unseenTxs, expected_fees_btc: s.expectedFees / 1e8, actual_fees_btc: ex.totalFees != null ? ex.totalFees / 1e8 : null, fee_delta_pct: ex.totalFees != null && s.expectedFees ? r2((100 * (ex.totalFees - s.expectedFees)) / s.expectedFees) : null, expected_weight: s.expectedWeight, actual_weight: b.weight, flag: s.matchRate < 90 ? "low_match" : "normal" }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "block or audit not found" }) : bad(e); }
}

async function recent(pages, start) { let out = [], h = start; for (let i = 0; i < pages; i++) { const d = await j("/v1/blocks" + (h != null ? "/" + h : "")); if (!d.length) break; out = out.concat(d); h = d[d.length - 1].height - 1; } return out; }
const row = (b) => ({ height: b.height, hash: b.id, time: iso(b.timestamp), pool: b.extras?.pool?.name || null, tx_count: b.tx_count, match_rate_pct: b.extras?.matchRate ?? null, actual_fees_btc: (b.extras?.totalFees ?? 0) / 1e8, expected_fees_btc: b.extras?.expectedFees != null ? b.extras.expectedFees / 1e8 : null, fee_delta_pct: b.extras?.expectedFees ? r2((100 * (b.extras.totalFees - b.extras.expectedFees)) / b.extras.expectedFees) : null });

export async function btcauditscores(a) {
  try { const st = a.start_height ? n(a.start_height, 0, 0, 1e7) : null; const l = (await recent(n(a.pages, 2, 1, 6), st)).map(row); const m = l.filter((x) => x.match_rate_pct != null);
    return R(200, { chain: "bitcoin", blocks: l.length, avg_match_rate_pct: r2(m.reduce((s, x) => s + x.match_rate_pct, 0) / (m.length || 1)), low_match_blocks: m.filter((x) => x.match_rate_pct < 90).length, worst: m.reduce((w, x) => (!w || x.match_rate_pct < w.match_rate_pct ? x : w), null), list: l }); } catch (e) { return bad(e); }
}

export async function btcpredictions(a) {
  const per = ["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y", "all"].includes(a.period) ? a.period : "1w";
  try { const d = await j("/v1/mining/blocks/predictions/" + per); const l = d.map(([ts, h, r]) => ({ time: iso(ts), height: h, match_rate_pct: r })); const rs = l.map((x) => x.match_rate_pct).sort((x, y) => x - y);
    return R(200, { chain: "bitcoin", period: per, points: l.length, avg_match_rate_pct: r2(rs.reduce((s, x) => s + x, 0) / (rs.length || 1)), median_match_rate_pct: rs.length ? rs[rs.length >> 1] : null, min_match_rate_pct: rs[0] ?? null, below_90: rs.filter((x) => x < 90).length, list: l.slice(-n(a.limit, 200, 1, 5000)) }); } catch (e) { return bad(e); }
}

export async function btcpoolaudit(a) {
  try { const l = (await recent(n(a.pages, 4, 1, 8), null)).map(row).filter((x) => x.match_rate_pct != null); const g = {};
    l.forEach((x) => { const p = (g[x.pool || "unknown"] ||= { pool: x.pool || "unknown", blocks: 0, sum: 0, min: 101, low: 0, fd: 0, fdn: 0 }); p.blocks++; p.sum += x.match_rate_pct; p.min = Math.min(p.min, x.match_rate_pct); if (x.match_rate_pct < 90) p.low++; if (x.fee_delta_pct != null) { p.fd += x.fee_delta_pct; p.fdn++; } });
    const out = Object.values(g).map((p) => ({ pool: p.pool, blocks: p.blocks, avg_match_rate_pct: r2(p.sum / p.blocks), min_match_rate_pct: p.min, low_match_blocks: p.low, avg_fee_delta_pct: p.fdn ? r2(p.fd / p.fdn) : null })).sort((x, y) => x.avg_match_rate_pct - y.avg_match_rate_pct);
    return R(200, { chain: "bitcoin", blocks: l.length, from_height: l[l.length - 1]?.height, to_height: l[0]?.height, pools: out.length, note: "lower match rate = block deviates more from mempool.space's projected template (filtering, out-of-band or fresh txs)", list: out }); } catch (e) { return bad(e); }
}
