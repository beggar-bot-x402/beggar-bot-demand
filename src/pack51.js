// pack51: optionsnotional (options notional volume ranking), perpaggs (perp aggregator volume ranking), perpoi (open interest by protocol w/ 7d/30d change), solstakerewards (SOL staking inflation rewards per address for an epoch)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { ...o, signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const pct = (a, b) => (b ? r2((100 * (a - b)) / b) : null);
const ov = (k, q = "") => j("https://api.llama.fi/overview/" + k + "?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true" + q);
const filt = (l, a) => { const ch = a.chain ? String(a.chain).toLowerCase() : null; return l.filter((p) => !ch || (p.chains || []).some((c) => c.toLowerCase() === ch)); };

async function rank(kind, q, a, label) {
  const d = await ov(kind, q); const k = { "7d": "total7d", "30d": "total30d" }[a.period] || "total24h";
  const l = filt(d.protocols || [], a).filter((p) => (p[k] || 0) > 0).sort((x, y) => y[k] - x[k]); const tot = l.reduce((s, p) => s + p[k], 0);
  return { source: "defillama", metric: label, period: k === "total24h" ? "24h" : a.period, chain: a.chain || null, protocols: l.length, total_usd: Math.round(tot),
    list: l.slice(0, n(a.limit, 25, 1, 500)).map((p) => ({ name: p.name, slug: p.slug, category: p.category, chains: p.chains, usd: Math.round(p[k]), share_pct: r2((100 * p[k]) / tot), usd_24h: Math.round(p.total24h || 0), usd_7d: Math.round(p.total7d || 0), usd_30d: Math.round(p.total30d || 0), change_7d_pct: r2(p.change_7d) })) };
}
export async function optionsnotional(a) { try { return R(200, await rank("options", "&dataType=dailyNotionalVolume", a, "options_notional_volume")); } catch (e) { return bad(e); } }
export async function perpaggs(a) { try { return R(200, await rank("aggregator-derivatives", "", a, "perp_aggregator_volume")); } catch (e) { return bad(e); } }

export async function perpoi(a) {
  try { const d = await ov("open-interest"); const l = filt(d.protocols || [], a).filter((p) => (p.total24h || 0) > 0 && (!a.category || String(p.category).toLowerCase() === String(a.category).toLowerCase())).sort((x, y) => y.total24h - x.total24h); const tot = l.reduce((s, p) => s + p.total24h, 0);
    const o = a.order === "growth" ? l.filter((p) => p.total7DaysAgo > 1e6).sort((x, y) => pct(y.total24h, y.total7DaysAgo) - pct(x.total24h, x.total7DaysAgo)) : l;
    return R(200, { source: "defillama", metric: "open_interest", chain: a.chain || null, order: a.order === "growth" ? "growth" : "size", protocols: l.length, total_oi_usd: Math.round(tot), total_7d_ago_usd: Math.round(l.reduce((s, p) => s + (p.total7DaysAgo || 0), 0)),
      list: o.slice(0, n(a.limit, 25, 1, 300)).map((p) => ({ name: p.name, slug: p.slug, category: p.category, chains: p.chains, oi_usd: Math.round(p.total24h), share_pct: r2((100 * p.total24h) / tot), change_1d_pct: pct(p.total24h, p.total48hto24h), change_7d_pct: pct(p.total24h, p.total7DaysAgo), change_30d_pct: pct(p.total24h, p.total30DaysAgo) })) }); } catch (e) { return bad(e); }
}

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export async function solstakerewards(a) {
  const ad = String(a.addresses || a.address || "").split(/[\s,]+/).filter(Boolean).slice(0, 20); if (!ad.length || !ad.every((x) => B58.test(x))) return R(400, { error: "address(es) required: base58 stake or vote account(s), comma-separated, max 20" });
  try { const p = [ad]; if (a.epoch) p.push({ epoch: n(a.epoch, 0, 0, 1e7) });
    const d = await j("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getInflationReward", params: p }) }); if (d.error) return R(400, { error: d.error.message });
    const l = d.result.map((x, i) => (x ? { address: ad[i], epoch: x.epoch, reward_sol: x.amount / 1e9, post_balance_sol: x.postBalance / 1e9, epoch_yield_pct: x.postBalance > x.amount ? +((100 * x.amount) / (x.postBalance - x.amount)).toFixed(4) : null, apy_est_pct: x.postBalance > x.amount && x.amount / (x.postBalance - x.amount) < 0.01 ? r2((Math.pow(1 + x.amount / (x.postBalance - x.amount), 365 / 2.1) - 1) * 100) : null, commission: x.commission, effective_slot: x.effectiveSlot } : { address: ad[i], reward_sol: null, note: "no reward (inactive, not a stake/vote account, or epoch too old)" }));
    return R(200, { chain: "solana", epoch: l.find((x) => x.epoch)?.epoch ?? a.epoch ?? null, total_reward_sol: +l.reduce((s, x) => s + (x.reward_sol || 0), 0).toFixed(9), list: l }); } catch (e) { return bad(e); }
}
