// pack65: protdexvol (one DEX's volume 24h/7d/30d/1y + chain and sub-protocol breakdown), protoptionsvol (one options protocol premium + notional volume), stablecoindetail (one stablecoin: supply, chain split, 7d/30d growth, peg mechanism), stabledepegs (all stablecoins currently off peg by DefiLlama prices)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } const t = await r.text(); try { return JSON.parse(t); } catch { const e = new Error("upstream non-json"); e.st = 404; throw e; } };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const sl = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.-]/g, "");
const pct = (a, b) => (a != null && b ? r2(((a - b) / b) * 100) : null);
const nf = (e, k, v) => (e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown " + k, [k]: v }) : bad(e));
const X = "excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
const sum = (d) => ({ total_24h: r2(d.total24h), total_prev_24h: r2(d.total48hto24h), change_1d_pct: pct(d.total24h, d.total48hto24h), total_7d: r2(d.total7d), total_30d: r2(d.total30d), total_1y: r2(d.total1y), total_all_time: r2(d.totalAllTime) });
const chains = (cb, lim) => Object.entries(cb || {}).map(([c, v]) => { let t = 0, t7 = 0, t30 = 0; const add = (o) => { if (o && typeof o.total24h === "number") { t += o.total24h; t7 += o.total7d || 0; t30 += o.total30d || 0; } else if (o && typeof o === "object") for (const x of Object.values(o)) if (x && typeof x === "object") add(x); }; add(v); return { chain: c, total_24h: r2(t), total_7d: r2(t7), total_30d: r2(t30) }; }).filter((x) => x.total_30d > 0).sort((a, b) => b.total_30d - a.total_30d).slice(0, lim);

export async function protdexvol(a) {
  const p = sl(a.protocol || a.dex); if (!p) return R(400, { error: "protocol required: DefiLlama DEX slug, e.g. uniswap" });
  try { const d = await j(`https://api.llama.fi/summary/dexs/${p}?${X}`); const tot = d.total30d || 0;
    const ch = chains(d.chainBreakdown, n(a.limit, 15, 1, 60)).map((x) => ({ ...x, share_30d_pct: tot ? r2((x.total_30d / tot) * 100) : null }));
    return R(200, { protocol: d.displayName || d.name, slug: p, symbol: d.symbol || null, ...sum(d), chains_count: (d.chains || []).length, top_chains: ch, versions: (d.childProtocols || []).map((c) => c.displayName || c.name) }); } catch (e) { return nf(e, "protocol", p); }
}

export async function protoptionsvol(a) {
  const p = sl(a.protocol); if (!p) return R(400, { error: "protocol required: DefiLlama options slug, e.g. derive" });
  try { const [pr, no] = await Promise.all([j(`https://api.llama.fi/summary/options/${p}?dataType=dailyPremiumVolume&${X}`), j(`https://api.llama.fi/summary/options/${p}?dataType=dailyNotionalVolume&${X}`).catch(() => null)]);
    const pm = sum(pr), nt = no ? sum(no) : null;
    return R(200, { protocol: pr.displayName || pr.name, slug: p, chains: pr.chains || [], premium: pm, notional: nt, premium_to_notional_30d_pct: nt && nt.total_30d ? r2((pm.total_30d / nt.total_30d) * 100) : null }); } catch (e) { return nf(e, "protocol", p); }
}

let LIST = null;
const findStable = async (q) => { q = String(q || "").trim(); if (/^\d+$/.test(q)) return q; if (!LIST) LIST = (await j("https://stablecoins.llama.fi/stablecoins")).peggedAssets; const l = q.toLowerCase();
  const m = LIST.filter((s) => s.symbol?.toLowerCase() === l || s.name?.toLowerCase() === l || s.gecko_id === l).sort((a, b) => (Object.values(b.circulating || {})[0] || 0) - (Object.values(a.circulating || {})[0] || 0)); return m[0]?.id || null; };
const cv = (o) => (o && typeof o === "object" ? Object.values(o).reduce((s, x) => s + (+x || 0), 0) : +o || 0);

export async function stablecoindetail(a) {
  const q = a.stablecoin || a.symbol || a.id; if (!q) return R(400, { error: "stablecoin required: symbol (USDC), name or DefiLlama id" });
  try { const id = await findStable(q); if (!id) return R(404, { error: "unknown stablecoin", stablecoin: q }); const d = await j("https://stablecoins.llama.fi/stablecoin/" + id);
    const t = d.tokens || []; const at = (k) => cv(t.at(-1 - k)?.circulating); const cur = at(0);
    const ch = Object.entries(d.currentChainBalances || {}).map(([c, v]) => ({ chain: c, circulating: r2(cv(v.circulating ?? v)) })).filter((x) => x.circulating > 0).sort((x, y) => y.circulating - x.circulating);
    return R(200, { id: d.id, name: d.name, symbol: d.symbol, peg_type: d.pegType, peg_mechanism: d.pegMechanism, price: d.price, peg_deviation_pct: d.price && d.pegType === "peggedUSD" ? r2((d.price - 1) * 100) : null, circulating: r2(cur), change_1d_pct: pct(cur, at(1)), change_7d_pct: pct(cur, at(7)), change_30d_pct: pct(cur, at(30)), change_365d_pct: pct(cur, at(365)), chains_count: ch.length, top_chains: ch.slice(0, n(a.limit, 15, 1, 100)).map((x) => ({ ...x, share_pct: cur ? r2((x.circulating / cur) * 100) : null })), gecko_id: d.gecko_id || null, mint_redeem: d.mintRedeemDescription || null, url: d.url || null });
  } catch (e) { return nf(e, "stablecoin", q); }
}

export async function stabledepegs(a) {
  const th = n(a.threshold_pct, 1, 0.05, 50), minc = n(a.min_circulating, 1e6, 0, 1e12);
  try { const d = await j("https://stablecoins.llama.fi/stablecoins?includePrices=true"); const l = d.peggedAssets.filter((s) => s.pegType === "peggedUSD" && typeof s.price === "number" && cv(s.circulating) >= minc).map((s) => ({ symbol: s.symbol, name: s.name, id: s.id, price: +s.price.toFixed(5), deviation_pct: r2((s.price - 1) * 100), circulating: r2(cv(s.circulating)), mechanism: s.pegMechanism }));
    const off = l.filter((x) => Math.abs(x.deviation_pct) >= th).sort((x, y) => Math.abs(y.deviation_pct) - Math.abs(x.deviation_pct));
    return R(200, { threshold_pct: th, min_circulating: minc, usd_stables_checked: l.length, off_peg: off.length, off_peg_supply: r2(off.reduce((s, x) => s + x.circulating, 0)), list: off.slice(0, n(a.limit, 50, 1, 300)) }); } catch (e) { return bad(e); }
}
