// packb3 (2026-11-02): /v1/namesbatch, /v1/sentiment. Rebuilt by wave 2B after an accidental file clobber; $0 upstream (keyless RPC, alternative.me, CoinGecko public).
import { ens } from "./walletintel.js";
import { basename } from "./pack6.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const UA = { "user-agent": "BeggarBot/1.0 (+https://beggar-bot-demand.beggarbot.workers.dev/llms.txt)" };
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(x);
export async function namesbatch(a) {
  let L = a.addresses ?? a.address; if (typeof L === "string") L = L.split(/[\s,;]+/).filter(Boolean);
  if (!Array.isArray(L) || !L.length) return bad("addresses (array or comma list, <=25) required");
  if (L.length > 25) return bad("max 25 addresses"); const badA = L.filter((x) => !isA(String(x))); if (badA.length) return bad("invalid address: " + String(badA[0]).slice(0, 50));
  const nets = String(a.networks || "ethereum,base").toLowerCase(); const doE = /eth|ens/.test(nets), doB = /base/.test(nets);
  const out = [];
  for (let i = 0; i < L.length; i += 5) out.push(...await Promise.all(L.slice(i, i + 5).map(async (addr) => {
    const [e, b] = await Promise.all([doE ? ens({ address: addr }).catch(() => null) : null, doB ? basename({ address: addr }).catch(() => null) : null]);
    const eb = e && e.body || {}, bb = b && b.body || {};
    const ensName = eb.primary_name && eb.forward_verified ? eb.primary_name : null, ensUnv = eb.primary_name && !eb.forward_verified ? eb.primary_name : null;
    const bn = bb.primary_name ?? bb.name ?? null, bnOk = bn && (bb.forward_verified ?? true);
    return { address: addr, ens: ensName, ens_unverified: ensUnv, basename: bnOk ? bn : null, basename_unverified: bn && !bnOk ? bn : null, display_name: ensName || (bnOk ? bn : null) || `${addr.slice(0, 6)}…${addr.slice(-4)}`, errors: [eb.rpc_error, bb.rpc_error, bb.error].filter(Boolean) };
  })));
  return ok({ count: out.length, named: out.filter((x) => x.ens || x.basename).length, networks: [doE && "ethereum", doB && "base"].filter(Boolean), results: out, note: "only forward-verified names are put in ens/basename/display_name" });
}
const regime = (v) => (v <= 24 ? "extreme_fear" : v <= 44 ? "fear" : v <= 55 ? "neutral" : v <= 75 ? "greed" : "extreme_greed");
export async function sentiment(a) {
  const days = Math.min(90, Math.max(1, Math.floor(Number(a.days) || 7)));
  const gj = async (u) => { const r = await fetch(u, { headers: { ...UA, accept: "application/json" }, signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error("http " + r.status); return r.json(); };
  const [fg, gl] = await Promise.allSettled([gj(`https://api.alternative.me/fng/?limit=${days}`), gj("https://api.coingecko.com/api/v3/global")]);
  if (fg.status !== "fulfilled" && gl.status !== "fulfilled") return { status: 502, body: { error: "sentiment upstreams failed" } };
  let fear = null; if (fg.status === "fulfilled") { const h = (fg.value.data || []).map((d) => ({ value: Number(d.value), label: d.value_classification, date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10) }));
    const now = h[0], avg = h.length ? Math.round(h.reduce((s, x) => s + x.value, 0) / h.length) : null, old = h[h.length - 1];
    fear = { now: now?.value ?? null, label: now?.label ?? null, regime: now ? regime(now.value) : null, avg_period: avg, change_period: now && old ? now.value - old.value : null, trend: now && old ? (now.value - old.value > 5 ? "rising" : now.value - old.value < -5 ? "falling" : "flat") : null, history: h }; }
  let market = null; if (gl.status === "fulfilled") { const d = gl.value.data || {}; const mc = d.total_market_cap?.usd ?? null, pct = d.market_cap_percentage || {};
    market = { total_market_cap_usd: mc, total_volume_usd: d.total_volume?.usd ?? null, market_cap_change_24h_pct: d.market_cap_change_percentage_24h_usd ?? null, btc_dominance_pct: pct.btc ?? null, eth_dominance_pct: pct.eth ?? null, stablecoin_share_pct: ["usdt", "usdc", "dai", "usde", "fdusd", "usds"].reduce((s, k) => s + (pct[k] || 0), 0) || null, active_cryptocurrencies: d.active_cryptocurrencies ?? null }; }
  return ok({ fear_greed: fear, market, sources: ["alternative.me fng", "coingecko /global"], errors: [fg, gl].filter((x) => x.status !== "fulfilled").map((x) => String(x.reason?.message || x.reason).slice(0, 100)), fetched_at: new Date().toISOString() });
}
