// packb5 (builder B, 2026-11-02): chaininfo, tokenlist, gascompare. $0 upstream (chainid.network, CoinGecko/Optimism token lists, keyless RPC).
import { rpcBatch, RPCS } from "./walletintel.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const gj = async (u, t = 10000) => { const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(t) }); if (!r.ok) throw new Error("http " + r.status); return r.json(); };

// 1. chaininfo
export async function chaininfo(a) {
  const q = String(a.chain ?? a.chain_id ?? a.q ?? "").trim().toLowerCase(); if (!q) return bad("chain (id, name or shortName) required");
  let L; try { L = await gj("https://chainid.network/chains.json"); } catch (e) { return { status: 502, body: { error: "chainid.network unavailable" } }; }
  const id = /^(eip155:)?\d+$/.test(q) ? Number(q.replace("eip155:", "")) : null;
  let hits = id != null ? L.filter((c) => c.chainId === id) : L.filter((c) => c.shortName?.toLowerCase() === q || c.name.toLowerCase() === q);
  if (!hits.length && id == null) hits = L.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 5);
  if (!hits.length) return { status: 404, body: { error: "chain not found" } };
  const out = hits.slice(0, 5).map((c) => ({ chain_id: c.chainId, caip2: `eip155:${c.chainId}`, name: c.name, short_name: c.shortName, native_currency: c.nativeCurrency, testnet: /test|sepolia|goerli|holesky|devnet/i.test(c.name), public_rpcs: (c.rpc || []).filter((u) => u.startsWith("https://") && !u.includes("${")).slice(0, 8), explorers: (c.explorers || []).map((e) => ({ name: e.name, url: e.url, standard: e.standard })), info_url: c.infoURL, parent: c.parent || null, deprecated: c.status === "deprecated" }));
  return ok({ query: q, count: out.length, chains: out, source: "chainid.network" });
}

// 2. tokenlist
const LISTS = { ethereum: ["https://tokens.coingecko.com/ethereum/all.json"], base: ["https://tokens.coingecko.com/base/all.json", "https://static.optimism.io/optimism.tokenlist.json"], optimism: ["https://tokens.coingecko.com/optimistic-ethereum/all.json", "https://static.optimism.io/optimism.tokenlist.json"], arbitrum: ["https://tokens.coingecko.com/arbitrum-one/all.json"], polygon: ["https://tokens.coingecko.com/polygon-pos/all.json"] };
const CID = { ethereum: 1, base: 8453, optimism: 10, arbitrum: 42161, polygon: 137 };
const AL = { "1": "ethereum", eth: "ethereum", "8453": "base", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
export async function tokenlist(a) {
  const c = (() => { const s = String(a.chain ?? "base").toLowerCase(); return LISTS[s] ? s : AL[s]; })(); if (!c) return bad("chain must be base|ethereum|optimism|arbitrum|polygon");
  const addr = a.token || a.address ? String(a.token || a.address).toLowerCase() : null, sym = a.symbol ? String(a.symbol).toUpperCase() : null;
  if (!addr && !sym) return bad("token (0x address) or symbol required"); if (addr && !/^0x[0-9a-f]{40}$/.test(addr)) return bad("invalid token address");
  const res = await Promise.allSettled(LISTS[c].map((u) => gj(u, 12000)));
  const lists = res.map((r, i) => r.status === "fulfilled" ? { url: LISTS[c][i], name: r.value.name, tokens: (r.value.tokens || []).filter((t) => t.chainId === CID[c]) } : null).filter(Boolean);
  if (!lists.length) return { status: 502, body: { error: "token lists unavailable" } };
  const found = [], same = new Map();
  for (const l of lists) for (const t of l.tokens) { const ta = t.address.toLowerCase();
    if (addr && ta === addr) found.push({ list: l.name, symbol: t.symbol, name: t.name, decimals: t.decimals, logo: t.logoURI || null });
    const s = sym || (addr && found[0] && found[0].symbol.toUpperCase()); if (s && t.symbol.toUpperCase() === s) same.set(ta, { address: t.address, name: t.name, list: l.name }); }
  const symbol = sym || (found[0] && found[0].symbol) || null; const others = [...same.values()].filter((x) => x.address.toLowerCase() !== addr);
  const verdict = addr ? (found.length ? (others.length ? "listed_but_symbol_shared" : "listed") : "not_on_major_lists") : (same.size ? "symbol_found" : "symbol_not_listed");
  return ok({ chain: c, token: addr, symbol, listed: addr ? found.length > 0 : null, listed_on: found, verdict, same_symbol_tokens: others.slice(0, 10), same_symbol_count: others.length, lists_checked: lists.map((l) => ({ name: l.name, tokens: l.tokens.length })), note: "not_on_major_lists is a scam/impostor signal, not proof" });
}

// 3. gascompare
export async function gascompare(a) {
  const chains = String(a.chains || "ethereum,base,optimism,arbitrum,polygon").toLowerCase().split(/[\s,]+/).map((s) => (RPCS[s] ? s : AL[s])).filter((s) => s && s !== "base-sepolia");
  if (!chains.length) return bad("no supported chains"); const gas = Math.min(30e6, Math.max(21000, Number(a.gas) || 21000));
  let px = {}; try { const p = await gj("https://coins.llama.fi/prices/current/coingecko:ethereum,coingecko:polygon-ecosystem-token", 6000); px = { eth: p.coins["coingecko:ethereum"]?.price, pol: p.coins["coingecko:polygon-ecosystem-token"]?.price }; } catch {}
  const rows = await Promise.all([...new Set(chains)].map(async (c) => { try { const r = await rpcBatch(c, [["eth_gasPrice", []], ["eth_maxPriorityFeePerGas", []], ["eth_blockNumber", []]]);
    const gp = Number(BigInt(r.results[0] || "0x0")) / 1e9, tip = r.results[1] ? Number(BigInt(r.results[1])) / 1e9 : null; const usdPx = c === "polygon" ? px.pol : px.eth;
    const costNative = (gp * gas) / 1e9; return { chain: c, gas_price_gwei: +gp.toFixed(6), priority_fee_gwei: tip, block: Number(BigInt(r.results[2] || "0x0")), cost_native: +costNative.toPrecision(6), cost_usd: usdPx ? +(costNative * usdPx).toFixed(6) : null, note: ["base", "optimism"].includes(c) ? "excludes L1 data fee" : undefined };
  } catch (e) { return { chain: c, error: String(e.message).slice(0, 80) }; } }));
  const okr = rows.filter((r) => r.cost_usd != null).sort((x, y) => x.cost_usd - y.cost_usd);
  return ok({ gas_units: gas, prices_usd: px, cheapest: okr[0]?.chain || null, ranking: okr.map((r) => r.chain), chains: rows });
}
