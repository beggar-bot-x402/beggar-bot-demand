// pack63: prottvlhist (protocol TVL daily history + drawdown), prothallmarks (protocol event timeline with TVL impact), defitvlhist (total DeFi TVL history), protcompare (side-by-side TVL momentum for 2-5 protocols)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } const t = await r.text(); try { return JSON.parse(t); } catch { const e = new Error("upstream non-json"); e.st = 404; throw e; } };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const sl = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.-]/g, "");
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const nf = (e, k, v) => (e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown " + k, [k]: v }) : bad(e));
const need = R(400, { error: "protocol required: DefiLlama slug, e.g. uniswap" });
const prot = (p) => j("https://api.llama.fi/protocol/" + p);
const pct = (a, b) => (b ? r2(((a - b) / b) * 100) : null);
const series = (h, days) => { const s = h.slice(-days); const cur = s.at(-1)?.v; const ath = h.reduce((b, x) => (x.v > b.v ? x : b), h[0]);
  return { current_tvl: r2(cur), change_pct: pct(cur, s[0]?.v), period_days: s.length, period_high: r2(Math.max(...s.map((x) => x.v))), period_low: r2(Math.min(...s.map((x) => x.v))), ath_tvl: r2(ath.v), ath_date: day(ath.t), from_ath_pct: pct(cur, ath.v), series: s.map((x) => ({ date: day(x.t), tvl: r2(x.v) })) }; };
const tvlOf = (d) => { const m = new Map(); for (const x of d.tvl || []) m.set(day(x.date), { t: x.date, v: x.totalLiquidityUSD }); return [...m.values()]; };

export async function prottvlhist(a) {
  const p = sl(a.protocol || a.slug); if (!p) return need;
  try { const d = await prot(p); const h = tvlOf(d); if (!h.length) return R(404, { error: "no tvl history", protocol: p }); return R(200, { protocol: d.name, slug: p, ...series(h, n(a.days, 90, 1, 3650)) }); } catch (e) { return nf(e, "protocol", p); }
}

export async function prothallmarks(a) {
  const p = sl(a.protocol || a.slug); if (!p) return need;
  try { const d = await prot(p); const h = tvlOf(d); const at = (t) => { let b = null; for (const x of h) { if (x.t <= t) b = x; else break; } return b?.v ?? null; };
    const l = (d.hallmarks || []).map(([t, ev]) => { const t0 = Array.isArray(t) ? t[0] : t; const b = at(t0), a7 = at(t0 + 7 * 86400), a30 = at(t0 + 30 * 86400); return { date: day(t0), event: ev, tvl_at: r2(b), tvl_7d_after: r2(a7), impact_7d_pct: pct(a7, b), impact_30d_pct: pct(a30, b) }; }).sort((x, y) => y.date.localeCompare(x.date));
    return R(200, { protocol: d.name, slug: p, events: l.length, hacks: (d.hacks || []).length, list: l }); } catch (e) { return nf(e, "protocol", p); }
}

export async function defitvlhist(a) {
  try { const h = (await j("https://api.llama.fi/v2/historicalChainTvl")).map((x) => ({ t: x.date, v: x.tvl })); return R(200, { scope: "all chains", ...series(h, n(a.days, 90, 1, 3650)) }); } catch (e) { return bad(e); }
}

export async function protcompare(a) {
  const ps = [...new Set(String(a.protocols || a.protocol || "").split(/[\s,]+/).map(sl).filter(Boolean))].slice(0, 5); if (ps.length < 2) return R(400, { error: "protocols required: 2-5 DefiLlama slugs, comma-separated" });
  try { const rs = await Promise.all(ps.map((p) => prot(p).then((d) => ({ p, d })).catch((e) => ({ p, e }))));
    const l = rs.map(({ p, d, e }) => { if (e) return { slug: p, error: e.st === 404 || (e.st >= 400 && e.st < 500) ? "unknown protocol" : "upstream" }; const h = tvlOf(d); const v = (k) => h.at(-1 - k)?.v; const cur = v(0);
      return { slug: p, protocol: d.name, category: d.category || null, chains: (d.chains || []).length || Object.keys(d.currentChainTvls || {}).filter((k) => !k.includes("-") && !["borrowed", "staking", "pool2", "vesting", "treasury"].includes(k)).length, tvl: r2(cur), change_1d_pct: pct(cur, v(1)), change_7d_pct: pct(cur, v(7)), change_30d_pct: pct(cur, v(30)), change_90d_pct: pct(cur, v(90)), change_365d_pct: pct(cur, v(365)), mcap: r2(d.mcap), mcap_tvl: d.mcap && cur ? +(d.mcap / cur).toFixed(3) : null }; });
    const ok = l.filter((x) => !x.error).sort((x, y) => (y.change_30d_pct ?? -1e9) - (x.change_30d_pct ?? -1e9));
    return R(200, { compared: l.length, leader_30d: ok[0]?.slug || null, list: l.sort((x, y) => (y.tvl || 0) - (x.tvl || 0)) }); } catch (e) { return bad(e); }
}
