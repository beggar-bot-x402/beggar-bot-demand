// pack67 (Deribit public API): realizedvol (BTC/ETH realized vol vs DVOL implied: IV-RV spread), futuresbasis (dated-futures term structure: premium and annualized basis per expiry), optionsflow (recent Deribit option trades: biggest prints, call/put + buy/sell premium split), ivsmile (IV smile for one expiry: IV by strike, ATM IV, 10% OTM put-call skew)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const D = "https://www.deribit.com/api/v2/public/";
const j = async (m, q) => { const r = await fetch(D + m + "?" + new URLSearchParams(q), { signal: AbortSignal.timeout(25000) }); const d = await r.json().catch(() => null); if (!d) throw new Error("upstream " + r.status); if (d.error) throw new Error(d.error.message || "upstream error"); return d.result; };
const cur = (c) => { c = String(c || "BTC").toUpperCase(); return ["BTC", "ETH"].includes(c) ? c : null; };
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const iso = (t) => new Date(t).toISOString();
const MON = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const exp = (s) => { const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(s); return m ? Date.UTC(2000 + +m[3], MON[m[2]], +m[1], 8) : 0; };
const needC = R(400, { error: "currency must be BTC or ETH" });

export async function realizedvol(a) {
  const c = cur(a.currency); if (!c) return needC; const now = Date.now();
  try { const [hv, dv] = await Promise.all([j("get_historical_volatility", { currency: c }), j("get_volatility_index_data", { currency: c, start_timestamp: now - 3 * 36e5, end_timestamp: now, resolution: 3600 }).catch(() => null)]);
    const s = [...new Map(hv.map(([t, v]) => [t, v])).entries()].map(([t, v]) => ({ time: iso(t), rv: r2(v) })); const last = s.at(-1)?.rv; const iv = dv?.data?.at(-1)?.[4] ?? null; const vs = s.map((x) => x.rv);
    return R(200, { currency: c, realized_vol_pct: last, implied_vol_dvol_pct: iv, iv_minus_rv: iv != null && last != null ? r2(iv - last) : null, regime: iv == null ? null : iv > last * 1.15 ? "options rich vs realized" : iv < last * 0.9 ? "options cheap vs realized" : "fair", period_high: Math.max(...vs), period_low: Math.min(...vs), hours: s.length, series: s.slice(-n(a.points, 168, 1, 1000)) }); } catch (e) { return bad(e); }
}

export async function futuresbasis(a) {
  const c = cur(a.currency); if (!c) return needC;
  try { const b = await j("get_book_summary_by_currency", { currency: c, kind: "future" }); const idx = b[0]?.estimated_delivery_price; const perp = b.find((x) => x.instrument_name.endsWith("PERPETUAL"));
    const l = b.filter((x) => !x.instrument_name.endsWith("PERPETUAL") && /-\d{1,2}[A-Z]{3}\d{2}$/.test(x.instrument_name)).map((x) => { const e = x.instrument_name.split("-")[1]; const d = (exp(e) - Date.now()) / 864e5; const prem = (x.mark_price - idx) / idx; return { instrument: x.instrument_name, expiry_time: iso(exp(e)), days_to_expiry: r2(d, 1), mark_price: x.mark_price, premium_pct: r2(prem * 100, 3), annualized_basis_pct: d > 0.5 ? r2((prem * 365 / d) * 100) : null, open_interest_usd: x.open_interest, volume_24h_usd: x.volume_usd }; }).sort((p, q) => p.days_to_expiry - q.days_to_expiry);
    const an = l.filter((x) => x.annualized_basis_pct != null);
    return R(200, { currency: c, venue: "Deribit", index_price: idx, perpetual: perp ? { mark_price: perp.mark_price, premium_pct: r2(((perp.mark_price - idx) / idx) * 100, 3), open_interest_usd: perp.open_interest } : null, curve: an.length > 1 ? (an.at(-1).annualized_basis_pct > an[0].annualized_basis_pct ? "upward (contango steepening)" : "inverted/flattening") : null, avg_annualized_basis_pct: an.length ? r2(an.reduce((s, x) => s + x.annualized_basis_pct, 0) / an.length) : null, futures: l }); } catch (e) { return bad(e); }
}

export async function optionsflow(a) {
  const c = cur(a.currency); if (!c) return needC; const mn = n(a.min_usd, 0, 0, 1e9);
  try { const r = await j("get_last_trades_by_currency", { currency: c, kind: "option", count: 1000 }); const t = (r.trades || []).map((x) => { const [, e, k, ty] = x.instrument_name.split("-"); const usd = x.price * x.index_price * x.amount; return { time: iso(x.timestamp), instrument: x.instrument_name, expiry: e, strike: +k, type: ty === "C" ? "call" : "put", side: x.direction, amount: x.amount, premium_usd: r2(usd), notional_usd: r2(x.amount * x.index_price, 0), iv: x.iv, block: !!x.block_trade_id }; });
    const agg = (f) => r2(t.filter(f).reduce((s, x) => s + x.premium_usd, 0)); const big = t.filter((x) => x.premium_usd >= mn).sort((p, q) => q.premium_usd - p.premium_usd);
    return R(200, { currency: c, venue: "Deribit", trades: t.length, window_from: t.at(-1)?.time || null, window_to: t[0]?.time || null, premium_usd: agg(() => true), call_buy_premium: agg((x) => x.type === "call" && x.side === "buy"), call_sell_premium: agg((x) => x.type === "call" && x.side === "sell"), put_buy_premium: agg((x) => x.type === "put" && x.side === "buy"), put_sell_premium: agg((x) => x.type === "put" && x.side === "sell"), block_trades: t.filter((x) => x.block).length, top_trades: big.slice(0, n(a.limit, 25, 1, 200)) }); } catch (e) { return bad(e); }
}

export async function ivsmile(a) {
  const c = cur(a.currency); if (!c) return needC;
  try { const b = (await j("get_book_summary_by_currency", { currency: c, kind: "option" })).map((x) => { const [, e, k, t] = x.instrument_name.split("-"); return { e, k: +k, t, iv: x.mark_iv, oi: x.open_interest, u: x.underlying_price }; });
    const es = [...new Set(b.map((x) => x.e))].sort((p, q) => exp(p) - exp(q)); const want = a.expiry ? String(a.expiry).toUpperCase() : es.find((x) => exp(x) - Date.now() > 6 * 864e5) || es[0]; if (!es.includes(want)) return R(404, { error: "unknown expiry", expiry: a.expiry, expiries: es });
    const o = b.filter((x) => x.e === want && x.iv); const u = o[0]?.u; const ks = [...new Set(o.map((x) => x.k))].sort((p, q) => p - q);
    const sm = ks.map((k) => { const C = o.find((x) => x.k === k && x.t === "C"), P = o.find((x) => x.k === k && x.t === "P"); return { strike: k, moneyness_pct: r2(((k - u) / u) * 100), call_iv: C?.iv ?? null, put_iv: P?.iv ?? null, oi: r2((C?.oi || 0) + (P?.oi || 0)) }; });
    const near = (m, t) => { const x = sm.reduce((p, q) => (Math.abs(q.moneyness_pct - m) < Math.abs(p.moneyness_pct - m) ? q : p)); return x[t] ?? x.call_iv ?? x.put_iv; };
    const atm = near(0, "call_iv"), p10 = near(-10, "put_iv"), c10 = near(10, "call_iv");
    return R(200, { currency: c, expiry: want, expiry_time: iso(exp(want)), days_to_expiry: r2((exp(want) - Date.now()) / 864e5, 1), underlying_price: u, atm_iv: atm, put_10pct_otm_iv: p10, call_10pct_otm_iv: c10, skew_put_minus_call: p10 != null && c10 != null ? r2(p10 - c10) : null, skew_bias: p10 != null && c10 != null ? (p10 > c10 ? "downside protection bid" : "upside calls bid") : null, smile: sm, expiries: es }); } catch (e) { return bad(e); }
}
