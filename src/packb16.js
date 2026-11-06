// packb16 (builder B, 2026-11-02): sanctioned, usdtblacklist, lpposition, rpchealth. $0 upstream (keyless RPCs, on-chain Chainalysis oracle).
import { rpcBatch, RPCS } from "./walletintel.js";
import { ARCH, chainOf } from "./packb10.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const word = (h, i) => (h && h.length >= 2 + 64 * (i + 1) ? BigInt("0x" + h.slice(2 + 64 * i, 2 + 64 * (i + 1))) : null);
const sgn = (w, bits) => { const m = 1n << BigInt(bits); w = w & (m - 1n); return Number(w >= m / 2n ? w - m : w); };
const addrW = (h, i) => "0x" + h.slice(2 + 64 * i + 24, 2 + 64 * (i + 1));
const list = (s, n) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, n);
const DEF = "ethereum,base,optimism,arbitrum,polygon";

const ORACLE = "0x40C57923924B5c5c5455c48D93317139ADDaC8fb";
export async function sanctioned(a) {
  const addrs = list(a.address || a.addresses, 20); if (!addrs.length || !addrs.every(isA)) return bad("address (csv up to 20) required");
  const cs = list(a.chains || DEF, 6).map((c) => chainOf(c, RPCS)).filter(Boolean);
  const out = await Promise.all(cs.map(async (c) => { try { const { results: R } = await rpcBatch(c, [["eth_getCode", [ORACLE, "latest"]], ...addrs.map((x) => ["eth_call", [{ to: ORACLE, data: "0xdf592f7d" + pad(x) }, "latest"]])]); if (!R[0] || R[0] === "0x") return { chain: c, oracle: false }; return { chain: c, oracle: true, sanctioned: Object.fromEntries(addrs.map((x, i) => [x, R[i + 1] ? big(R[i + 1]) === 1n : null])) }; } catch (e) { return { chain: c, error: String(e.message || e) }; } }));
  const flagged = addrs.filter((x) => out.some((o) => o.sanctioned && o.sanctioned[x]));
  return ok({ addresses: addrs, flagged, clear: flagged.length === 0, chains: out, source: "Chainalysis on-chain sanctions oracle (OFAC SDN crypto addresses)", oracle: ORACLE });
}

const USDT = { ethereum: ["0xdAC17F958D2ee523a2206206994597C13D831ec7", "0xe47d166c"], arbitrum: ["0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "0xfe575a87"], optimism: ["0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "0xfe575a87"], polygon: ["0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "0xfe575a87"] };
export async function usdtblacklist(a) {
  const addrs = list(a.address || a.addresses, 10); if (!addrs.length || !addrs.every(isA)) return bad("address (csv up to 10) required");
  const cs = list(a.chains || "ethereum,arbitrum,optimism,polygon", 4).map((c) => chainOf(c, USDT)).filter(Boolean);
  const out = await Promise.all(cs.map(async (c) => { const [t, s] = USDT[c]; try { const { results: R } = await rpcBatch(c, addrs.flatMap((x) => [["eth_call", [{ to: t, data: s + pad(x) }, "latest"]], ["eth_call", [{ to: t, data: (s === "0xe47d166c" ? "0x59bf1abe" : "0xe47d166c") + pad(x) }, "latest"]]])); return { chain: c, usdt: t, blacklisted: Object.fromEntries(addrs.map((x, i) => { const v = [R[2 * i], R[2 * i + 1]].filter((r) => r && r !== "0x"); return [x, v.length ? v.some((r) => big(r) === 1n) : null]; })) }; } catch (e) { return { chain: c, error: String(e.message || e) }; } }));
  const flagged = addrs.filter((x) => out.some((o) => o.blacklisted && o.blacklisted[x]));
  return ok({ addresses: addrs, flagged, can_receive_usdt: flagged.length === 0, chains: out, source: "Tether USDT isBlackListed/getBlackListStatus" });
}

const NPM = { ethereum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", optimism: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", arbitrum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", polygon: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", base: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" };
const FAC = { ethereum: "0x1F98431c8aD98523631AE4a59f267346ea31F984", optimism: "0x1F98431c8aD98523631AE4a59f267346ea31F984", arbitrum: "0x1F98431c8aD98523631AE4a59f267346ea31F984", polygon: "0x1F98431c8aD98523631AE4a59f267346ea31F984", base: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" };
const sym = async (c, ts) => { const { results } = await rpcBatch(c, ts.flatMap((t) => [["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]]])); return ts.map((t, i) => { const h = results[2 * i]; let s = null; try { if (h && h.length > 130) { const l = parseInt(h.slice(66, 130), 16); s = Buffer.from(h.slice(130, 130 + l * 2), "hex").toString(); } else if (h) s = Buffer.from(h.slice(2), "hex").toString().replace(/\0/g, ""); } catch {} return { address: t, symbol: s, decimals: Number(big(results[2 * i + 1])) }; }); };
export async function lpposition(a) {
  const c = chainOf(a.chain, NPM); if (!c) return bad("chain: base|ethereum|optimism|arbitrum|polygon"); const id = String(a.id ?? a.token_id ?? ""); if (!/^\d+$/.test(id)) return bad("id (Uniswap v3 position tokenId) required");
  try {
    const tid = pad(BigInt(id).toString(16)); const { results: [p, own] } = await rpcBatch(c, [["eth_call", [{ to: NPM[c], data: "0x99fbab88" + tid }, "latest"]], ["eth_call", [{ to: NPM[c], data: "0x6352211e" + tid }, "latest"]]]);
    if (!p || p.length < 2 + 64 * 12) return ok({ chain: c, id, exists: false, note: "burned or invalid tokenId" });
    const t0 = addrW(p, 2), t1 = addrW(p, 3), fee = Number(word(p, 4)), tl = sgn(word(p, 5), 24), tu = sgn(word(p, 6), 24), liq = word(p, 7);
    const { results: [pool] } = await rpcBatch(c, [["eth_call", [{ to: FAC[c], data: "0x1698ee82" + pad(t0) + pad(t1) + pad(fee.toString(16)) }, "latest"]]]); const pa = pool ? addrW(pool, 0) : null;
    const [{ results: [s0] }, toks] = await Promise.all([rpcBatch(c, [["eth_call", [{ to: pa, data: "0x3850c7bd" }, "latest"]]]), sym(c, [t0, t1])]);
    const tick = s0 ? sgn(word(s0, 1), 24) : null; const sp = s0 ? Number(word(s0, 0)) / 2 ** 96 : null;
    let amt0 = null, amt1 = null; if (sp && liq != null) { const L = Number(liq), sa = Math.sqrt(1.0001 ** tl), sb = Math.sqrt(1.0001 ** tu), s = Math.min(Math.max(sp, sa), sb); amt0 = L * (sb - s) / (s * sb) / 10 ** toks[0].decimals; amt1 = L * (s - sa) / 10 ** toks[1].decimals; }
    const price = sp ? sp * sp * 10 ** (toks[0].decimals - toks[1].decimals) : null;
    return ok({ chain: c, id, exists: true, owner: own ? addrW(own, 0) : null, pool: pa, token0: toks[0], token1: toks[1], fee_tier_bps: fee / 100, tick_lower: tl, tick_upper: tu, current_tick: tick, in_range: tick != null ? tick >= tl && tick < tu : null, liquidity: liq?.toString(), amount0: amt0, amount1: amt1, price_token1_per_token0: price, uncollected_owed0_raw: word(p, 10)?.toString(), uncollected_owed1_raw: word(p, 11)?.toString(), closed: liq === 0n });
  } catch (e) { return err(e); }
}

const PUB = { base: [...new Set([...RPCS.base, ...ARCH.base, "https://base.llamarpc.com", "https://1rpc.io/base"])], ethereum: [...new Set([...RPCS.ethereum, "https://eth.llamarpc.com", "https://rpc.flashbots.net"])], optimism: [...new Set([...RPCS.optimism, ...ARCH.optimism, "https://mainnet.optimism.io"])], arbitrum: [...RPCS.arbitrum, "https://arb1.arbitrum.io/rpc", "https://arbitrum.drpc.org"], polygon: [...new Set([...RPCS.polygon, ...ARCH.polygon, "https://polygon-rpc.com"])], "base-sepolia": [...RPCS["base-sepolia"], "https://base-sepolia-rpc.publicnode.com"] };
export async function rpchealth(a) {
  const cs = list(a.chains || "base,ethereum,optimism,arbitrum,polygon", 6).map((c) => chainOf(c, PUB)).filter(Boolean); if (!cs.length) return bad("chains: base|ethereum|optimism|arbitrum|polygon|base-sepolia");
  const out = await Promise.all(cs.map(async (c) => { const eps = await Promise.all(PUB[c].map(async (u) => { const t = Date.now(); try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }), signal: AbortSignal.timeout(4000) }); const j = await r.json(); return { rpc: new URL(u).host, ok: !!j.result, block: j.result ? Number(BigInt(j.result)) : null, latency_ms: Date.now() - t }; } catch (e) { return { rpc: new URL(u).host, ok: false, error: String(e.message || e).slice(0, 80), latency_ms: Date.now() - t }; } }));
    const head = Math.max(...eps.filter((e) => e.ok).map((e) => e.block), 0); eps.forEach((e) => { if (e.ok) e.lag_blocks = head - e.block; });
    const good = eps.filter((e) => e.ok && e.lag_blocks <= 2).sort((x, y) => x.latency_ms - y.latency_ms); return { chain: c, head_block: head || null, healthy: good.length, total: eps.length, best_rpc: good[0]?.rpc || null, endpoints: eps }; }));
  return ok({ chains: out, checked_at: new Date().toISOString() });
}
