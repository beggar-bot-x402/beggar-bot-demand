// pack16: Base on-chain pulse via keyless logs — x402pulse, whalemoves, newpools, poolswaps
import { keccakHex } from "./evm.js";
const R = (status, body) => ({ status, body });
const RPCS = ["https://base-rpc.publicnode.com", "https://mainnet.base.org"];
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const AUTH_USED = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
const SWAP = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67";
const FACT = [
  { dex: "uniswap-v3", addr: "0x33128a8fc17869897dce68ed026d694621f6fdfd", topic: "0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118", pool: (l) => "0x" + l.data.slice(2 + 64 + 24, 2 + 128), extra: (l) => ({ fee_bps: parseInt(l.topics[3], 16) / 100 }) },
  { dex: "aerodrome-v2", addr: "0x420dd381b31aef6683db6b902084cb0ffece40da", topic: keccakHex("PoolCreated(address,address,bool,address,uint256)"), pool: (l) => "0x" + l.data.slice(26, 66), extra: (l) => ({ stable: parseInt(l.topics[3], 16) === 1 }) },
  { dex: "aerodrome-slipstream", addr: "0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a", topic: keccakHex("PoolCreated(address,address,int24,address)"), pool: (l) => "0x" + l.data.slice(26, 66), extra: (l) => ({ tick_spacing: Number(BigInt.asIntN(24, BigInt(l.topics[3]))) }) },
];
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const un = (t) => "0x" + t.slice(26);
async function rpc(method, params) { let last; for (const u of RPCS) { for (let k = 0; k < 2; k++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); if (/limit/i.test(j.error.message)) { await new Promise((z) => setTimeout(z, 1000)); continue; } break; } return j.result; } catch (e) { last = e; } } } throw last || new Error("rpc failed"); }
async function batch(calls) { const r = await fetch(RPCS[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: c[0], params: c[1] }))), signal: AbortSignal.timeout(15000) }); const j = await r.json(); return (Array.isArray(j) ? j : []).sort((a, b) => a.id - b.id).map((x) => x.result); }
async function range(minutes, maxMin, chunk) { const tip = parseInt(await rpc("eth_blockNumber", []), 16); const m = Math.max(1, Math.min(maxMin, parseFloat(minutes) || 10)); const n = Math.ceil(m * 30); const cs = []; for (let to = tip, left = n; left > 0; ) { const k = Math.min(chunk, left); cs.push([to - k + 1, to]); to -= k; left -= k; } return { tip, minutes: m, blocks: n, chunks: cs }; }
async function logs(filter, cs) { const out = []; for (const [f, t] of cs) out.push(...(await rpc("eth_getLogs", [{ ...filter, fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }]))); return out; }
const decStr = (h) => { if (!h || h === "0x") return null; try { if (h.length === 66) return new TextDecoder().decode(Uint8Array.from(h.slice(2).match(/../g), (x) => parseInt(x, 16))).replace(/\0/g, "") || null; const len = parseInt(h.slice(66, 130), 16); return new TextDecoder().decode(Uint8Array.from(h.slice(130, 130 + len * 2).match(/../g) || [], (x) => parseInt(x, 16))); } catch { return null; } };
async function meta(tokens) { const u = [...new Set(tokens)]; if (!u.length) return {}; const r = await batch(u.flatMap((t) => [["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]]])).catch(() => []); const o = {}; u.forEach((t, i) => { o[t] = { symbol: decStr(r[2 * i]), decimals: r[2 * i + 1] && r[2 * i + 1] !== "0x" ? parseInt(r[2 * i + 1], 16) : 18 }; }); return o; }
const err = (e) => R(502, { error: String(e.message || e).slice(0, 200) });

export async function x402pulse(a) {
  try {
    const g = await range(a.minutes || 10, 60, 450); const A = await logs({ address: USDC, topics: [AUTH_USED] }, g.chunks);
    const txs = [...new Set(A.map((l) => l.transactionHash))]; const payers = new Set(A.map((l) => un(l.topics[1])));
    const sample = txs.slice(-60); const rcs = await batch(sample.map((h) => ["eth_getTransactionReceipt", [h]])).catch(() => []);
    const fac = {}, payees = {}, amt = {}; let vol = 0, n = 0;
    for (const rc of rcs) { if (!rc) continue; fac[rc.from] = (fac[rc.from] || 0) + 1; const auth = new Set(rc.logs.filter((l) => l.topics[0] === AUTH_USED).map((l) => un(l.topics[1]))); for (const l of rc.logs) if (l.topics[0] === TRANSFER && l.address.toLowerCase() === USDC && l.topics.length === 3 && auth.has(un(l.topics[1]))) { const v = Number(BigInt(l.data)) / 1e6; vol += v; n++; payees[un(l.topics[2])] = (payees[un(l.topics[2])] || 0) + 1; amt[v] = (amt[v] || 0) + 1; } }
    const top = (o, k) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([key, v]) => ({ [k]: key, count: v }));
    return R(200, { chain: "base", minutes: g.minutes, blocks: g.blocks, to_block: g.tip, eip3009_authorizations: A.length, per_minute: +(A.length / g.minutes).toFixed(1), settlement_txs: txs.length, unique_payers: payers.size,
      sample: { txs: rcs.filter(Boolean).length, transfers: n, usdc_volume: +vol.toFixed(6), avg_usdc: n ? +(vol / n).toFixed(6) : null, top_facilitators: top(fac, "address"), top_payees: top(payees, "payto"), price_points: Object.entries(amt).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([usd, c]) => ({ usd: +usd, count: c })) },
      note: "EIP-3009 authorizations on Base USDC ≈ x402 + gasless payments; facilitator/payee stats from latest ≤60 txs" });
  } catch (e) { return err(e); }
}

export async function whalemoves(a) {
  const tok = a.token ? String(a.token).toLowerCase() : USDC; if (!ADDR.test(tok)) return R(400, { error: "token must be 0x address" });
  try {
    const g = await range(a.minutes || 10, 30, 300); const md = (await meta([tok]))[tok] || { decimals: 6 }; const d = 10 ** md.decimals; const min = parseFloat(a.min || (tok === USDC ? "100000" : "0")) || 0;
    const L = await logs({ address: tok, topics: [TRANSFER] }, g.chunks);
    const big = L.filter((l) => l.topics.length === 3 && l.data.length > 2).map((l) => ({ tx: l.transactionHash, block: parseInt(l.blockNumber, 16), from: un(l.topics[1]), to: un(l.topics[2]), amount: Number(BigInt(l.data)) / d })).filter((x) => x.amount >= min).sort((x, y) => y.amount - x.amount);
    const lim = Math.max(1, Math.min(100, parseInt(a.limit || "25", 10) || 25));
    return R(200, { chain: "base", token: tok, symbol: md.symbol, minutes: g.minutes, to_block: g.tip, transfers_scanned: L.length, threshold: min, whale_count: big.length, whale_volume: +big.reduce((s, x) => s + x.amount, 0).toFixed(2),
      mints: big.filter((x) => /^0x0{40}$/.test(x.from)).length, burns: big.filter((x) => /^0x0{40}$/.test(x.to)).length, moves: big.slice(0, lim) });
  } catch (e) { return err(e); }
}

export async function newpools(a) {
  try {
    const g = await range((parseFloat(a.hours || "1") || 1) * 60, 360, 9000); const ls = [];
    for (const f of FACT) for (const l of await logs({ address: f.addr, topics: [f.topic] }, g.chunks)) ls.push({ f, l });
    const md = await meta(ls.flatMap(({ l }) => [un(l.topics[1]), un(l.topics[2])]).slice(0, 80));
    const pools = ls.map(({ f, l }) => { const t0 = un(l.topics[1]), t1 = un(l.topics[2]); return { dex: f.dex, pool: f.pool(l), block: parseInt(l.blockNumber, 16), tx: l.transactionHash, token0: { address: t0, symbol: md[t0]?.symbol ?? null }, token1: { address: t1, symbol: md[t1]?.symbol ?? null }, ...f.extra(l) }; }).sort((x, y) => y.block - x.block);
    const QUOTE = new Set([USDC, "0x4200000000000000000000000000000000000006", "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf"]);
    return R(200, { chain: "base", hours: +(g.minutes / 60).toFixed(2), to_block: g.tip, count: pools.length, by_dex: Object.fromEntries(FACT.map((f) => [f.dex, pools.filter((p) => p.dex === f.dex).length])),
      new_token_pairs: pools.filter((p) => QUOTE.has(p.token0.address) !== QUOTE.has(p.token1.address)).length, pools: pools.slice(0, Math.max(1, Math.min(100, parseInt(a.limit || "40", 10) || 40))), warning: "brand-new pools are high risk; check /v1/tokensafety before trading" });
  } catch (e) { return err(e); }
}

export async function poolswaps(a) {
  const p = String(a.pool || "").toLowerCase(); if (!ADDR.test(p)) return R(400, { error: "pool (0x Uniswap v3 / Aerodrome Slipstream pool) required" });
  try {
    const [t0r, t1r] = await batch([["eth_call", [{ to: p, data: "0x0dfe1681" }, "latest"]], ["eth_call", [{ to: p, data: "0xd21220a7" }, "latest"]]]); if (!t0r || t0r === "0x") return R(400, { error: "not a v3-style pool" });
    const t0 = un(t0r), t1 = un(t1r); const md = await meta([t0, t1]); const g = await range(a.minutes || 60, 360, 9000);
    const L = await logs({ address: p, topics: [SWAP] }, g.chunks); const d0 = 10 ** md[t0].decimals, d1 = 10 ** md[t1].decimals;
    const sw = L.map((l) => { const w = l.data.slice(2); const a0 = Number(BigInt.asIntN(256, BigInt("0x" + w.slice(0, 64)))) / d0, a1 = Number(BigInt.asIntN(256, BigInt("0x" + w.slice(64, 128)))) / d1; return { tx: l.transactionHash, block: parseInt(l.blockNumber, 16), recipient: un(l.topics[2]), amount0: a0, amount1: a1, side: a0 < 0 ? `buy ${md[t0].symbol}` : `sell ${md[t0].symbol}`, price_t1_per_t0: a0 ? Math.abs(a1 / a0) : null }; });
    const buys = sw.filter((s) => s.amount0 < 0), sells = sw.filter((s) => s.amount0 > 0); const v1 = (xs) => +xs.reduce((s, x) => s + Math.abs(x.amount1), 0).toFixed(6);
    const traders = {}; for (const s of sw) traders[s.recipient] = (traders[s.recipient] || 0) + Math.abs(s.amount1);
    return R(200, { chain: "base", pool: p, token0: { address: t0, ...md[t0] }, token1: { address: t1, ...md[t1] }, minutes: g.minutes, swaps: sw.length, buys: buys.length, sells: sells.length,
      buy_volume_token1: v1(buys), sell_volume_token1: v1(sells), net_flow_token1: +(v1(buys) - v1(sells)).toFixed(6), last_price_t1_per_t0: sw.at(-1)?.price_t1_per_t0 ?? null, first_price_t1_per_t0: sw[0]?.price_t1_per_t0 ?? null,
      top_recipients: Object.entries(traders).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([address, v]) => ({ address, volume_token1: +v.toFixed(6) })), largest: [...sw].sort((x, y) => Math.abs(y.amount1) - Math.abs(x.amount1)).slice(0, 10) });
  } catch (e) { return err(e); }
}
