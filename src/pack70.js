// pack70: cbcandles (Coinbase OHLCV candles + returns/range/vol stats), bitstampbook (Bitstamp order book depth, imbalance, slippage for a size), stablepxhist (stablecoin daily price history from DefiLlama: min/max/deviation days), soltxstatus (Solana signature statuses: confirmation, slot, error, for up to 50 sigs)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const r2 = (x, k = 2) => (x == null || !isFinite(x) ? null : +(+x).toFixed(k));
const g = async (u, o) => { const r = await fetch(u, { headers: { "user-agent": "beggar-bot", ...(o?.headers || {}) }, ...o, signal: AbortSignal.timeout(20000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.code = r.status; throw e; } return r.json(); };
const parse = (p) => { const m = /^([A-Za-z0-9]{2,10})[-\/_ ]?(USDT|USDC|USD|EUR|GBP|BTC|ETH)$/i.exec(String(p || "").trim()); return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null; };
const needP = R(400, { error: "pair required, e.g. BTC-USD, ETH/USD" });
const GR = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400 };

export async function cbcandles(a) {
  const p = parse(a.pair); if (!p) return needP; const iv = GR[a.interval || "1h"]; if (!iv) return R(400, { error: "interval must be one of " + Object.keys(GR).join(",") });
  try { const d = await g(`https://api.exchange.coinbase.com/products/${p[0]}-${p[1]}/candles?granularity=${iv}`).catch((e) => { if (e.code === 404) return null; throw e; }); if (!d) return R(404, { error: "pair not on Coinbase", pair: p.join("-") });
    const c = d.slice(0, n(a.limit, 100, 2, 300)).reverse().map(([t, lo, hi, op, cl, v]) => ({ time: new Date(t * 1000).toISOString(), open: op, high: hi, low: lo, close: cl, volume: v }));
    const rets = c.slice(1).map((x, i) => Math.log(x.close / c[i].close)); const m = rets.reduce((s, x) => s + x, 0) / rets.length; const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, rets.length - 1));
    const hi = Math.max(...c.map((x) => x.high)), lo = Math.min(...c.map((x) => x.low));
    return R(200, { pair: p.join("-"), venue: "Coinbase", interval: a.interval || "1h", candles: c.length, change_pct: r2((c.at(-1).close / c[0].open - 1) * 100, 3), high: hi, low: lo, range_pct: r2((hi / lo - 1) * 100, 3), realized_vol_annualized_pct: r2(sd * Math.sqrt((365 * 86400) / iv) * 100), total_volume: r2(c.reduce((s, x) => s + x.volume, 0), 4), up_candles: c.filter((x) => x.close >= x.open).length, list: c });
  } catch (e) { return bad(e); }
}

export async function bitstampbook(a) {
  const p = parse(a.pair); if (!p) return needP; const size = n(a.size_quote, 100000, 1, 1e10);
  try { const d = await g(`https://www.bitstamp.net/api/v2/order_book/${(p[0] + p[1]).toLowerCase()}/`).catch((e) => { if (e.code === 404) return null; throw e; }); if (!d?.bids) return R(404, { error: "pair not on Bitstamp", pair: p.join("-") });
    const B = d.bids.map(([x, y]) => [+x, +y]), A = d.asks.map(([x, y]) => [+x, +y]); const mid = (B[0][0] + A[0][0]) / 2;
    const depth = (s, bps) => s.filter(([x]) => Math.abs(x - mid) / mid <= bps / 1e4).reduce((t, [x, y]) => t + x * y, 0);
    const walk = (s) => { let q = size, base = 0; for (const [x, y] of s) { const take = Math.min(q, x * y); base += take / x; q -= take; if (q <= 0) break; } return q > 0 ? null : r2(((size / base - mid) / mid) * 1e4, 3); };
    const bands = [10, 50, 100, 200].map((b) => { const bd = depth(B, b), ad = depth(A, b); return { band_bps: b, bid_quote: r2(bd, 0), ask_quote: r2(ad, 0), imbalance: bd + ad ? r2((bd - ad) / (bd + ad), 3) : null }; });
    return R(200, { pair: p.join("-"), venue: "Bitstamp", time: new Date(+d.timestamp * 1000).toISOString(), best_bid: B[0][0], best_ask: A[0][0], mid: r2(mid, 6), spread_bps: r2(((A[0][0] - B[0][0]) / mid) * 1e4, 3), levels: { bids: B.length, asks: A.length }, depth: bands, slippage_for_size: { size_quote: size, buy_bps: walk(A), sell_bps: (() => { const v = walk(B); return v == null ? null : -v; })() } });
  } catch (e) { return bad(e); }
}

export async function stablepxhist(a) {
  const id = String(a.coin || "").toLowerCase().trim(); if (!/^[a-z0-9-]{2,60}$/.test(id)) return R(400, { error: "coin required (DefiLlama stablecoin gecko id), e.g. usd-coin, tether, ethena-usde" });
  const days = n(a.days, 90, 2, 2000); const tol = n(a.threshold_pct, 0.5, 0.01, 50);
  try { const d = await g("https://stablecoins.llama.fi/stablecoinprices"); const s = d.slice(-days).map((x) => ({ date: new Date(x.date * 1000).toISOString().slice(0, 10), price: x.prices?.[id] })).filter((x) => x.price != null);
    if (!s.length) return R(404, { error: "no price history for coin", coin: id, hint: "use gecko ids like usd-coin, tether, dai, ethena-usde" });
    const px = s.map((x) => x.price); const peg = /eur/.test(id) ? null : 1; const dev = peg ? s.filter((x) => Math.abs(x.price - peg) * 100 >= tol) : [];
    return R(200, { coin: id, days: s.length, latest: s.at(-1), min: Math.min(...px), max: Math.max(...px), avg: r2(px.reduce((t, x) => t + x, 0) / px.length, 6), peg_assumed: peg, threshold_pct: tol, deviation_days: dev.length, worst: peg ? s.reduce((x, y) => (Math.abs(y.price - 1) > Math.abs(x.price - 1) ? y : x)) : null, list: s });
  } catch (e) { return bad(e); }
}

const RPC = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const rpc = async (m, p) => { let err; for (const u of RPC) { try { const d = await g(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }); if (d.error) throw new Error(d.error.message); return d.result; } catch (e) { err = e; } } throw err; };
export async function soltxstatus(a) {
  const sigs = String(a.signatures || a.signature || "").split(",").map((x) => x.trim()).filter(Boolean); if (!sigs.length || sigs.length > 50 || sigs.some((x) => !/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(x))) return R(400, { error: "signatures required: 1-50 comma-separated base58 Solana tx signatures" });
  try { const r = await rpc("getSignatureStatuses", [sigs, { searchTransactionHistory: true }]); const l = sigs.map((s, i) => { const v = r.value[i]; return v ? { signature: s, found: true, slot: v.slot, confirmation: v.confirmationStatus, confirmations: v.confirmations, success: !v.err, error: v.err || null } : { signature: s, found: false }; });
    return R(200, { context_slot: r.context?.slot, count: l.length, found: l.filter((x) => x.found).length, finalized: l.filter((x) => x.confirmation === "finalized").length, failed: l.filter((x) => x.found && !x.success).length, list: l });
  } catch (e) { return bad(e); }
}
