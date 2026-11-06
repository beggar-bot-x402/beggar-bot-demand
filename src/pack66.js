// pack66 (Deribit public API): dvol (BTC/ETH implied-volatility index history), optionsoi (Deribit option open interest by expiry: calls/puts, put-call ratio, volume, ATM IV), maxpain (max-pain strike + OI by strike for one expiry), perpfundhist (Deribit perpetual funding history, annualized)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const D = "https://www.deribit.com/api/v2/public/";
const j = async (m, q) => { const r = await fetch(D + m + "?" + new URLSearchParams(q), { signal: AbortSignal.timeout(25000) }); const d = await r.json().catch(() => null); if (!d) throw new Error("upstream " + r.status); if (d.error) { const e = new Error(d.error.message || "upstream error"); e.st = 400; throw e; } return d.result; };
const cur = (c) => { c = String(c || "BTC").toUpperCase(); return ["BTC", "ETH"].includes(c) ? c : null; };
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const iso = (t) => new Date(t).toISOString();
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const exp = (s) => { const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(s); return m ? Date.UTC(2000 + +m[3], MON[m[2]], +m[1], 8) : 0; };
const parse = (x) => { const [, e, k, t] = x.instrument_name.split("-"); return { e, strike: +k, type: t, oi: x.open_interest || 0, vol: x.volume || 0, iv: x.mark_iv, u: x.underlying_price, idx: x.estimated_delivery_price }; };
const book = async (c) => (await j("get_book_summary_by_currency", { currency: c, kind: "option" })).map(parse);
const needC = R(400, { error: "currency must be BTC or ETH" });

export async function dvol(a) {
  const c = cur(a.currency); if (!c) return needC; const days = n(a.days, 30, 1, 365); const res = days <= 7 ? 3600 : 43200 > 0 && days <= 60 ? 21600 : 86400; const now = Date.now();
  try { const d = await j("get_volatility_index_data", { currency: c, start_timestamp: now - days * 864e5, end_timestamp: now, resolution: res }); const s = (d.data || []).map(([t, o, h, l, cl]) => ({ time: iso(t), open: o, high: h, low: l, close: cl }));
    if (!s.length) return R(404, { error: "no data" }); const cl = s.map((x) => x.close); const last = cl.at(-1);
    return R(200, { currency: c, index: c + " DVOL (30d implied vol, annualized %)", current: last, period_days: days, change: r2(last - cl[0]), period_high: Math.max(...s.map((x) => x.high)), period_low: Math.min(...s.map((x) => x.low)), percentile_in_period: r2((cl.filter((x) => x <= last).length / cl.length) * 100), implied_daily_move_pct: r2(last / Math.sqrt(365)), resolution_sec: res, series: s.slice(-500) }); } catch (e) { return bad(e); }
}

export async function optionsoi(a) {
  const c = cur(a.currency); if (!c) return needC;
  try { const b = await book(c); const by = new Map(); for (const x of b) { const g = by.get(x.e) || { expiry: x.e, calls_oi: 0, puts_oi: 0, calls_vol: 0, puts_vol: 0, u: x.u, idx: x.idx, atm: null }; if (x.type === "C") { g.calls_oi += x.oi; g.calls_vol += x.vol; } else { g.puts_oi += x.oi; g.puts_vol += x.vol; } if (x.iv && (!g.atm || Math.abs(x.strike - x.u) < Math.abs(g.atm.k - x.u))) g.atm = { k: x.strike, iv: x.iv }; by.set(x.e, g); }
    const spot = b[0]?.idx; const l = [...by.values()].sort((p, q) => exp(p.expiry) - exp(q.expiry)).map((g) => ({ expiry: g.expiry, expiry_time: iso(exp(g.expiry)), days_to_expiry: r2((exp(g.expiry) - Date.now()) / 864e5, 1), open_interest: r2(g.calls_oi + g.puts_oi), open_interest_usd: r2((g.calls_oi + g.puts_oi) * spot, 0), calls_oi: r2(g.calls_oi), puts_oi: r2(g.puts_oi), put_call_oi_ratio: g.calls_oi ? r2(g.puts_oi / g.calls_oi, 3) : null, volume_24h: r2(g.calls_vol + g.puts_vol), put_call_volume_ratio: g.calls_vol ? r2(g.puts_vol / g.calls_vol, 3) : null, atm_strike: g.atm?.k ?? null, atm_iv: g.atm?.iv ?? null }));
    const C = l.reduce((s, x) => s + x.calls_oi, 0), P = l.reduce((s, x) => s + x.puts_oi, 0);
    return R(200, { currency: c, venue: "Deribit", index_price: spot, instruments: b.length, total_oi: r2(C + P), total_oi_usd: r2((C + P) * spot, 0), put_call_oi_ratio: C ? r2(P / C, 3) : null, expiries: l }); } catch (e) { return bad(e); }
}

export async function maxpain(a) {
  const c = cur(a.currency); if (!c) return needC;
  try { const b = await book(c); const es = [...new Set(b.map((x) => x.e))].sort((p, q) => exp(p) - exp(q)); const e = a.expiry ? String(a.expiry).toUpperCase() : es.find((x) => exp(x) > Date.now()); if (!es.includes(e)) return R(404, { error: "unknown expiry", expiry: a.expiry, expiries: es });
    const o = b.filter((x) => x.e === e); const ks = [...new Set(o.map((x) => x.strike))].sort((p, q) => p - q);
    const pain = ks.map((k) => ({ strike: k, payout: o.reduce((s, x) => s + x.oi * (x.type === "C" ? Math.max(0, k - x.strike) : Math.max(0, x.strike - k)), 0) }));
    const mp = pain.reduce((p, q) => (q.payout < p.payout ? q : p)); const spot = o[0]?.idx; const byk = ks.map((k) => ({ strike: k, calls_oi: r2(o.filter((x) => x.strike === k && x.type === "C").reduce((s, x) => s + x.oi, 0)), puts_oi: r2(o.filter((x) => x.strike === k && x.type === "P").reduce((s, x) => s + x.oi, 0)) })).filter((x) => x.calls_oi + x.puts_oi > 0);
    const top = (t) => [...byk].sort((p, q) => q[t] - p[t]).slice(0, 5).map((x) => ({ strike: x.strike, oi: x[t] }));
    return R(200, { currency: c, expiry: e, expiry_time: iso(exp(e)), index_price: spot, max_pain_strike: mp.strike, distance_from_spot_pct: spot ? r2(((mp.strike - spot) / spot) * 100) : null, holders_payout_at_max_pain_usd: r2(mp.payout, 0), top_call_strikes: top("calls_oi"), top_put_strikes: top("puts_oi"), strikes: byk, expiries: es }); } catch (e) { return bad(e); }
}

export async function perpfundhist(a) {
  const c = cur(a.currency); if (!c) return needC; const h = n(a.hours, 168, 1, 720); const now = Date.now();
  try { const d = await j("get_funding_rate_history", { instrument_name: c + "-PERPETUAL", start_timestamp: now - h * 36e5, end_timestamp: now }); if (!d.length) return R(404, { error: "no data" });
    const s = d.map((x) => ({ time: iso(x.timestamp), rate_1h: x.interest_1h, rate_8h: x.interest_8h, index_price: x.index_price })); const sum = s.reduce((t, x) => t + (x.rate_1h || 0), 0);
    return R(200, { currency: c, instrument: c + "-PERPETUAL", venue: "Deribit", hours: s.length, latest_8h_pct: r2(s.at(-1).rate_8h * 100, 5), cumulative_pct: r2(sum * 100, 5), avg_hourly_pct: r2((sum / s.length) * 100, 6), annualized_pct: r2((sum / s.length) * 24 * 365 * 100), positive_hours: s.filter((x) => x.rate_1h > 0).length, negative_hours: s.filter((x) => x.rate_1h < 0).length, series: s }); } catch (e) { return bad(e); }
}
