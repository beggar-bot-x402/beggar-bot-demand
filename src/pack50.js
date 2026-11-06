// pack50: supplysiderev (DefiLlama supply-side revenue ranking), optionspremium (options premium volume ranking), lnnodehist (one LN node's capacity/channel history), solsupply (SOL total/circulating supply)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { ...o, signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);

async function rank(kind, dt, a) {
  const d = await j("https://api.llama.fi/overview/" + kind + "?dataType=" + dt + "&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true");
  const ch = a.chain ? String(a.chain).toLowerCase() : null; const cat = a.category ? String(a.category).toLowerCase() : null;
  const k = { "24h": "total24h", "7d": "total7d", "30d": "total30d" }[a.period] || "total24h";
  let l = (d.protocols || []).filter((p) => (p[k] || 0) > 0 && (!ch || (p.chains || []).some((c) => c.toLowerCase() === ch)) && (!cat || String(p.category || "").toLowerCase() === cat));
  l.sort((x, y) => y[k] - x[k]); const tot = l.reduce((s, p) => s + p[k], 0);
  return { source: "defillama", data_type: dt, period: a.period in { "7d": 1, "30d": 1 } ? a.period : "24h", chain: ch, category: cat, protocols: l.length, total_usd: Math.round(tot),
    list: l.slice(0, n(a.limit, 25, 1, 500)).map((p) => ({ name: p.name, slug: p.slug, category: p.category, chains: p.chains, usd: Math.round(p[k]), share_pct: r2((100 * p[k]) / tot), usd_24h: Math.round(p.total24h || 0), usd_7d: Math.round(p.total7d || 0), usd_30d: Math.round(p.total30d || 0), change_7d_pct: r2(p.change_7d) })) };
}
export async function supplysiderev(a) { try { return R(200, await rank("fees", "dailySupplySideRevenue", a)); } catch (e) { return bad(e); } }
export async function optionspremium(a) { try { return R(200, await rank("options", "dailyPremiumVolume", a)); } catch (e) { return bad(e); } }

export async function lnnodehist(a) {
  const pk = String(a.pubkey || a.node || "").toLowerCase(); if (!/^0[23][0-9a-f]{64}$/.test(pk)) return R(400, { error: "pubkey required: 66-hex lightning node public key" });
  try { const d = await j("https://mempool.space/api/v1/lightning/nodes/" + pk + "/statistics"); if (!Array.isArray(d) || !d.length) return R(404, { error: "node not found or no history", pubkey: pk });
    const l = d.slice(0, n(a.days, 90, 1, 2000)).map((x) => ({ date: day(x.added), capacity_btc: r2(x.capacity / 1e8), channels: x.channels })); const z = l[0], f = l[l.length - 1];
    return R(200, { network: "lightning", pubkey: pk, points: l.length, latest: z, oldest: f, capacity_change_pct: f.capacity_btc ? r2((100 * (z.capacity_btc - f.capacity_btc)) / f.capacity_btc) : null, channel_change: z.channels - f.channels, peak_capacity: l.reduce((m, x) => (x.capacity_btc > m.capacity_btc ? x : m), l[0]), list: l }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "node not found", pubkey: pk }) : bad(e); }
}

export async function solsupply(a) {
  try { const rpc = (m, p) => j("https://api.mainnet-beta.solana.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
    const [s, inf] = await Promise.all([rpc("getSupply", [{ excludeNonCirculatingAccountsList: true }]), rpc("getInflationRate", []).catch(() => null)]); const v = s.result?.value; if (!v) throw new Error("rpc error");
    const sol = (x) => r2(x / 1e9);
    return R(200, { chain: "solana", slot: s.result.context.slot, total_sol: sol(v.total), circulating_sol: sol(v.circulating), non_circulating_sol: sol(v.nonCirculating), circulating_pct: r2((100 * v.circulating) / v.total), inflation: inf?.result ? { total_pct: r2(inf.result.total * 100), validator_pct: r2(inf.result.validator * 100), foundation_pct: r2(inf.result.foundation * 100), epoch: inf.result.epoch } : null }); } catch (e) { return bad(e); }
}
