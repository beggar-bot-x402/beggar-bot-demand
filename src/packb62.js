// packb62 (builder B, 2026-11-02): Balancer pools (api-v3.balancer.fi, free GraphQL) + Balancer v2 Vault single-swap tx with on-chain queryBatchSwap quote. $0 upstream.
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
import { txbuild } from "./packb24.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { const s = String(h).replace(/^0x/, ""); if (!/^([0-9a-fA-F]{2})*$/.test(s)) throw new Error("bad hex"); return Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16)); };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const be = (v) => { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
const sel = (s) => keccakHex(s).slice(0, 10);
const w = (x, i) => BigInt("0x" + ((x || "0x").slice(2 + 64 * i, 66 + 64 * i) || "0"));
const toUnits = (a, dec) => { a = String(a ?? ""); if (!/^\d+(\.\d+)?$/.test(a)) return null; const [i, f = ""] = a.split("."); if (f.length > dec) return null; return BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0"); };
const WETH = { base: "0x4200000000000000000000000000000000000006", optimism: "0x4200000000000000000000000000000000000006", ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", polygon: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" };
const pick = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, max_cost_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const f = s.slice(s.length - d).replace(/0+$/, ""); return s.slice(0, s.length - d) + (f ? "." + f : ""); };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const arr = (xs) => pad(xs.length.toString(16)) + xs.join("");
import { finish } from "./packb40.js";
const API = "https://api-v3.balancer.fi/", VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const CM = { ethereum: "MAINNET", base: "BASE", arbitrum: "ARBITRUM", optimism: "OPTIMISM", polygon: "POLYGON", gnosis: "GNOSIS", avalanche: "AVALANCHE" };
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain) || String(q.chain).toLowerCase(); return CM[c] ? c : null; };
async function gql(query) { const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) }); const j = await r.json(); if (j.errors) throw new Error("balancer api: " + j.errors[0].message); return j.data; }
const PF = "id address name type protocolVersion dynamicData{ swapFee totalLiquidity volume24h fees24h totalShares aprItems{ title apr type } } poolTokens{ address symbol decimals weight balance balanceUSD }";
const shape = (p) => ({ pool_id: p.id, address: p.address, name: p.name, type: p.type, protocol_version: p.protocolVersion, tvl_usd: Number(p.dynamicData.totalLiquidity), volume_24h_usd: Number(p.dynamicData.volume24h), fees_24h_usd: Number(p.dynamicData.fees24h), swap_fee: Number(p.dynamicData.swapFee), apr_total: p.dynamicData.aprItems.reduce((s, x) => s + Number(x.apr || 0), 0), apr_items: p.dynamicData.aprItems.map((x) => ({ title: x.title, apr: x.apr, type: x.type })), tokens: p.poolTokens.map((t) => ({ address: t.address, symbol: t.symbol, decimals: t.decimals, weight: t.weight ? Number(t.weight) : null, balance: t.balance, balance_usd: Number(t.balanceUSD) })) });
const lc = (a) => String(a).toLowerCase();
export async function balancerpools(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum, base, arbitrum, optimism, polygon, gnosis, avalanche)");
  const ts = [q.token, q.token_a, q.token_b].filter(Boolean).map((t) => tok(ch, t)); if (ts.some((t) => !t)) return bad("token must be an address, USDC or WETH");
  const n = Math.min(Math.max(Number(q.limit) || 10, 1), 50), v = q.version != null ? Number(q.version) : null; if (v != null && ![2, 3].includes(v)) return bad("version must be 2 or 3");
  try { const where = [`chainIn:[${CM[ch]}]`, ts.length ? `tokensIn:[${ts.map((t) => JSON.stringify(lc(t))).join(",")}]` : "", v ? `protocolVersionIn:[${v}]` : "", q.min_tvl ? `minTvl:${Number(q.min_tvl)}` : ""].filter(Boolean).join(",");
    const d = await gql(`{ poolGetPools(first:${ts.length > 1 ? 100 : n}, orderBy:${q.sort === "apr" ? "apr" : q.sort === "volume" ? "volume24h" : "totalLiquidity"}, orderDirection:desc, where:{${where}}){ ${PF} } }`);
    let ps = d.poolGetPools; if (ts.length > 1) ps = ps.filter((p) => ts.every((t) => p.poolTokens.some((x) => lc(x.address) === lc(t))));
    return ok({ chain: ch, count: Math.min(ps.length, n), pools: ps.slice(0, n).map(shape), source: "api-v3.balancer.fi" });
  } catch (e) { return err(e); }
}
export async function balancerpool(q) {
  const ch = chq(q); if (!ch) return bad("chain required"); const id = String(q.pool_id || q.pool || ""); if (!/^0x[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/.test(id)) return bad("pool_id (v2 bytes32 or v3 address) required");
  try { const d = await gql(`{ poolGetPool(id:${JSON.stringify(lc(id))}, chain:${CM[ch]}){ ${PF} } }`); if (!d.poolGetPool) return bad("pool not found"); return ok({ chain: ch, ...shape(d.poolGetPool), source: "api-v3.balancer.fi" }); } catch (e) { return /not found|No pool/i.test(e.message) ? bad("pool not found") : err(e); }
}
export async function balancerposition(q) {
  const ch = chq(q); if (!ch) return bad("chain required"); if (!isA(q.address)) return bad("address required");
  try { const d = await gql(`{ poolGetPools(first:100, where:{chainIn:[${CM[ch]}], userAddress:${JSON.stringify(lc(q.address))}}){ id address name type protocolVersion dynamicData{ totalLiquidity aprItems{ apr } } userBalance{ totalBalance totalBalanceUsd walletBalance stakedBalances{ balance stakingType } } } }`);
    const ps = d.poolGetPools.filter((p) => p.userBalance && Number(p.userBalance.totalBalance) > 0).map((p) => ({ pool_id: p.id, name: p.name, type: p.type, protocol_version: p.protocolVersion, bpt_balance: p.userBalance.totalBalance, value_usd: p.userBalance.totalBalanceUsd, wallet_balance: p.userBalance.walletBalance, staked: p.userBalance.stakedBalances.map((s) => ({ balance: s.balance, type: s.stakingType })), pool_apr: p.dynamicData.aprItems.reduce((s, x) => s + Number(x.apr || 0), 0) })).sort((a, b) => b.value_usd - a.value_usd);
    return ok({ chain: ch, address: checksum(q.address), positions: ps, total_usd: ps.reduce((s, p) => s + (p.value_usd || 0), 0), source: "api-v3.balancer.fi" });
  } catch (e) { return err(e); }
}
const isEth = (t) => /^(eth|native)$/i.test(String(t || ""));
export async function balancerswapbuild(q) {
  const ch = chq(q); if (!ch || !RPCS[ch]) return bad("chain required (ethereum, base, arbitrum, optimism, polygon, gnosis, avalanche)"); if (!isA(q.from)) return bad("from address required");
  const ei = isEth(q.token_in), eo = isEth(q.token_out), ti = ei ? WETH[ch] : tok(ch, q.token_in), to = eo ? WETH[ch] : tok(ch, q.token_out); if (!ti || !to || lc(ti) === lc(to)) return bad("token_in and token_out required (address, ETH, USDC, WETH), distinct"); if (!q.amount) return bad("amount required");
  try { let pid = /^0x[0-9a-fA-F]{64}$/.test(String(q.pool_id || "")) ? lc(q.pool_id) : null, pname = null;
    if (!pid) { const d = await gql(`{ poolGetPools(first:100, orderBy:totalLiquidity, orderDirection:desc, where:{chainIn:[${CM[ch]}], protocolVersionIn:[2], tokensIn:[${JSON.stringify(lc(ti))},${JSON.stringify(lc(to))}]}){ id name poolTokens{ address } } }`); const p = d.poolGetPools.find((p) => [ti, to].every((t) => p.poolTokens.some((x) => lc(x.address) === lc(t)))); if (!p) return bad("no Balancer v2 pool holding both tokens; pass pool_id"); pid = p.id; pname = p.name; }
    const dr = (await rpcBatch(ch, [["eth_call", [{ to: ti, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: to, data: "0x313ce567" }, "latest"]]])).results, di = Number(w(dr[0], 0)), dout = Number(w(dr[1], 0)), amt = toUnits(q.amount, di); if (!amt) return bad("bad amount");
    const Z = "0".repeat(40), ai = ei ? Z : ti.slice(2), ao = eo ? Z : to.slice(2), F = pad(q.from.slice(2)) + pad("0") + pad(q.from.slice(2)) + pad("0");
    const qd = sel("queryBatchSwap(uint8,(bytes32,uint256,uint256,uint256,bytes)[],address[],(address,bool,address,bool))") + pad("0") + pad("e0") + pad("1e0") + F + pad("1") + pad("20") + pid.slice(2) + pad("0") + pad("1") + pad(amt.toString(16)) + pad("a0") + pad("0") + pad("2") + pad(ai) + pad(ao);
    const qr = (await rpcBatch(ch, [["eth_call", [{ to: VAULT, data: qd }, "latest"]]])).results[0]; if (!qr || qr.length < 2 + 64 * 4) return bad("pool cannot quote this pair (queryBatchSwap reverted)");
    const out = -BigInt.asIntN(256, w(qr, 3)); if (out <= 0n) return bad("zero output"); const slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 5000), min = out * BigInt(10000 - slip) / 10000n, dl = Math.floor(Date.now() / 1000) + 1200;
    const data = sel("swap((bytes32,uint8,address,address,uint256,bytes),(address,bool,address,bool),uint256,uint256)") + pad("e0") + F + pad(min.toString(16)) + pad(dl.toString(16)) + pid.slice(2) + pad("0") + pad(ai) + pad(ao) + pad(amt.toString(16)) + pad("c0") + pad("0");
    const ex = { chain: ch, aggregator: "balancer-v2-vault", vault: VAULT, pool_id: pid, pool_name: pname, token_in: ei ? "ETH" : checksum(ti), token_out: eo ? "ETH" : checksum(to), amount_in: q.amount, amount_out: fmt(out, dout), min_out: fmt(min, dout), slippage_bps: slip, deadline: dl, recipient: checksum(q.from), quote_source: "Vault.queryBatchSwap eth_call" };
    if (ei) { const t = await txbuild({ chain: ch, from: q.from, to: VAULT, data, value: amt.toString() }); return ok({ ...ex, ...pick(t) }); }
    return await finish(ch, q.from, ti, amt, VAULT, { to: VAULT, data, value: 0 }, ex);
  } catch (e) { return err(e); }
}
