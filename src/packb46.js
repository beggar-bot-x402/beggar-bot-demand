// packb46 (builder B, 2026-11-02): pendlemarkets, pendleswap, pendlepositions, balancerquote. $0 upstream (keyless public RPCs + Pendle hosted SDK + Balancer v3 API).
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
import { prep, finish, J, isN, CID, decOut } from "./packb40.js";
const PC = { ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10 };
const PA = "https://api-v2.pendle.finance/core";
const strip = (s) => String(s || "").replace(/^\d+-/, "");
// ---- pendlemarkets: active Pendle markets with implied APY ----
export async function pendlemarkets(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !PC[ch]) return bad("chain required (ethereum, base, arbitrum, optimism)");
  try { const r = await J(PA + "/v1/" + PC[ch] + "/markets/active"); if (!r.ok || !r.j || !Array.isArray(r.j.markets)) return err("Pendle markets " + r.status);
    const s = String(q.search || "").toLowerCase(), now = Date.now();
    let ms = r.j.markets.filter((m) => !s || String(m.name).toLowerCase().includes(s)).map((m) => { const d = m.details || {}; return { name: m.name, market: m.address, expiry: m.expiry, days_to_expiry: Math.round((Date.parse(m.expiry) - now) / 864e5), pt: strip(m.pt), yt: strip(m.yt), sy: strip(m.sy), underlying: strip(m.underlyingAsset), implied_apy: d.impliedApy ?? null, pendle_apy: d.pendleApy ?? null, aggregated_apy: d.aggregatedApy ?? null, liquidity_usd: d.liquidity ?? null, fee_rate: d.feeRate ?? null }; });
    const sort = q.sort === "liquidity" ? "liquidity_usd" : q.sort === "expiry" ? "days_to_expiry" : "implied_apy";
    ms.sort((a, b) => sort === "days_to_expiry" ? a[sort] - b[sort] : (b[sort] || 0) - (a[sort] || 0)); const minL = Number(q.min_liquidity || 0); if (minL) ms = ms.filter((m) => (m.liquidity_usd || 0) >= minL);
    return ok({ chain: ch, count: ms.length, markets: ms.slice(0, Math.min(Number(q.limit) || 25, 100)), build: "/v1/pendleswap?chain=" + ch + "&token_out=<pt|yt|market>", source: "api-v2.pendle.finance" });
  } catch (e) { return err(e); }
}
// ---- pendleswap: build Pendle router tx (buy/sell PT, YT, LP or any token) ----
export async function pendleswap(q) {
  try { const p = await prep(q, false); if (p.e) return p.e; if (!PC[p.ch]) return bad("Pendle chains: ethereum, base, arbitrum, optimism");
    const rcpt = isA(q.recipient) ? q.recipient : q.from, Z = "0x0000000000000000000000000000000000000000";
    const u = PA + "/v2/sdk/" + PC[p.ch] + "/convert?receiver=" + rcpt + "&slippage=" + p.slip / 1e4 + "&tokensIn=" + (isN(p.ti) ? Z : p.ti) + "&amountsIn=" + p.amt + "&tokensOut=" + (isN(p.to) ? Z : p.to) + "&enableAggregator=true";
    const r = await J(u); const rt = r.j && r.j.routes && r.j.routes[0]; if (!r.ok || !rt || !rt.tx) return bad("Pendle convert failed: " + ((r.j && (r.j.message || r.j.error)) || r.status));
    const o = rt.outputs && rt.outputs[0], dd = await decOut(p.ch, p.to), dt = rt.data || {};
    return await finish(p.ch, q.from, p.ti, p.amt, rt.tx.to, { to: rt.tx.to, data: rt.tx.data, value: rt.tx.value || 0, gas: dt.gasUsed ? Math.ceil(Number(dt.gasUsed) * 1.3) : undefined }, { chain: p.ch, aggregator: "pendle", action: r.j.action || null, method: rt.contractParamInfo && rt.contractParamInfo.method, token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out: o ? fmt(BigInt(o.amount), dd) : null, price_impact: dt.priceImpact ?? null, fee_usd: dt.fee ? dt.fee.usd : null, via_aggregator: dt.aggregatorType || null, recipient: checksum(rcpt), source: "api-v2.pendle.finance/core/v2/sdk" });
  } catch (e) { return err(e); }
}
// ---- pendlepositions: a wallet's Pendle PT/YT/LP positions ----
export async function pendlepositions(q) {
  const a = q.address || q.from; if (!isA(a)) return bad("address required");
  try { const r = await J(PA + "/v1/dashboard/positions/database/" + a + "?filterUsd=" + Number(q.min_usd ?? 0.1)); if (!r.ok || !r.j) return err("Pendle positions " + r.status);
    const out = []; for (const c of r.j.positions || []) for (const k of ["openPositions", "closedPositions", "syPositions"]) for (const x of c[k] || []) { const v = (y) => y ? { balance: y.balance ?? null, usd: y.valuation ?? null } : null; out.push({ chain_id: c.chainId, chain: Object.keys(PC).find((n) => PC[n] === c.chainId) || null, kind: k.replace("Positions", ""), market: strip(x.marketId || x.syId), pt: v(x.pt), yt: v(x.yt), lp: v(x.lp), total_usd: [x.pt, x.yt, x.lp].reduce((s, y) => s + Number((y && y.valuation) || 0), 0) || null }); }
    return ok({ address: checksum(a), count: out.length, total_usd: +out.filter((x) => x.kind === "open").reduce((s, x) => s + (x.total_usd || 0), 0).toFixed(2), positions: out, source: "api-v2.pendle.finance dashboard" });
  } catch (e) { return err(e); }
}
// ---- balancerquote: Balancer v2/v3 smart order router quote ----
const BC = { ethereum: "MAINNET", base: "BASE", arbitrum: "ARBITRUM", optimism: "OPTIMISM", polygon: "POLYGON" };
export async function balancerquote(q) {
  try { const p = await prep({ ...q, from: isA(q.from) ? q.from : "0x0000000000000000000000000000000000000001" }, false); if (p.e) return p.e; if (isN(p.ti) || isN(p.to)) return bad("Balancer uses WETH, not native ETH");
    const gq = `{ sorGetSwapPaths(chain: ${BC[p.ch]}, swapAmount: "${q.amount}", swapType: EXACT_IN, tokenIn: "${p.ti.toLowerCase()}", tokenOut: "${p.to.toLowerCase()}") { returnAmount swapAmount protocolVersion priceImpact { priceImpact error } effectivePrice routes { share hops { pool { address type } } } } }`;
    const r = await J("https://api-v3.balancer.fi/", { method: "POST", body: JSON.stringify({ query: gq }) }); const x = r.j && r.j.data && r.j.data.sorGetSwapPaths;
    if (!x) return bad("Balancer SOR failed: " + ((r.j && r.j.errors && r.j.errors[0].message) || r.status)); if (!Number(x.returnAmount)) return ok({ chain: p.ch, found: false, note: "no Balancer route for this pair/size" });
    return ok({ chain: p.ch, found: true, token_in: checksum(p.ti), token_out: checksum(p.to), amount_in: q.amount, amount_out: x.returnAmount, effective_price: x.effectivePrice ?? null, protocol_version: x.protocolVersion, price_impact: x.priceImpact ? x.priceImpact.priceImpact : null, routes: (x.routes || []).map((t) => ({ share: t.share ?? null, pools: [...new Set((t.hops || []).map((h) => h.pool && h.pool.address + ":" + h.pool.type))] })), compare: "/v1/swapbest", source: "api-v3.balancer.fi sorGetSwapPaths" });
  } catch (e) { return err(e); }
}
