// packb59 (builder B, 2026-11-02): Uniswap v2 on-chain (Ethereum, Base): pair reserves, router quote, swap tx, LP position. $0 upstream (keyless RPCs).
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
const U2 = { ethereum: { f: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", r: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" }, base: { f: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6", r: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", weth: "0x4200000000000000000000000000000000000006" } };
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], W = (h, i = 0) => (h && h.length >= 66 + 64 * i ? w(h, i) : null), A = (a) => pad(a.slice(2).toLowerCase());
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain); return c && U2[c] ? c : null; };
const isEth = (t) => /^(eth|native)$/i.test(String(t || ""));
const res = (ch, t) => (isEth(t) ? U2[ch].weth : tok(ch, t));
const str = (h) => { try { if (!h || h.length < 130) return h && h.length === 66 ? new TextDecoder().decode(unhex(h.slice(2)).filter((b) => b)) : null; const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
async function meta(ch, ads) { const r = (await rpcBatch(ch, ads.flatMap((a) => [call(a, "0x313ce567"), call(a, "0x95d89b41")]))).results; return ads.map((a, i) => { const d = W(r[2 * i]); if (d == null) throw new Error("not an ERC20: " + a); return { address: checksum(a), decimals: Number(d), symbol: str(r[2 * i + 1]) }; }); }
const arrA = (xs) => pad(xs.length.toString(16)) + xs.map(A).join("");
async function pairOf(ch, a, b) { const r = (await rpcBatch(ch, [call(U2[ch].f, sel("getPair(address,address)") + A(a) + A(b))])).results[0]; const p = r && "0x" + r.slice(-40); return p && !/^0x0{40}$/.test(p) ? p : null; }
async function pairInfo(ch, p) { const r = (await rpcBatch(ch, [call(p, sel("token0()")), call(p, sel("token1()")), call(p, sel("getReserves()")), call(p, "0x18160ddd")])).results; const t0 = "0x" + r[0].slice(-40), t1 = "0x" + r[1].slice(-40); const [m0, m1] = await meta(ch, [t0, t1]); return { m0, m1, r0: W(r[2], 0), r1: W(r[2], 1), last: Number(W(r[2], 2)), ts: W(r[3]) }; }
function pr(i) { const x = Number(i.r0) / 10 ** i.m0.decimals, y = Number(i.r1) / 10 ** i.m1.decimals; return { reserve0: fmt(i.r0, i.m0.decimals), reserve1: fmt(i.r1, i.m1.decimals), price_token1_per_token0: x ? y / x : null, price_token0_per_token1: y ? x / y : null }; }
export async function v2pair(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)");
  try { let p = isA(q.pair) ? q.pair : null; if (!p) { const a = res(ch, q.token_a), b = res(ch, q.token_b); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return bad("pair address, or token_a and token_b, required"); p = await pairOf(ch, a, b); if (!p) return ok({ chain: ch, exists: false, note: "no Uniswap v2 pair for these tokens" }); }
    const i = await pairInfo(ch, p); return ok({ chain: ch, exists: true, pair: checksum(p), token0: i.m0, token1: i.m1, ...pr(i), lp_total_supply: fmt(i.ts, 18), last_update: i.last, fee_bps: 30, source: "Uniswap v2 factory/pair eth_call" });
  } catch (e) { return err(e); }
}
async function bestPath(ch, a, b, amt) { const W8 = U2[ch].weth, paths = [[a, b]]; if (a.toLowerCase() !== W8.toLowerCase() && b.toLowerCase() !== W8.toLowerCase()) paths.push([a, W8, b]);
  const r = (await rpcBatch(ch, paths.map((p) => call(U2[ch].r, sel("getAmountsOut(uint256,address[])") + pad(amt.toString(16)) + pad("40") + arrA(p))))).results;
  return paths.map((p, i) => { const x = r[i]; if (!x || x.length < 2 + 64 * (2 + p.length)) return null; return { path: p, out: w(x, 1 + p.length) }; }).filter((x) => x && x.out > 0n).sort((x, y) => (y.out > x.out ? 1 : -1)); }
async function prep(q) { const ch = chq(q); if (!ch) return [bad("chain required (ethereum or base)")]; const a = res(ch, q.token_in), b = res(ch, q.token_out); if (!a || !b || a.toLowerCase() === b.toLowerCase()) return [bad("token_in and token_out required (address, ETH, USDC, WETH), distinct")]; if (!q.amount) return [bad("amount required")];
  const [mi, mo] = await meta(ch, [a, b]), amt = toUnits(q.amount, mi.decimals); if (!amt) return [bad("bad amount")]; return [null, ch, mi, mo, amt, await bestPath(ch, a, b, amt)]; }
export async function v2quote(q) {
  try { const [e, ch, mi, mo, amt, ps] = await prep(q); if (e) return e; if (!ps.length) return ok({ chain: ch, routable: false, note: "no Uniswap v2 route (direct or via WETH)" });
    return ok({ chain: ch, token_in: mi, token_out: mo, amount_in: q.amount, amount_out: fmt(ps[0].out, mo.decimals), price: Number(ps[0].out) / 10 ** mo.decimals / Number(q.amount), path: ps[0].path.map(checksum), alternatives: ps.slice(1).map((p) => ({ path: p.path.map(checksum), amount_out: fmt(p.out, mo.decimals) })), build: "/v1/v2swapbuild", source: "Uniswap v2 Router02 getAmountsOut" });
  } catch (e) { return err(e); }
}
export async function v2swapbuild(q) {
  if (!isA(q.from)) return bad("from address required");
  try { const [e, ch, mi, mo, amt, ps] = await prep(q); if (e) return e; if (!ps.length) return bad("no Uniswap v2 route"); const b = ps[0], slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 5000), min = b.out * BigInt(10000 - slip) / 10000n, rc = isA(q.recipient) ? q.recipient : q.from, dl = Math.floor(Date.now() / 1000) + 1200, R = U2[ch].r;
    const ei = isEth(q.token_in), eo = isEth(q.token_out), tail = pad(rc.slice(2)) + pad(dl.toString(16)) + arrA(b.path);
    const data = ei ? sel("swapExactETHForTokens(uint256,address[],address,uint256)") + pad(min.toString(16)) + pad("80") + tail
      : sel(eo ? "swapExactTokensForETH(uint256,uint256,address[],address,uint256)" : "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)") + pad(amt.toString(16)) + pad(min.toString(16)) + pad("a0") + tail;
    const ex = { chain: ch, aggregator: "uniswap-v2-direct", router: checksum(R), path: b.path.map(checksum), token_in: ei ? "ETH" : mi.symbol, token_out: eo ? "ETH" : mo.symbol, amount_in: q.amount, amount_out: fmt(b.out, mo.decimals), min_out: fmt(min, mo.decimals), slippage_bps: slip, deadline: dl, recipient: checksum(rc) };
    if (ei) { const t = await txbuild({ chain: ch, from: q.from, to: R, data, value: amt.toString() }); return ok({ ...ex, ...pick(t) }); }
    return await finish(ch, q.from, mi.address, amt, R, { to: R, data, value: 0 }, ex);
  } catch (e) { return err(e); }
}
export async function v2lp(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); if (!isA(q.address)) return bad("address required");
  try { let p = isA(q.pair) ? q.pair : null; if (!p) { const a = res(ch, q.token_a), b = res(ch, q.token_b); if (!a || !b) return bad("pair, or token_a and token_b, required"); p = await pairOf(ch, a, b); if (!p) return bad("no such pair"); }
    const [i, bl] = await Promise.all([pairInfo(ch, p), rpcBatch(ch, [call(p, "0x70a08231" + A(q.address))])]), lp = W(bl.results[0]) ?? 0n, sh = i.ts ? Number(lp) / Number(i.ts) : 0;
    return ok({ chain: ch, address: checksum(q.address), pair: checksum(p), token0: i.m0, token1: i.m1, lp_balance: fmt(lp, 18), pool_share: sh, amount0: fmt(i.ts ? i.r0 * lp / i.ts : 0n, i.m0.decimals), amount1: fmt(i.ts ? i.r1 * lp / i.ts : 0n, i.m1.decimals), ...pr(i), source: "Uniswap v2 pair eth_call" });
  } catch (e) { return err(e); }
}
