// packb66 (builder B, 2026-11-02): Polymarket depth: CLOB orderbook + slippage, price history, top holders, wallet positions/PnL. $0 upstream (gamma-api, clob, data-api public endpoints).
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
const GA = "https://gamma-api.polymarket.com", CL = "https://clob.polymarket.com", DA = "https://data-api.polymarket.com", N = Number;
async function j(u) { const r = await fetch(u, { headers: { accept: "application/json" } }); const x = await r.json().catch(() => null); if (!r.ok) throw new Error("Polymarket " + r.status + (x?.error ? ": " + String(x.error).slice(0, 80) : "")); return x; }
const P = (s) => { try { return typeof s === "string" ? JSON.parse(s) : s || []; } catch { return []; } };
async function mkt(q) { const s = String(q.slug ?? "").trim(), c = String(q.condition_id ?? q.market ?? "").trim(); let r;
  if (/^0x[0-9a-fA-F]{64}$/.test(c)) r = await j(`${GA}/markets?condition_ids=${c}`); else if (/^[a-z0-9-]{3,200}$/.test(s)) r = await j(`${GA}/markets?slug=${encodeURIComponent(s)}`); else return null;
  const m = r?.[0]; if (!m) throw Object.assign(new Error("market not found"), { nf: 1 }); const o = P(m.outcomes), t = P(m.clobTokenIds), pr = P(m.outcomePrices);
  return { question: m.question, slug: m.slug, condition_id: m.conditionId, end_date: m.endDate, closed: !!m.closed, outcomes: o.map((n, i) => ({ outcome: n, token_id: t[i], price: pr[i] != null ? N(pr[i]) : null })) }; }
const pickO = (m, q) => { const w = String(q.outcome ?? m.outcomes[0]?.outcome ?? "").toLowerCase(); return m.outcomes.find((o) => o.outcome.toLowerCase() === w) || null; };
const need = () => bad("slug or condition_id (0x…64 hex) required");
const fail = (e) => (e.nf ? bad(e.message) : err(e));
export async function pmbook(q) {
  const sz = q.size_usd != null ? N(q.size_usd) : 1000; if (!(sz > 0)) return bad("size_usd must be > 0");
  try { const m = await mkt(q); if (!m) return need(); const o = pickO(m, q); if (!o) return bad("outcome not in " + m.outcomes.map((x) => x.outcome).join("/")); const b = await j(`${CL}/book?token_id=${o.token_id}`);
    const bid = (b.bids || []).map((x) => [N(x.price), N(x.size)]).sort((a, c) => c[0] - a[0]), ask = (b.asks || []).map((x) => [N(x.price), N(x.size)]).sort((a, c) => a[0] - c[0]); const bb = bid[0]?.[0] ?? null, ba = ask[0]?.[0] ?? null, mid = bb != null && ba != null ? (bb + ba) / 2 : bb ?? ba;
    const walk = (L) => { let u = 0, sh = 0; for (const [p, s] of L) { const c = Math.min(p * s, sz - u); u += c; sh += c / p; if (u >= sz - 1e-9) break; } return u >= sz - 1e-9 ? { avg_price: u / sh, shares: sh, slippage_cents: Math.abs(u / sh - mid) * 100, max_payout_usd: sh } : { filled_usd: u, shares: sh, note: "book too thin" }; };
    const dep = (L, c) => L.filter(([p]) => Math.abs(p - mid) <= c).reduce((t, [p, s]) => t + p * s, 0);
    return ok({ question: m.question, outcome: o.outcome, token_id: o.token_id, best_bid: bb, best_ask: ba, mid, spread_cents: bb != null && ba != null ? (ba - bb) * 100 : null, implied_prob_pct: mid != null ? mid * 100 : null, depth_usd: { bid_2c: dep(bid, 0.02), ask_2c: dep(ask, 0.02), bid_5c: dep(bid, 0.05), ask_5c: dep(ask, 0.05) }, size_usd: sz, buy: walk(ask), sell: walk(bid), levels: { bids: bid.slice(0, 10), asks: ask.slice(0, 10) }, tick_size: N(b.tick_size) || null, min_order_size: N(b.min_order_size) || null, source: "clob.polymarket.com/book" }); } catch (e) { return fail(e); }
}
export async function pmhistory(q) {
  const iv = String(q.interval ?? "1w"); if (!["1h", "6h", "1d", "1w", "1m", "max"].includes(iv)) return bad("interval one of 1h,6h,1d,1w,1m,max");
  try { const m = await mkt(q); if (!m) return need(); const o = pickO(m, q); if (!o) return bad("outcome not in " + m.outcomes.map((x) => x.outcome).join("/")); const f = { "1h": 1, "6h": 5, "1d": 15, "1w": 60, "1m": 240, max: 1440 }[iv];
    const h = ((await j(`${CL}/prices-history?market=${o.token_id}&interval=${iv}&fidelity=${f}`)).history || []).map((x) => ({ t: x.t, p: x.p })); if (!h.length) return bad("no price history");
    const ps = h.map((x) => x.p); return ok({ question: m.question, outcome: o.outcome, interval: iv, points: h.length, first: ps[0], last: ps.at(-1), change_pts: (ps.at(-1) - ps[0]) * 100, high: Math.max(...ps), low: Math.min(...ps), history: h.slice(-Math.min(h.length, N(q.limit) || 200)), note: "p = price of 1 share = implied probability", source: "clob.polymarket.com/prices-history" }); } catch (e) { return fail(e); }
}
export async function pmholders(q) {
  try { const m = await mkt(q); if (!m) return need(); const r = await j(`${DA}/holders?market=${m.condition_id}&limit=${Math.min(20, N(q.limit) || 10)}`);
    const by = Object.fromEntries(m.outcomes.map((o) => [o.token_id, o]));
    return ok({ question: m.question, condition_id: m.condition_id, outcomes: (r || []).map((t) => { const o = by[t.token] || {}; const hs = (t.holders || []).map((h) => ({ wallet: h.proxyWallet, name: h.name || h.pseudonym || null, shares: h.amount, value_usd: o.price != null ? h.amount * o.price : null })); return { outcome: o.outcome ?? null, price: o.price ?? null, top_holders: hs, top_shares_total: hs.reduce((s, h) => s + h.shares, 0) }; }), source: "data-api.polymarket.com/holders" }); } catch (e) { return fail(e); }
}
export async function pmpositions(q) {
  if (!isA(q.address)) return bad("address (Polymarket proxy wallet) required");
  try { const a = q.address.toLowerCase(), [p, v] = await Promise.all([j(`${DA}/positions?user=${a}&limit=${Math.min(100, N(q.limit) || 25)}&sortBy=CURRENT&sizeThreshold=${N(q.min_size) || 1}`), j(`${DA}/value?user=${a}`)]);
    const ps = (p || []).map((x) => ({ title: x.title, outcome: x.outcome, slug: x.slug, size: x.size, avg_price: x.avgPrice, cur_price: x.curPrice, initial_usd: x.initialValue, current_usd: x.currentValue, cash_pnl: x.cashPnl, pct_pnl: x.percentPnl, realized_pnl: x.realizedPnl, redeemable: !!x.redeemable, end_date: x.endDate }));
    return ok({ address: checksum(q.address), total_value_usd: v?.[0]?.value ?? 0, positions: ps.length, unrealized_pnl: ps.reduce((s, x) => s + (x.cash_pnl || 0), 0), redeemable_usd: ps.filter((x) => x.redeemable).reduce((s, x) => s + (x.current_usd || 0), 0), items: ps, source: "data-api.polymarket.com" }); } catch (e) { return fail(e); }
}
