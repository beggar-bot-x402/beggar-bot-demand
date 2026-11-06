// pack62: prottokens (protocol TVL token composition), protchaintvl (protocol TVL by chain incl. borrowed/staking/pool2 + change), protraises (protocol funding rounds + investors), chaintvlhist (chain TVL daily history)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } const t = await r.text(); try { return JSON.parse(t); } catch { const e = new Error("upstream non-json"); e.st = 404; throw e; } };
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const slug = (a) => String(a.protocol || a.slug || "").toLowerCase().replace(/[^a-z0-9.-]/g, "");
const day = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const nf = (e, k, v) => (e.st >= 400 && e.st < 500 && e.st !== 429 ? R(404, { error: "unknown " + k, [k]: v }) : bad(e));
const need = R(400, { error: "protocol required: DefiLlama slug, e.g. aave" });
const prot = (p) => j("https://api.llama.fi/protocol/" + p);

export async function prottokens(a) {
  const p = slug(a); if (!p) return need;
  try { const d = await prot(p); const last = (d.tokensInUsd || []).at(-1); if (!last) return R(200, { protocol: d.name, slug: p, note: "no token breakdown", list: [] });
    const prev = (d.tokensInUsd || []).at(-8)?.tokens || {}; const tot = Object.values(last.tokens).reduce((s, v) => s + v, 0);
    const l = Object.entries(last.tokens).map(([t, v]) => ({ token: t, usd: r2(v), share_pct: tot ? r2((v / tot) * 100) : null, change_7d_pct: prev[t] ? r2(((v - prev[t]) / prev[t]) * 100) : null })).sort((x, y) => y.usd - x.usd);
    return R(200, { protocol: d.name, slug: p, as_of: day(last.date), total_usd: r2(tot), tokens: l.length, top3_share_pct: r2(l.slice(0, 3).reduce((s, x) => s + (x.share_pct || 0), 0)), list: l.slice(0, n(a.limit, 50, 1, 500)) }); } catch (e) { return nf(e, "protocol", p); }
}

export async function protchaintvl(a) {
  const p = slug(a); if (!p) return need;
  try { const d = await prot(p); const c = {};
    for (const [k, v] of Object.entries(d.currentChainTvls || {})) { const [ch, kind] = k.split("-"); const o = (c[ch] ||= { chain: ch, tvl: 0, borrowed: 0, staking: 0, pool2: 0, vesting: 0 }); if (!kind) o.tvl = v; else if (kind in o) o[kind] = v; }
    const l = Object.values(c).filter((x) => !["borrowed", "staking", "pool2", "treasury", "vesting", "offers", "doublecounted", "liquidstaking"].includes(x.chain.toLowerCase())).map((x) => { const h = d.chainTvls?.[x.chain]?.tvl || []; const w = h.at(-8)?.totalLiquidityUSD, m = h.at(-31)?.totalLiquidityUSD;
      return { chain: x.chain, tvl: r2(x.tvl), borrowed: r2(x.borrowed), staking: r2(x.staking), pool2: r2(x.pool2), change_7d_pct: w ? r2(((x.tvl - w) / w) * 100) : null, change_30d_pct: m ? r2(((x.tvl - m) / m) * 100) : null }; }).sort((x, y) => y.tvl - x.tvl);
    const tot = l.reduce((s, x) => s + x.tvl, 0); l.forEach((x) => (x.share_pct = tot ? r2((x.tvl / tot) * 100) : null));
    return R(200, { protocol: d.name, slug: p, total_tvl: r2(tot), total_borrowed: r2(l.reduce((s, x) => s + x.borrowed, 0)), chains: l.length, list: l }); } catch (e) { return nf(e, "protocol", p); }
}

export async function protraises(a) {
  const p = slug(a); if (!p) return need;
  try { const d = await prot(p); const l = (d.raises || []).map((r) => ({ date: day(r.date), round: r.round, amount_musd: r.amount ?? null, valuation_musd: r.valuation ?? null, lead_investors: r.leadInvestors || [], other_investors: r.otherInvestors || [], source: r.source || null })).sort((x, y) => y.date.localeCompare(x.date));
    const inv = {}; l.forEach((r) => [...r.lead_investors, ...r.other_investors].forEach((i) => (inv[i] = (inv[i] || 0) + 1)));
    return R(200, { protocol: d.name, slug: p, rounds: l.length, total_raised_musd: r2(l.reduce((s, x) => s + (x.amount_musd || 0), 0)), investors: Object.keys(inv).length, repeat_investors: Object.entries(inv).filter(([, c]) => c > 1).map(([i]) => i), mcap: r2(d.mcap), list: l }); } catch (e) { return nf(e, "protocol", p); }
}

export async function chaintvlhist(a) {
  const c = String(a.chain || "").replace(/[^A-Za-z0-9 .-]/g, ""); if (!c) return R(400, { error: "chain required, e.g. Ethereum" });
  const days = n(a.days, 90, 1, 3650);
  try { const h = await j("https://api.llama.fi/v2/historicalChainTvl/" + encodeURIComponent(c)); if (!Array.isArray(h) || !h.length) return R(404, { error: "unknown chain", chain: c });
    const s = h.slice(-days).map((x) => ({ date: day(x.date), tvl: r2(x.tvl) })); const cur = s.at(-1)?.tvl, first = s[0]?.tvl; const ath = h.reduce((b, x) => (x.tvl > b.tvl ? x : b), h[0]);
    return R(200, { chain: c, current_tvl: cur, change_pct: first ? r2(((cur - first) / first) * 100) : null, period_days: s.length, period_high: Math.max(...s.map((x) => x.tvl)), period_low: Math.min(...s.map((x) => x.tvl)), ath_tvl: r2(ath.tvl), ath_date: day(ath.date), from_ath_pct: ath.tvl ? r2(((cur - ath.tvl) / ath.tvl) * 100) : null, series: s }); } catch (e) { return nf(e, "chain", c); }
}
