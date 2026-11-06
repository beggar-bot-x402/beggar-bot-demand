// packb6 (builder B, 2026-11-02): verified, fnsig, hacks, trending. $0 upstream (Sourcify, openchain, DefiLlama, CoinGecko public).
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const gj = async (u, t = 10000) => { const r = await fetch(u, { headers: { accept: "application/json", "user-agent": "BeggarBot/1.0" }, signal: AbortSignal.timeout(t) }); return { status: r.status, j: await r.json().catch(() => null) }; };
const CID = { base: 8453, ethereum: 1, eth: 1, mainnet: 1, optimism: 10, op: 10, arbitrum: 42161, arb: 42161, polygon: 137, "base-sepolia": 84532 };

export async function verified(a) {
  const ad = String(a.address || a.contract || ""); if (!/^0x[0-9a-fA-F]{40}$/.test(ad)) return bad("address (0x contract) required");
  const s = String(a.chain ?? "base").toLowerCase(); const id = /^\d+$/.test(s) ? Number(s) : CID[s]; if (!id) return bad("unsupported chain");
  let r; try { r = await gj(`https://sourcify.dev/server/v2/contract/${id}/${ad}?fields=compilation,proxyResolution,abi,deployment`); } catch { return { status: 502, body: { error: "sourcify unavailable" } }; }
  if (r.status === 404) return ok({ address: ad, chain_id: id, verified: false, match: null, risk_flags: ["source_not_verified_on_sourcify"], source: "sourcify.dev" });
  if (r.status !== 200 || !r.j) return { status: 502, body: { error: "sourcify http " + r.status } };
  const j = r.j, abi = Array.isArray(j.abi) ? j.abi : []; const fns = abi.filter((x) => x.type === "function");
  const danger = fns.map((f) => f.name).filter((n) => /^(mint|pause|blacklist|addBlackList|setFee|setTax|upgradeTo|upgradeToAndCall|transferOwnership|withdrawAll|rescue|setBlacklist)/i.test(n));
  const pr = j.proxyResolution || {};
  return ok({ address: ad, chain_id: id, verified: true, match: j.match, runtime_match: j.runtimeMatch, verified_at: j.verifiedAt, contract_name: j.compilation?.name, compiler: j.compilation?.compilerVersion, language: j.compilation?.language, optimizer: j.compilation?.compilerSettings?.optimizer, is_proxy: !!pr.isProxy, proxy_type: pr.proxyType || null, implementations: (pr.implementations || []).map((x) => x.address), deployer: j.deployment?.deployer || null, deploy_tx: j.deployment?.transactionHash || null, function_count: fns.length, privileged_functions: [...new Set(danger)], events: abi.filter((x) => x.type === "event").map((x) => x.name).slice(0, 40), source: "sourcify.dev" });
}

export async function fnsig(a) {
  const sp = (v) => (Array.isArray(v) ? v : String(v || "").split(/[\s,;]+/)).filter(Boolean).map((x) => x.toLowerCase());
  const f = sp(a.selectors ?? a.selector ?? a.function), e = sp(a.events ?? a.topic ?? a.event);
  if (!f.length && !e.length) return bad("selectors (0x + 8 hex) and/or events (0x + 64 hex) required");
  if (f.length + e.length > 30) return bad("max 30 items");
  if (f.some((x) => !/^0x[0-9a-f]{8}$/.test(x)) || e.some((x) => !/^0x[0-9a-f]{64}$/.test(x))) return bad("bad selector/topic format");
  let r; try { r = await gj("https://api.openchain.xyz/signature-database/v1/lookup?" + [f.length && "function=" + f.join(","), e.length && "event=" + e.join(","), "filter=true"].filter(Boolean).join("&")); } catch { return { status: 502, body: { error: "signature db unavailable" } }; }
  if (!r.j || !r.j.ok) return { status: 502, body: { error: "signature db error" } };
  const map = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, { best: (v || [])[0]?.name || null, candidates: (v || []).map((x) => x.name).slice(0, 5), collision: (v || []).length > 1 }]));
  return ok({ functions: map(r.j.result.function), events: map(r.j.result.event), source: "openchain.xyz" });
}

export async function hacks(a) {
  let r; try { r = await gj("https://api.llama.fi/hacks", 12000); } catch { return { status: 502, body: { error: "defillama hacks unavailable" } }; }
  if (!Array.isArray(r.j)) return { status: 502, body: { error: "defillama hacks error" } };
  const q = String(a.protocol || a.q || "").toLowerCase(), ch = String(a.chain || "").toLowerCase(), days = Math.min(3650, Math.max(1, Number(a.days) || 90));
  const since = Date.now() / 1000 - days * 86400;
  let L = r.j.filter((h) => (!q || h.name.toLowerCase().includes(q)) && (!ch || (h.chain || []).some((c) => c.toLowerCase() === ch)) && (q || h.date >= since));
  L.sort((x, y) => y.date - x.date);
  const tot = L.reduce((s, h) => s + (h.amount || 0), 0), tech = {}; for (const h of L) tech[h.technique] = (tech[h.technique] || 0) + 1;
  return ok({ query: q || null, chain: ch || null, window_days: q ? "all" : days, count: L.length, total_stolen_usd: Math.round(tot), top_techniques: Object.entries(tech).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t, n]) => ({ technique: t, count: n })), incidents: L.slice(0, Math.min(50, Number(a.limit) || 20)).map((h) => ({ date: new Date(h.date * 1000).toISOString().slice(0, 10), name: h.name, amount_usd: h.amount, chains: h.chain, technique: h.technique, classification: h.classification, bridge: h.bridgeHack, returned_usd: h.returnedFunds || null, source: h.source || null })), source: "defillama hacks" });
}

export async function trending() {
  let r; try { r = await gj("https://api.coingecko.com/api/v3/search/trending", 8000); } catch { return { status: 502, body: { error: "coingecko unavailable" } }; }
  if (!r.j || !r.j.coins) return { status: 502, body: { error: "coingecko http " + r.status } };
  const coins = r.j.coins.map(({ item: c }) => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank, price_usd: c.data?.price ?? null, change_24h_pct: c.data?.price_change_percentage_24h?.usd != null ? +c.data.price_change_percentage_24h.usd.toFixed(2) : null, market_cap: c.data?.market_cap || null, volume_24h: c.data?.total_volume || null, low_cap: !c.market_cap_rank || c.market_cap_rank > 500 }));
  return ok({ as_of: new Date().toISOString(), coins, categories: (r.j.categories || []).slice(0, 6).map((c) => ({ name: c.name, change_1h_pct: c.data?.market_cap_change_percentage_24h?.usd ?? null })), nfts: (r.j.nfts || []).slice(0, 5).map((n) => ({ name: n.name, symbol: n.symbol, floor: n.data?.floor_price || null })), source: "coingecko trending" });
}
