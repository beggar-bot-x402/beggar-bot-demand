// packb67 (builder B, 2026-11-02): Kalshi prediction markets: market/event detail, orderbook + slippage, recent trades flow, candlesticks. $0 upstream (api.elections.kalshi.com public trade-api v2, no auth).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
import { txbuild } from "./packb24.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { const s = String(h).replace(/^0x/, ""); if (!/^([0-9a-fA-F]{2})*$/.test(s)) throw new Error("bad hex"); return Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16)); };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const be = (v) => { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
const sel = (s) => keccakHex(s).slice(0, 10);
const w = (x, i) => BigInt("0x" + ((x || "0x").slice(2 + 64 * i, 66 + 64 * i) || "0"));
const toUnits = (a, dec) => { a = String(a ?? ""); if (!/^\d+(\.\d+)?$/.test(a)) return null; const [i, f = ""] = a.split("."); if (f.length > dec) return null; return BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0"); };
const WETH = { base: "0x4200000000000000000000000000000000000006", optimism: "0x4200000000000000000000000000000000000006", ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", polygon: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" };
const pick = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, max_cost_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const f = s.slice(s.length - d).replace(/0+$/, ""); return s.slice(0, s.length - d) + (f ? "." + f : ""); };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const arr = (xs) => pad(xs.length.toString(16)) + xs.join("");
const KA = "https://api.elections.kalshi.com/trade-api/v2", N = Number;
async function k(p) { const r = await fetch(KA + p, { headers: { accept: "application/json" } }); const x = await r.json().catch(() => null); if (r.status === 404) throw Object.assign(new Error("Kalshi: not found"), { nf: 1 }); if (!r.ok) throw new Error("Kalshi " + r.status); return x; }
const TK = (s) => { const x = String(s ?? "").trim().toUpperCase(); return /^[A-Z0-9][A-Z0-9._-]{2,120}$/.test(x) ? x : null; };
const fail = (e) => (e.nf ? bad(e.message) : err(e));
const mk = (m) => ({ ticker: m.ticker, event_ticker: m.event_ticker, title: m.title, yes_label: m.yes_sub_title, status: m.status, yes_bid: N(m.yes_bid_dollars), yes_ask: N(m.yes_ask_dollars), no_bid: N(m.no_bid_dollars), no_ask: N(m.no_ask_dollars), last: N(m.last_price_dollars), implied_prob_pct: (N(m.yes_bid_dollars) + N(m.yes_ask_dollars)) / 2 * 100, volume_24h: N(m.volume_24h_fp ?? m.volume_24h ?? 0), volume: N(m.volume_fp ?? m.volume ?? 0), open_interest: N(m.open_interest_fp ?? m.open_interest ?? 0), close_time: m.close_time, result: m.result || null, strike: m.floor_strike ?? m.cap_strike ?? null });
export async function kalshimarket(q) {
  const t = TK(q.ticker), e = TK(q.event_ticker ?? q.event), s = TK(q.series_ticker ?? q.series); if (!t && !e && !s) return bad("ticker, event_ticker or series_ticker required");
  try { if (t) { const m = (await k("/markets/" + encodeURIComponent(t))).market; return ok({ venue: "Kalshi", market: { ...mk(m), rules: m.rules_primary || null }, source: "api.elections.kalshi.com" }); }
    const p = e ? `/events/${encodeURIComponent(e)}` : `/events?status=open&limit=5&with_nested_markets=true&series_ticker=${encodeURIComponent(s)}`, r = await k(p), evs = e ? [{ ...r.event, markets: (await k(`/markets?event_ticker=${encodeURIComponent(e)}&limit=200`)).markets }] : r.events || [];
    if (!evs.length) return bad("no open events"); return ok({ venue: "Kalshi", events: evs.map((v) => ({ event_ticker: v.event_ticker, title: v.title, category: v.category, mutually_exclusive: v.mutually_exclusive, markets: (v.markets || []).map(mk).sort((a, b) => b.implied_prob_pct - a.implied_prob_pct) })), source: "api.elections.kalshi.com" }); } catch (x) { return fail(x); }
}
export async function kalshibook(q) {
  const t = TK(q.ticker); if (!t) return bad("ticker required"); const n = q.contracts != null ? N(q.contracts) : 100; if (!(n > 0)) return bad("contracts must be > 0");
  try { const o = (await k(`/markets/${encodeURIComponent(t)}/orderbook`)).orderbook_fp || {}, yb = (o.yes_dollars || []).map(([p, s]) => [N(p), N(s)]).sort((a, b) => b[0] - a[0]), nb = (o.no_dollars || []).map(([p, s]) => [N(p), N(s)]).sort((a, b) => b[0] - a[0]);
    const ya = nb.map(([p, s]) => [+(1 - p).toFixed(4), s]), na = yb.map(([p, s]) => [+(1 - p).toFixed(4), s]), walk = (L) => { let c = 0, u = 0; for (const [p, s] of L) { const x = Math.min(s, n - c); c += x; u += x * p; if (c >= n) break; } return c >= n ? { avg_price: u / c, cost_usd: u, max_payout_usd: c } : { filled: c, note: "book too thin" }; };
    const bb = yb[0]?.[0] ?? null, ba = ya[0]?.[0] ?? null;
    return ok({ venue: "Kalshi", ticker: t, yes_best_bid: bb, yes_best_ask: ba, spread_cents: bb != null && ba != null ? +((ba - bb) * 100).toFixed(2) : null, implied_prob_pct: bb != null && ba != null ? (bb + ba) / 2 * 100 : null, contracts: n, buy_yes: walk(ya), buy_no: walk(na), depth: { yes_bid_contracts: yb.reduce((s, x) => s + x[1], 0), no_bid_contracts: nb.reduce((s, x) => s + x[1], 0) }, levels: { yes_bids: yb.slice(0, 10), no_bids: nb.slice(0, 10) }, note: "YES ask = 1 - best NO bid; each contract pays $1", source: "api.elections.kalshi.com" }); } catch (x) { return fail(x); }
}
export async function kalshitrades(q) {
  const t = TK(q.ticker); if (!t) return bad("ticker required");
  try { const r = (await k(`/markets/trades?ticker=${encodeURIComponent(t)}&limit=${Math.min(1000, N(q.limit) || 100)}`)).trades || [], tr = r.map((x) => ({ at: x.created_time, side: x.taker_side, yes_price: N(x.yes_price_dollars), contracts: N(x.count_fp ?? x.count) }));
    const v = (s) => tr.filter((x) => x.side === s).reduce((a, x) => a + x.contracts, 0), tot = tr.reduce((a, x) => a + x.contracts, 0), vw = tot ? tr.reduce((a, x) => a + x.contracts * x.yes_price, 0) / tot : null;
    return ok({ venue: "Kalshi", ticker: t, trades: tr.length, contracts: tot, taker_yes_contracts: v("yes"), taker_no_contracts: v("no"), yes_flow_ratio: tot ? v("yes") / tot : null, vwap_yes: vw, notional_usd: tr.reduce((a, x) => a + x.contracts * (x.side === "no" ? 1 - x.yes_price : x.yes_price), 0), last: tr[0] || null, items: tr.slice(0, 50), source: "api.elections.kalshi.com" }); } catch (x) { return fail(x); }
}
export async function kalshicandles(q) {
  const t = TK(q.ticker); if (!t) return bad("ticker required"); const iv = { "1m": 1, "1h": 60, "1d": 1440 }[String(q.interval ?? "1h")]; if (!iv) return bad("interval one of 1m,1h,1d"); const now = Math.floor(Date.now() / 1000), span = Math.min(5000, N(q.points) || 48) * iv * 60;
  try { const s = TK(q.series_ticker) || t.split("-")[0], r = (await k(`/series/${encodeURIComponent(s)}/markets/${encodeURIComponent(t)}/candlesticks?start_ts=${now - span}&end_ts=${now}&period_interval=${iv}`)).candlesticks || [];
    const c = r.map((x) => ({ t: x.end_period_ts, o: x.price?.open_dollars != null ? N(x.price.open_dollars) : null, h: x.price?.high_dollars != null ? N(x.price.high_dollars) : null, l: x.price?.low_dollars != null ? N(x.price.low_dollars) : null, c: x.price?.close_dollars != null ? N(x.price.close_dollars) : null, yes_bid: N(x.yes_bid?.close_dollars ?? 0), yes_ask: N(x.yes_ask?.close_dollars ?? 0), volume: N(x.volume_fp ?? x.volume ?? 0), open_interest: N(x.open_interest_fp ?? x.open_interest ?? 0) }));
    if (!c.length) return bad("no candles in range (check ticker/series_ticker)"); const cl = c.filter((x) => x.c != null);
    return ok({ venue: "Kalshi", ticker: t, series: s, interval: q.interval ?? "1h", count: c.length, first: cl[0]?.c ?? null, last: cl.at(-1)?.c ?? null, change_pts: cl.length ? (cl.at(-1).c - cl[0].c) * 100 : null, volume: c.reduce((a, x) => a + x.volume, 0), candles: c, source: "api.elections.kalshi.com" }); } catch (x) { return fail(x); }
}
