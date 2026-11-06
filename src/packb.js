// Builder B pack (2026-11-02, demand: AGENTIC_SPEND_MAP BUILD-NOW #5,#6,#8,#9,#10,#11,#12): /v1/polymarket, /v1/blocktime, /v1/weather,
// /v1/uptime, /v1/cryptonews, /v1/yieldpools, /v1/dexquote. All $0 upstream: keyless public APIs/RPC, no CF AI.
import { rpcBatch, RPCS } from "./walletintel.js";
import { fetchSafeUrl } from "./fetchpage.js";
import { keccakHex } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const UA = { "user-agent": "BeggarBot/1.0 (+https://beggar-bot-demand.beggarbot.workers.dev/llms.txt)" };
const getJ = async (u, ms = 8000) => { const r = await fetch(u, { headers: { ...UA, accept: "application/json" }, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error("upstream http " + r.status); return r.json(); };
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.floor(num(v, d))));
const pj = (s) => { try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; } };
const CH = { base: "base", "8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", optimism: "optimism", op: "optimism", "10": "optimism", arbitrum: "arbitrum", arb: "arbitrum", "42161": "arbitrum", polygon: "polygon", "137": "polygon" };
const chainOf = (c) => CH[String(c ?? "base").trim().toLowerCase()] || null;

// ---- /v1/polymarket ----
export function shapeMarket(m) {
  const outs = pj(m.outcomes) || [], px = (pj(m.outcomePrices) || []).map(Number);
  return { question: m.question, slug: m.slug, url: m.slug ? `https://polymarket.com/market/${m.slug}` : null, outcomes: outs.map((o, i) => ({ outcome: o, price: px[i] ?? null, implied_pct: px[i] != null ? Math.round(px[i] * 1000) / 10 : null })),
    volume_24h: num(m.volume24hr, null), volume: num(m.volume, null), liquidity: num(m.liquidity, null), end_date: m.endDate || null, active: !!m.active, closed: !!m.closed, best_bid: num(m.bestBid, null), best_ask: num(m.bestAsk, null), last_trade: num(m.lastTradePrice, null), change_1d: num(m.oneDayPriceChange, null) };
}
export async function polymarket(a) {
  const limit = clamp(a.limit, 1, 25, 10), q = String(a.q || a.query || "").trim().slice(0, 100), slug = String(a.slug || "").trim();
  try {
    let markets;
    if (slug) { if (!/^[a-z0-9-]{3,200}$/.test(slug)) return bad("slug invalid"); markets = await getJ(`https://gamma-api.polymarket.com/markets?slug=${slug}`); }
    else if (q) { const j = await getJ(`https://gamma-api.polymarket.com/public-search?q=${encodeURIComponent(q)}&limit_per_type=${limit}&events_status=active`); markets = (j.events || []).flatMap((e) => (e.markets || []).map((m) => ({ ...m, _event: e.title }))).filter((m) => !m.closed); }
    else { const order = ["volume24hr", "liquidity", "endDate", "volume"].includes(a.sort) ? a.sort : "volume24hr"; markets = await getJ(`https://gamma-api.polymarket.com/markets?limit=${limit}&active=true&closed=false&order=${order}&ascending=${order === "endDate"}`); }
    markets = (markets || []).sort((x, y) => num(y.volume24hr, 0) - num(x.volume24hr, 0)).slice(0, limit);
    return ok({ source: "polymarket gamma api", query: q || slug || null, count: markets.length, markets: markets.map((m) => ({ ...(m._event ? { event: m._event } : {}), ...shapeMarket(m) })), fetched_at: new Date().toISOString() });
  } catch (e) { return { status: 502, body: { error: "polymarket upstream failed", detail: String(e.message || e).slice(0, 160) } }; }
}

// ---- /v1/blocktime ----
const hexN = (h) => (h ? Number(BigInt(h)) : null);
async function blk(chain, ns) { const r = (await rpcBatch(chain, ns.map((n) => ["eth_getBlockByNumber", [n === "latest" ? n : "0x" + n.toString(16), false]]))).results; return r.map((b) => (b ? { number: hexN(b.number), timestamp: hexN(b.timestamp), hash: b.hash } : null)); }
export async function blocktime(a) {
  const chain = chainOf(a.chain); if (!chain) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  const iso = (t) => new Date(t * 1000).toISOString();
  try {
    if (a.block != null && a.block !== "") {
      const n = String(a.block) === "latest" ? "latest" : Number(a.block); if (n !== "latest" && !(Number.isInteger(n) && n >= 0)) return bad("block must be integer or latest");
      const [b, h] = await blk(chain, [n, "latest"]); if (!b) return ok({ chain, block: n, found: false, head: h });
      return ok({ chain, mode: "time_by_block", block: b.number, timestamp: b.timestamp, iso: iso(b.timestamp), hash: b.hash, head: h.number, confirmations: h.number - b.number, age_s: h.timestamp - b.timestamp });
    }
    let ts = a.timestamp ?? a.time; if (ts == null || ts === "") return bad("timestamp (unix or ISO) or block required");
    ts = /^\d+$/.test(String(ts)) ? Number(ts) : Math.floor(Date.parse(ts) / 1000); if (!Number.isFinite(ts)) return bad("timestamp invalid");
    if (ts > 1e11) ts = Math.floor(ts / 1000);
    const [h] = await blk(chain, ["latest"]); if (ts >= h.timestamp) return ok({ chain, mode: "block_by_time", timestamp: ts, block: h.number, block_timestamp: h.timestamp, note: "timestamp at/after head; returned head", head: h.number });
    // interpolation search: block with greatest timestamp <= ts
    let lo = { number: 0, timestamp: 0 }, hi = h; const g = await blk(chain, [0]); if (g[0]) lo = g[0]; if (ts < lo.timestamp) return ok({ chain, mode: "block_by_time", timestamp: ts, block: null, note: "before genesis" });
    for (let i = 0; i < 6 && hi.number - lo.number > 1; i++) {
      const span = hi.number - lo.number, est = lo.number + Math.floor(span * (ts - lo.timestamp) / Math.max(1, hi.timestamp - lo.timestamp));
      const cands = [...new Set([est - 2, est, est + 1, est + 3, lo.number + Math.floor(span / 2)].map((x) => Math.min(hi.number - 1, Math.max(lo.number + 1, x))))];
      const bs = (await blk(chain, cands)).filter(Boolean);
      for (const b of bs) { if (b.timestamp <= ts && b.number > lo.number) lo = b; if (b.timestamp > ts && b.number < hi.number) hi = b; }
    }
    // final linear narrowing (small gap)
    while (hi.number - lo.number > 1) { const ns = []; for (let n = lo.number + 1; n < hi.number && ns.length < 20; n++) ns.push(n); const bs = (await blk(chain, ns)).filter(Boolean); let moved = false; for (const b of bs) { if (b.timestamp <= ts && b.number > lo.number) { lo = b; moved = true; } if (b.timestamp > ts && b.number < hi.number) { hi = b; moved = true; } } if (!moved) break; }
    return ok({ chain, mode: "block_by_time", timestamp: ts, iso: iso(ts), block: lo.number, block_timestamp: lo.timestamp, block_iso: iso(lo.timestamp), next_block: hi.number, next_block_timestamp: hi.timestamp, head: h.number, exact: hi.number - lo.number === 1 });
  } catch (e) { return { status: 502, body: { error: "rpc failed", detail: String(e.message || e).slice(0, 160) } }; }
}

// ---- /v1/weather ----
const WMO = { 0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog", 51: "light drizzle", 53: "drizzle", 55: "dense drizzle", 61: "light rain", 63: "rain", 65: "heavy rain", 66: "freezing rain", 67: "heavy freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow", 77: "snow grains", 80: "light showers", 81: "showers", 82: "violent showers", 85: "snow showers", 86: "heavy snow showers", 95: "thunderstorm", 96: "thunderstorm w/ hail", 99: "severe thunderstorm w/ hail" };
export async function weather(a) {
  let lat = a.lat ?? a.latitude, lon = a.lon ?? a.lng ?? a.longitude, place = null; const days = clamp(a.days, 1, 16, 3); const imp = String(a.units || "").toLowerCase() === "imperial";
  try {
    if ((lat == null || lon == null) && a.city) { const g = await getJ(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(String(a.city).slice(0, 80))}&count=1`); const r = g.results && g.results[0]; if (!r) return ok({ found: false, city: a.city }); lat = r.latitude; lon = r.longitude; place = { name: r.name, country: r.country, admin1: r.admin1, timezone: r.timezone }; }
    lat = Number(lat); lon = Number(lon); if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return bad("lat/lon or city required");
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=${days}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset,uv_index_max` + (imp ? "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" : "");
    const j = await getJ(u); const c = j.current || {}, d = j.daily || {};
    const daily = (d.time || []).map((t, i) => ({ date: t, summary: WMO[d.weather_code[i]] || null, weather_code: d.weather_code[i], t_max: d.temperature_2m_max[i], t_min: d.temperature_2m_min[i], precip: d.precipitation_sum[i], precip_prob_pct: d.precipitation_probability_max[i], wind_max: d.wind_speed_10m_max[i], uv_max: d.uv_index_max[i], sunrise: d.sunrise[i], sunset: d.sunset[i] }));
    return ok({ source: "open-meteo", lat, lon, place, timezone: j.timezone, units: { temp: imp ? "F" : "C", wind: imp ? "mph" : "km/h", precip: imp ? "in" : "mm" }, current: { time: c.time, summary: WMO[c.weather_code] || null, weather_code: c.weather_code, temp: c.temperature_2m, feels_like: c.apparent_temperature, humidity_pct: c.relative_humidity_2m, precip: c.precipitation, cloud_pct: c.cloud_cover, wind: c.wind_speed_10m, wind_gust: c.wind_gusts_10m, wind_dir_deg: c.wind_direction_10m, is_day: !!c.is_day }, daily });
  } catch (e) { return { status: 502, body: { error: "weather upstream failed", detail: String(e.message || e).slice(0, 160) } }; }
}

// ---- /v1/uptime ----
export async function uptime(a) {
  let urls = a.urls ?? a.url; if (typeof urls === "string") urls = urls.split(/[\s,]+/).filter(Boolean); if (!Array.isArray(urls) || !urls.length) return bad("url or urls (≤10) required");
  urls = urls.slice(0, 10); const timeout = clamp(a.timeout_ms, 500, 10000, 6000), expect = a.expect_status ? Number(a.expect_status) : null, kw = a.keyword ? String(a.keyword).slice(0, 100) : null;
  const one = async (raw) => {
    const s = /^https?:\/\//i.test(raw) ? raw : "https://" + raw; const u = fetchSafeUrl(s); if (!u) return { url: raw, up: false, error: "blocked_or_invalid_url" };
    const t0 = Date.now();
    try { const r = await fetch(u.toString(), { method: kw ? "GET" : "GET", redirect: "manual", headers: UA, signal: AbortSignal.timeout(timeout) }); const ttfb = Date.now() - t0;
      let body = null; if (kw) body = (await r.text()).slice(0, 500000); else { try { await r.body?.cancel(); } catch {} }
      const up = expect ? r.status === expect : r.status < 400; const o = { url: u.toString(), up: kw ? up && body.includes(kw) : up, status: r.status, latency_ms: ttfb, https: u.protocol === "https:", tls_ok: u.protocol === "https:" ? true : null, location: r.headers.get("location") || undefined, server: r.headers.get("server") || undefined, content_type: r.headers.get("content-type") || undefined };
      if (kw) o.keyword_found = body.includes(kw); return o;
    } catch (e) { const m = String(e.message || e); return { url: u.toString(), up: false, latency_ms: Date.now() - t0, error: /timeout|abort/i.test(m) ? "timeout" : /certificate|ssl|tls/i.test(m) ? "tls_error" : "connect_error", detail: m.slice(0, 120) }; }
  };
  const results = await Promise.all(urls.map(one)); const up = results.filter((r) => r.up).length;
  return ok({ checked: results.length, up, down: results.length - up, all_up: up === results.length, results, checked_at: new Date().toISOString(), note: "TLS validity checked via handshake (invalid certs -> tls_error); cert expiry date not exposed by runtime" });
}

// ---- /v1/cryptonews ----
const FEEDS = { cointelegraph: "https://cointelegraph.com/rss", decrypt: "https://decrypt.co/feed", theblock: "https://www.theblock.co/rss.xml", coindesk: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml" };
const ent = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
export function parseRss(xml, source) {
  const out = []; for (const m of String(xml).matchAll(/<item[\s>][\s\S]*?<\/item>/g)) { const it = m[0]; const tag = (t) => { const x = it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return x ? ent(x[1]) : null; };
    const pub = tag("pubDate") || tag("dc:date"); out.push({ title: tag("title"), url: tag("link") || (it.match(/<guid[^>]*>([^<]+)</) || [])[1] || null, published: pub ? new Date(pub).toISOString?.() : null, summary: (tag("description") || "").slice(0, 280), source }); }
  return out.filter((x) => x.title);
}
export async function cryptonews(a) {
  const kws = String(a.q || a.keywords || a.query || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10); const limit = clamp(a.limit, 1, 50, 20), hours = clamp(a.hours, 1, 168, 48);
  const srcs = a.sources ? String(a.sources).split(",").map((s) => s.trim()).filter((s) => FEEDS[s]) : Object.keys(FEEDS);
  const got = await Promise.all(srcs.map(async (s) => { try { const r = await fetch(FEEDS[s], { headers: { ...UA, accept: "application/rss+xml,application/xml,text/xml" }, signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error("http " + r.status); return { s, items: parseRss(await r.text(), s) }; } catch (e) { return { s, error: String(e.message || e).slice(0, 80), items: [] }; } }));
  const cutoff = Date.now() - hours * 3600e3, seen = new Set(); let items = [];
  for (const g of got) for (const it of g.items) { const k = (it.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80); if (seen.has(k)) continue; seen.add(k); if (it.published && Date.parse(it.published) < cutoff) continue;
    const hay = (it.title + " " + it.summary).toLowerCase(); const hit = kws.filter((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay)); if (kws.length && !hit.length) continue; items.push({ ...it, matched: hit }); }
  items.sort((x, y) => (Date.parse(y.published) || 0) - (Date.parse(x.published) || 0)); items = items.slice(0, limit);
  const by_keyword = {}; for (const w of kws) by_keyword[w] = items.filter((i) => i.matched.includes(w)).length;
  return ok({ keywords: kws, hours, count: items.length, by_keyword, sources: got.map((g) => ({ source: g.s, items: g.items.length, ...(g.error ? { error: g.error } : {}) })), items, fetched_at: new Date().toISOString() });
}

// ---- /v1/yieldpools ----
export async function yieldpools(a) {
  const chain = a.chain ? String(a.chain).toLowerCase() : null, sym = a.symbol || a.asset ? String(a.symbol || a.asset).toUpperCase() : null, proj = a.project ? String(a.project).toLowerCase() : null;
  const minTvl = num(a.min_tvl, 1e6), minApy = num(a.min_apy, 0), maxApy = num(a.max_apy, 1000), limit = clamp(a.limit, 1, 50, 15), stable = a.stablecoin === true || a.stablecoin === "true", noIL = a.no_il === true || a.no_il === "true";
  const sort = ["apy", "tvl", "apy_base"].includes(a.sort) ? a.sort : "apy";
  try { const j = await getJ("https://yields.llama.fi/pools", 15000); let p = j.data || [];
    p = p.filter((x) => (x.tvlUsd || 0) >= minTvl && (x.apy || 0) >= minApy && (x.apy || 0) <= maxApy && (!chain || String(x.chain).toLowerCase() === chain) && (!proj || String(x.project).toLowerCase().includes(proj)) && (!sym || String(x.symbol).toUpperCase().split(/[-\/ ]/).includes(sym) || String(x.symbol).toUpperCase() === sym) && (!stable || x.stablecoin) && (!noIL || x.ilRisk === "no"));
    const key = { apy: "apy", tvl: "tvlUsd", apy_base: "apyBase" }[sort]; p.sort((x, y) => (y[key] || 0) - (x[key] || 0));
    const total = p.length; p = p.slice(0, limit).map((x) => ({ pool_id: x.pool, project: x.project, chain: x.chain, symbol: x.symbol, tvl_usd: Math.round(x.tvlUsd), apy: x.apy, apy_base: x.apyBase, apy_reward: x.apyReward, apy_mean_30d: x.apyMean30d, apy_change_7d: x.apyPct7D, stablecoin: x.stablecoin, il_risk: x.ilRisk, exposure: x.exposure, prediction: x.predictions ? x.predictions.predictedClass : null, url: `https://defillama.com/yields/pool/${x.pool}`, flags: [...(x.apy > 100 ? ["APY_OVER_100"] : []), ...(x.apyReward && x.apyReward > (x.apyBase || 0) ? ["MOSTLY_REWARD_EMISSIONS"] : []), ...(x.outlier ? ["OUTLIER"] : [])] }));
    return ok({ source: "defillama yields", filters: { chain, symbol: sym, project: proj, min_tvl: minTvl, min_apy: minApy, stablecoin: stable, no_il: noIL, sort }, matched: total, count: p.length, pools: p });
  } catch (e) { return { status: 502, body: { error: "defillama upstream failed", detail: String(e.message || e).slice(0, 160) } }; }
}

// ---- /v1/dexquote (Uniswap v3 QuoterV2 eth_call, keyless) ----
const QUOTER = { base: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", ethereum: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", arbitrum: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", optimism: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", polygon: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" };
const SYM = { base: { USDC: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6], WETH: ["0x4200000000000000000000000000000000000006", 18], ETH: ["0x4200000000000000000000000000000000000006", 18], CBBTC: ["0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", 8], AERO: ["0x940181a94A35A4569E4529A3CDfB74e38FD98631", 18], USDT: ["0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", 6], DAI: ["0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", 18], CBETH: ["0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", 18] },
  ethereum: { USDC: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6], WETH: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18], ETH: ["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 18], USDT: ["0xdAC17F958D2ee523a2206206994597C13D831ec7", 6], DAI: ["0x6B175474E89094C44Da98b954EedeAC495271d0F", 18], WBTC: ["0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", 8] } };
const w = (v) => BigInt(v).toString(16).padStart(64, "0");
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const i = s.slice(0, -d) || "0", f = s.slice(-d).replace(/0+$/, ""); return f ? `${i}.${f}` : i; };
const toUnits = (s, d) => { const [i, f = ""] = String(s).split("."); if (!/^\d+$/.test(i || "0") || !/^\d*$/.test(f)) return null; return BigInt(i || "0") * 10n ** BigInt(d) + BigInt((f + "0".repeat(d)).slice(0, d) || "0"); };
export async function dexquote(a) {
  const chain = chainOf(a.chain); if (!chain || !QUOTER[chain]) return bad("chain unsupported");
  const res = async (t) => { const s = String(t || "").trim(); const k = SYM[chain] && SYM[chain][s.toUpperCase()]; if (k) return { address: k[0], decimals: k[1], symbol: s.toUpperCase() };
    if (!/^0x[0-9a-fA-F]{40}$/.test(s)) return null; const r = (await rpcBatch(chain, [["eth_call", [{ to: s, data: "0x313ce567" }, "latest"]]])).results[0]; return r && r !== "0x" ? { address: s, decimals: Number(BigInt(r)), symbol: null } : null; };
  try {
    const tin = await res(a.token_in || a.from || a.sell), tout = await res(a.token_out || a.to || a.buy); if (!tin || !tout) return bad("token_in/token_out: symbol (USDC, WETH, cbBTC, AERO, USDT, DAI...) or 0x ERC-20 address");
    const amt = toUnits(a.amount ?? "1", tin.decimals); if (!amt || amt <= 0n) return bad("amount must be positive decimal");
    const fees = [100, 500, 3000, 10000], s = keccakHex("quoteExactInputSingle((address,address,uint256,uint24,uint160))").slice(0, 10);
    const r = (await rpcBatch(chain, fees.map((f) => ["eth_call", [{ to: QUOTER[chain], data: s + w(tin.address) + w(tout.address) + w(amt) + w(f) + w(0) }, "latest"]]))).results;
    const quotes = fees.map((f, i) => { const h = r[i]; if (!h || h.length < 66) return null; const out = BigInt("0x" + h.slice(2, 66)); const gas = h.length >= 258 ? Number(BigInt("0x" + h.slice(194, 258))) : null; return out > 0n ? { fee_bps: f / 100, amount_out_raw: out.toString(), amount_out: fmt(out, tout.decimals), gas_estimate: gas } : null; }).filter(Boolean);
    quotes.sort((x, y) => (BigInt(y.amount_out_raw) > BigInt(x.amount_out_raw) ? 1 : -1)); const best = quotes[0] || null;
    const price = best ? Number(best.amount_out) / Number(fmt(amt, tin.decimals)) : null;
    return ok({ chain, dex: "uniswap_v3", quoter: QUOTER[chain], token_in: tin, token_out: tout, amount_in: fmt(amt, tin.decimals), best, price_out_per_in: price, quotes, found: !!best, note: best ? "exact-input single-hop quote at current state; excludes slippage/MEV" : "no Uniswap v3 single-hop pool with liquidity" });
  } catch (e) { return { status: 502, body: { error: "rpc failed", detail: String(e.message || e).slice(0, 160) } }; }
}
