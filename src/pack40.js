// pack40: lnchannels (open channels of a Lightning node), blockattime (block height at a unix timestamp per chain), tokenchange (multi-period % change for coins), btchistprice (BTC fiat price at a timestamp)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const ts = (v) => { if (v == null || v === "") return Math.floor(Date.now() / 1000); if (/^\d{9,13}$/.test(String(v))) { const t = +v; return t > 1e12 ? Math.floor(t / 1000) : t; } const d = Date.parse(v); return isNaN(d) ? null : Math.floor(d / 1000); };

export async function lnchannels(a) {
  const pk = (a.pubkey || "").trim().toLowerCase(); if (!/^0[23][0-9a-f]{64}$/.test(pk)) return R(400, { error: "pubkey required: 66-hex Lightning node public key" });
  try {
    const d = await j(`https://mempool.space/api/v1/lightning/channels?public_key=${pk}&status=open`); const rows = d.map((c) => ({ short_id: c.short_id, capacity_btc: c.capacity / 1e8, fee_rate_ppm: c.fee_rate, peer_alias: c.node?.alias, peer_pubkey: c.node?.public_key, peer_channels: c.node?.channels, peer_capacity_btc: c.node?.capacity ? +(+c.node.capacity / 1e8).toFixed(2) : null }));
    const peers = {}; for (const r of rows) peers[r.peer_pubkey] = (peers[r.peer_pubkey] || 0) + r.capacity_btc; const tot = rows.reduce((s, x) => s + x.capacity_btc, 0); const fr = rows.map((x) => x.fee_rate_ppm).sort((x, y) => x - y);
    return R(200, { chain: "bitcoin", layer: "lightning", pubkey: pk, channels_returned: rows.length, note: "first page of open channels (mempool.space paginates at ~10)", capacity_btc: +tot.toFixed(4), unique_peers: Object.keys(peers).length, median_fee_rate_ppm: fr.length ? fr[Math.floor(fr.length / 2)] : null, largest_peer_share_pct: tot ? r2((100 * Math.max(...Object.values(peers))) / tot) : null, list: rows });
  } catch (e) { return bad(e); }
}

export async function blockattime(a) {
  const t = ts(a.timestamp); if (t == null || t < 1230768000) return R(400, { error: "timestamp must be unix seconds/ms or ISO date after 2009" }); const ch = (a.chain || "ethereum").toLowerCase().replace(/[^a-z0-9-]/g, "");
  try {
    const d = await j(`https://coins.llama.fi/block/${ch}/${t}`);
    return R(200, { chain: ch, requested_timestamp: t, requested_iso: new Date(t * 1000).toISOString(), block: d.height, block_timestamp: d.timestamp, block_iso: new Date(d.timestamp * 1000).toISOString(), drift_sec: d.timestamp - t, source: "defillama" });
  } catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "chain unsupported or no block", chain: ch }) : bad(e); }
}

const ALIAS = { btc: "coingecko:bitcoin", eth: "coingecko:ethereum", sol: "coingecko:solana", bnb: "coingecko:binancecoin", usdc: "coingecko:usd-coin", usdt: "coingecko:tether", hype: "coingecko:hyperliquid", xrp: "coingecko:ripple", doge: "coingecko:dogecoin" };
export async function tokenchange(a) {
  const ids = String(a.coins || "btc,eth,sol").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 25).map((s) => ALIAS[s.toLowerCase()] || (s.includes(":") ? s : /^0x[0-9a-fA-F]{40}$/.test(s) ? "ethereum:" + s : "coingecko:" + s.toLowerCase()));
  if (!ids.length || ids.some((s) => !/^[a-z0-9-]+:[A-Za-z0-9-]+$/.test(s))) return R(400, { error: "coins: comma list of symbols (btc,eth), coingecko ids, chain:address" });
  try {
    const P = ["1d", "7d", "30d", "90d", "365d"]; const q = ids.join(","); const [pr, ...ch] = await Promise.all([j("https://coins.llama.fi/prices/current/" + q), ...P.map((p) => j(`https://coins.llama.fi/percentage/${q}?period=${p}`))]);
    const rows = ids.map((id) => ({ coin: id, symbol: pr.coins[id]?.symbol || null, price_usd: pr.coins[id]?.price ?? null, ...Object.fromEntries(P.map((p, i) => ["change_" + p + "_pct", r2(ch[i].coins[id])])) }));
    return R(200, { source: "defillama", coins: rows.length, list: rows, best_7d: [...rows].sort((x, y) => (y.change_7d_pct ?? -1e9) - (x.change_7d_pct ?? -1e9))[0]?.coin || null });
  } catch (e) { return bad(e); }
}

export async function btchistprice(a) {
  const t = ts(a.timestamp); if (t == null || t < 1279324800) return R(400, { error: "timestamp must be unix seconds/ms or ISO date after 2010-07-17" });
  try {
    const [h, c] = await Promise.all([j("https://mempool.space/api/v1/historical-price?currency=USD&timestamp=" + t), j("https://mempool.space/api/v1/prices")]); const p = h.prices?.[0]; if (!p) return R(404, { error: "no price for timestamp" }); const x = h.exchangeRates || {};
    return R(200, { asset: "BTC", requested_iso: new Date(t * 1000).toISOString(), price_time_iso: new Date(p.time * 1000).toISOString(), price_usd: p.USD, price_eur: x.USDEUR ? Math.round(p.USD * x.USDEUR) : null, price_gbp: x.USDGBP ? Math.round(p.USD * x.USDGBP) : null, price_jpy: x.USDJPY ? Math.round(p.USD * x.USDJPY) : null, current_usd: c.USD, change_since_pct: r2((100 * (c.USD - p.USD)) / p.USD), sats_per_usd_then: Math.round(1e8 / p.USD), source: "mempool.space" });
  } catch (e) { return bad(e); }
}
