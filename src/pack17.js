// pack17: Base on-chain feeds via keyless logs — nftmints, liquidations, bridgeflows, stablemint
import { keccakHex } from "./evm.js";
const R = (status, body) => ({ status, body });
const RPCS = ["https://base-rpc.publicnode.com", "https://mainnet.base.org"];
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const ZERO = "0x" + "0".repeat(64);
const AAVE = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5", MORPHO = "0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb", BRIDGE = "0x4200000000000000000000000000000000000010";
const T_AAVE = keccakHex("LiquidationCall(address,address,address,uint256,uint256,address,bool)");
const T_MORPHO = keccakHex("Liquidate(bytes32,address,address,uint256,uint256,uint256,uint256,uint256)");
const T_DEP = keccakHex("DepositFinalized(address,address,address,address,uint256,bytes)");
const T_WD = keccakHex("WithdrawalInitiated(address,address,address,address,uint256,bytes)");
const T_ETHIN = keccakHex("ETHBridgeFinalized(address,address,uint256,bytes)");
const T_ETHOUT = keccakHex("ETHBridgeInitiated(address,address,uint256,bytes)");
const STABLES = { USDC: ["0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", 6], USDbC: ["0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", 6], DAI: ["0x50c5725949a6f0c72e6c4a641f24049a917db0cb", 18], EURC: ["0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42", 6], USDS: ["0x820c137fa70c8691f0e44dc420a5e53c168921dc", 18], USDe: ["0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34", 18] };
const un = (t) => "0x" + t.slice(26);
const words = (d) => (d.slice(2).match(/.{64}/g) || []).map((w) => BigInt("0x" + w));
async function rpc(method, params, urls = RPCS) { let last; for (const u of urls) for (let k = 0; k < 2; k++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); if (/limit/i.test(j.error.message)) { await new Promise((z) => setTimeout(z, 1000)); continue; } break; } return j.result; } catch (e) { last = e; } } throw last || new Error("rpc failed"); }
async function batch(calls) { if (!calls.length) return []; const r = await fetch(RPCS[0], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map((c, i) => ({ jsonrpc: "2.0", id: i, method: c[0], params: c[1] }))), signal: AbortSignal.timeout(15000) }); const j = await r.json(); return (Array.isArray(j) ? j : []).sort((a, b) => a.id - b.id).map((x) => x.result); }
async function range(minutes, maxMin, chunk) { const tip = parseInt(await rpc("eth_blockNumber", []), 16); const m = Math.max(1, Math.min(maxMin, parseFloat(minutes) || 60)); const n = Math.ceil(m * 30); const cs = []; for (let to = tip, left = n; left > 0; ) { const k = Math.min(chunk, left); cs.push([to - k + 1, to]); to -= k; left -= k; } return { tip, minutes: m, chunks: cs }; }
async function logs(filter, cs, urls) { const out = []; for (const [f, t] of cs) out.push(...(await rpc("eth_getLogs", [{ ...filter, fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }], urls))); return out; }
const decStr = (h) => { if (!h || h === "0x") return null; try { const b = (s) => new TextDecoder().decode(Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16))); if (h.length === 66) return b(h.slice(2)).replace(/\0/g, "") || null; const len = parseInt(h.slice(66, 130), 16); return b(h.slice(130, 130 + len * 2)); } catch { return null; } };
async function meta(tokens) { const u = [...new Set(tokens)].slice(0, 40); const r = await batch(u.flatMap((t) => [["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t, data: "0x06fdde03" }, "latest"]]])).catch(() => []); const o = {}; u.forEach((t, i) => { const d = r[3 * i + 1]; o[t] = { symbol: decStr(r[3 * i]), name: decStr(r[3 * i + 2]), decimals: d && d !== "0x" ? parseInt(d, 16) : 18 }; }); return o; }
async function prices(addrs) { if (!addrs.length) return {}; try { const r = await fetch("https://coins.llama.fi/prices/current/" + addrs.map((a) => "base:" + a).join(","), { signal: AbortSignal.timeout(8000) }); const j = await r.json(); return Object.fromEntries(Object.entries(j.coins || {}).map(([k, v]) => [k.slice(5).toLowerCase(), v.price])); } catch { return {}; } }
const err = (e) => R(502, { error: String(e.message || e).slice(0, 200) });

export async function nftmints(a) {
  try {
    const g = await range(a.minutes || 5, 20, 50); const L = await logs({ topics: [TRANSFER, ZERO] }, g.chunks, ["https://base.drpc.org", "https://mainnet.base.org"]);
    const nft = L.filter((l) => l.topics.length === 4); const by = {};
    for (const l of nft) { const c = l.address.toLowerCase(); const x = (by[c] = by[c] || { mints: 0, minters: new Set(), txs: new Set(), first: Infinity, last: 0 }); x.mints++; x.minters.add(un(l.topics[2])); x.txs.add(l.transactionHash); const b = parseInt(l.blockNumber, 16); x.first = Math.min(x.first, b); x.last = Math.max(x.last, b); }
    const top = Object.entries(by).sort((p, q) => q[1].minters.size - p[1].minters.size || q[1].mints - p[1].mints).slice(0, Math.max(1, Math.min(50, parseInt(a.limit || "20", 10) || 20)));
    const md = await meta(top.map(([c]) => c));
    return R(200, { chain: "base", minutes: g.minutes, to_block: g.tip, nft_mints: nft.length, collections: Object.keys(by).length,
      trending: top.map(([c, x]) => ({ contract: c, name: md[c]?.name ?? null, symbol: md[c]?.symbol ?? null, mints: x.mints, unique_minters: x.minters.size, txs: x.txs.size, mints_per_minter: +(x.mints / x.minters.size).toFixed(2), bot_like: x.mints / x.minters.size > 20, first_block: x.first, last_block: x.last })) });
  } catch (e) { return err(e); }
}

export async function liquidations(a) {
  try {
    const g = await range((parseFloat(a.hours || "6") || 6) * 60, 1440, 9000);
    const [A, M] = [await logs({ address: AAVE, topics: [T_AAVE] }, g.chunks), await logs({ address: MORPHO, topics: [T_MORPHO] }, g.chunks)];
    const toks = A.flatMap((l) => [un(l.topics[1]), un(l.topics[2])]); const md = await meta(toks); const px = await prices([...new Set(toks)]);
    const aave = A.map((l) => { const [debt, coll, liq] = words(l.data); const c = un(l.topics[1]), d = un(l.topics[2]); const dv = Number(debt) / 10 ** (md[d]?.decimals ?? 18), cv = Number(coll) / 10 ** (md[c]?.decimals ?? 18);
      return { protocol: "aave-v3", tx: l.transactionHash, block: parseInt(l.blockNumber, 16), user: un(l.topics[3]), liquidator: "0x" + l.data.slice(2 + 64 * 2 + 24, 2 + 64 * 3), collateral: md[c]?.symbol || c, debt: md[d]?.symbol || d, debt_repaid: dv, collateral_seized: cv, debt_usd: px[d] ? +(dv * px[d]).toFixed(2) : null, collateral_usd: px[c] ? +(cv * px[c]).toFixed(2) : null }; });
    const morpho = M.map((l) => { const w = words(l.data); return { protocol: "morpho-blue", tx: l.transactionHash, block: parseInt(l.blockNumber, 16), market_id: l.topics[1], liquidator: un(l.topics[2]), user: un(l.topics[3]), repaid_assets_raw: w[0].toString(), seized_assets_raw: w[2].toString(), bad_debt_assets_raw: w[3].toString() }; });
    const all = [...aave, ...morpho].sort((x, y) => y.block - x.block); const liqs = {}; for (const x of all) liqs[x.liquidator] = (liqs[x.liquidator] || 0) + 1;
    return R(200, { chain: "base", hours: +(g.minutes / 60).toFixed(2), to_block: g.tip, count: all.length, aave_v3: aave.length, morpho_blue: morpho.length, aave_debt_repaid_usd: +aave.reduce((s, x) => s + (x.debt_usd || 0), 0).toFixed(2),
      morpho_bad_debt_events: morpho.filter((x) => x.bad_debt_assets_raw !== "0").length, top_liquidators: Object.entries(liqs).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([address, n]) => ({ address, count: n })), events: all.slice(0, Math.max(1, Math.min(100, parseInt(a.limit || "30", 10) || 30))) });
  } catch (e) { return err(e); }
}

export async function bridgeflows(a) {
  try {
    const g = await range((parseFloat(a.hours || "6") || 6) * 60, 1440, 9000);
    const L = await logs({ address: BRIDGE, topics: [[T_DEP, T_WD, T_ETHIN, T_ETHOUT]] }, g.chunks);
    const flows = {}; const acc = (k, dir, v) => { const x = (flows[k] = flows[k] || { in: 0, out: 0, n_in: 0, n_out: 0 }); x[dir] += v; x["n_" + dir]++; };
    const erc = L.filter((l) => l.topics[0] === T_DEP || l.topics[0] === T_WD); const md = await meta(erc.map((l) => un(l.topics[2]))); const px = await prices([...new Set(erc.map((l) => un(l.topics[2])))]);
    let ethIn = 0, ethOut = 0; const big = [];
    for (const l of L) { const t = l.topics[0]; if (t === T_ETHIN || t === T_ETHOUT) { const v = Number(words(l.data)[0]) / 1e18; if (t === T_ETHIN) ethIn += v; else ethOut += v; continue; } const tok = un(l.topics[2]); if (tok.startsWith("0xdeaddead")) continue; const m = md[tok] || { decimals: 18 }; const v = Number(words(l.data)[1]) / 10 ** m.decimals; const dir = t === T_DEP ? "in" : "out"; acc(m.symbol || tok, dir, v); if (px[tok] && v * px[tok] > 50000) big.push({ dir, token: m.symbol || tok, amount: v, usd: +(v * px[tok]).toFixed(0), from: un(l.topics[3]), tx: l.transactionHash }); }
    const ep = (await prices(["0x4200000000000000000000000000000000000006"]))["0x4200000000000000000000000000000000000006"];
    return R(200, { chain: "base", bridge: "OP Stack L2StandardBridge (canonical)", hours: +(g.minutes / 60).toFixed(2), to_block: g.tip, events: L.length,
      eth: { in: +ethIn.toFixed(4), out: +ethOut.toFixed(4), net: +(ethIn - ethOut).toFixed(4), net_usd: ep ? +((ethIn - ethOut) * ep).toFixed(0) : null },
      tokens: Object.entries(flows).map(([token, x]) => ({ token, in: +x.in.toFixed(4), out: +x.out.toFixed(4), net: +(x.in - x.out).toFixed(4), deposits: x.n_in, withdrawals: x.n_out })).sort((x, y) => y.deposits + y.withdrawals - x.deposits - x.withdrawals).slice(0, 25),
      large_moves: big.sort((x, y) => y.usd - x.usd).slice(0, 15), note: "canonical bridge only; ETH deposits via OptimismPortal direct calls may not emit bridge events" });
  } catch (e) { return err(e); }
}

export async function stablemint(a) {
  try {
    const g = await range((parseFloat(a.hours || "6") || 6) * 60, 720, 9000); const out = [];
    for (const [sym, [addr, dec]] of Object.entries(STABLES)) {
      const [M, B] = [await logs({ address: addr, topics: [TRANSFER, ZERO] }, g.chunks), await logs({ address: addr, topics: [TRANSFER, null, ZERO] }, g.chunks)];
      const s = (ls) => ls.reduce((t, l) => t + Number(BigInt(l.data)) / 10 ** dec, 0); const mi = s(M), bu = s(B);
      out.push({ symbol: sym, address: addr, minted: +mi.toFixed(2), burned: +bu.toFixed(2), net_supply_change: +(mi - bu).toFixed(2), mint_events: M.length, burn_events: B.length, largest_mint: M.length ? +Math.max(...M.map((l) => Number(BigInt(l.data)) / 10 ** dec)).toFixed(2) : 0 });
    }
    const net = out.reduce((t, x) => t + x.net_supply_change, 0);
    return R(200, { chain: "base", hours: +(g.minutes / 60).toFixed(2), to_block: g.tip, net_stable_supply_change_usd: +net.toFixed(2), signal: net > 1e6 ? "stablecoin inflow (risk-on liquidity)" : net < -1e6 ? "stablecoin outflow" : "flat", stablecoins: out.sort((x, y) => Math.abs(y.net_supply_change) - Math.abs(x.net_supply_change)) });
  } catch (e) { return err(e); }
}
