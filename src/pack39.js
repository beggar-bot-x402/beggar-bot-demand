// pack39: lnnode (Lightning node profile by pubkey), btcrecenttx (latest mempool txs + whale filter), solverified (Jupiter verified Solana tokens screener), btcfeecalc (fee cost for a tx size at each confirmation target)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
async function mp(p) { const r = await fetch("https://mempool.space/api" + p, { signal: AbortSignal.timeout(15000) }); if (r.status === 404) { const e = new Error("nf"); e.nf = 1; throw e; } if (!r.ok) throw new Error("upstream " + r.status); return r.json(); }
const r2 = (x) => (x == null ? null : +(+x).toFixed(2));
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);

export async function lnnode(a) {
  const pk = (a.pubkey || "").trim().toLowerCase(); if (!/^0[23][0-9a-f]{64}$/.test(pk)) return R(400, { error: "pubkey required: 66-hex Lightning node public key" });
  try {
    const d = await mp("/v1/lightning/nodes/" + pk); const act = d.active_channel_count || 0, cap = d.capacity || 0; const sk = (d.sockets || "").split(",").filter(Boolean);
    return R(200, { chain: "bitcoin", layer: "lightning", pubkey: pk, alias: d.alias, color: d.color, active_channels: act, capacity_btc: +(cap / 1e8).toFixed(4), avg_channel_btc: act ? +(cap / act / 1e8).toFixed(5) : null, opened_channels: d.opened_channel_count, closed_channels: d.closed_channel_count, churn_ratio: d.opened_channel_count ? r2(d.closed_channel_count / d.opened_channel_count) : null, first_seen: day(d.first_seen), updated: day(d.updated_at), stale_days: d.updated_at ? Math.floor((Date.now() / 1000 - d.updated_at) / 86400) : null, country: d.country?.en || null, isp: d.as_organization || null, asn: d.as_number || null, tor: sk.some((s) => s.includes(".onion")), clearnet: sk.some((s) => !s.includes(".onion")), sockets: sk });
  } catch (e) { return e.nf ? R(404, { error: "node not found", pubkey: pk }) : bad(e); }
}

export async function btcrecenttx(a) {
  const minv = n(a.min_btc, 0, 0, 1e6);
  try {
    const [d, f] = await Promise.all([mp("/mempool/recent"), mp("/v1/fees/recommended")]);
    const rows = d.map((x) => ({ txid: x.txid, value_btc: x.value / 1e8, fee_sats: x.fee, vsize_vb: x.vsize, fee_rate: r2(x.fee / x.vsize), next_block_likely: x.fee / x.vsize >= f.fastestFee })).filter((x) => x.value_btc >= minv);
    return R(200, { chain: "bitcoin", source: "mempool.space", fastest_fee_rate: f.fastestFee, txs: rows.length, total_value_btc: +rows.reduce((s, x) => s + x.value_btc, 0).toFixed(8), largest_btc: rows.length ? Math.max(...rows.map((x) => x.value_btc)) : null, list: rows });
  } catch (e) { return bad(e); }
}

export async function solverified(a) {
  const sort = ["mcap", "liquidity", "volume", "change", "holders", "organic"].includes(a.sort) ? a.sort : "volume"; const minL = n(a.min_liquidity, 50000, 0, 1e12);
  try {
    const r = await fetch("https://lite-api.jup.ag/tokens/v2/tag?query=verified", { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error("jupiter " + r.status); const d = await r.json();
    const rows = d.filter((t) => (t.liquidity || 0) >= minL).map((t) => { const s = t.stats24h || {}; return { mint: t.id, symbol: t.symbol, name: t.name, price_usd: t.usdPrice ?? null, mcap_usd: t.mcap ? Math.round(t.mcap) : null, liquidity_usd: Math.round(t.liquidity || 0), volume_24h_usd: Math.round((s.buyVolume || 0) + (s.sellVolume || 0)), change_24h_pct: r2(s.priceChange), holders: t.holderCount ?? null, organic_score: r2(t.organicScore), mint_disabled: t.audit?.mintAuthorityDisabled ?? null, freeze_disabled: t.audit?.freezeAuthorityDisabled ?? null }; });
    const key = { mcap: "mcap_usd", liquidity: "liquidity_usd", volume: "volume_24h_usd", change: "change_24h_pct", holders: "holders", organic: "organic_score" }[sort]; rows.sort((x, y) => (y[key] ?? -1e18) - (x[key] ?? -1e18));
    return R(200, { chain: "solana", source: "jupiter verified", verified_total: d.length, matching: rows.length, sort, list: rows.slice(0, n(a.limit, 50, 1, 200)) });
  } catch (e) { return bad(e); }
}

export async function btcfeecalc(a) {
  const ins = n(a.inputs, 1, 1, 1000), outs = n(a.outputs, 2, 1, 1000); const t = ["p2wpkh", "p2tr", "p2pkh", "p2sh-p2wpkh"].includes(a.type) ? a.type : "p2wpkh";
  const IN = { p2wpkh: 68, p2tr: 57.5, p2pkh: 148, "p2sh-p2wpkh": 91 }[t], OUT = { p2wpkh: 31, p2tr: 43, p2pkh: 34, "p2sh-p2wpkh": 32 }[t]; const vs = a.vsize ? n(a.vsize, 140, 60, 400000) : Math.ceil(10.5 + ins * IN + outs * OUT);
  try {
    const [f, p] = await Promise.all([mp("/v1/fees/recommended"), fetch("https://mempool.space/api/v1/prices", { signal: AbortSignal.timeout(10000) }).then((r) => r.json()).catch(() => ({}))]); const usd = p.USD || null;
    const tg = { next_block: f.fastestFee, half_hour: f.halfHourFee, hour: f.hourFee, economy: f.economyFee, minimum: f.minimumFee };
    return R(200, { chain: "bitcoin", script_type: t, inputs: ins, outputs: outs, vsize_vb: vs, btc_usd: usd, targets: Object.fromEntries(Object.entries(tg).map(([k, r]) => [k, { sat_vb: r, fee_sats: Math.ceil(r * vs), fee_usd: usd ? r2((r * vs * usd) / 1e8) : null }])), dust_threshold_sats: t === "p2pkh" ? 546 : t === "p2tr" ? 330 : 294 });
  } catch (e) { return bad(e); }
}
