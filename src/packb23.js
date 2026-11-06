// packb23 (builder B, 2026-11-02): v3pool, abiencode, units, msghash. $0 upstream (keyless public RPCs / pure compute).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak, keccakHex, parseSig } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const te = new TextEncoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h).replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex: " + h.slice(0, 20)); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
function str(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
// ---- v3pool ----
const FACT = { base: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD", ethereum: "0x1F98431c8aD98523631AE4a59f267346ea31F984", arbitrum: "0x1F98431c8aD98523631AE4a59f267346ea31F984", optimism: "0x1F98431c8aD98523631AE4a59f267346ea31F984", polygon: "0x1F98431c8aD98523631AE4a59f267346ea31F984" };
const SYM = { base: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", WETH: "0x4200000000000000000000000000000000000006", ETH: "0x4200000000000000000000000000000000000006", CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" }, ethereum: { USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", ETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7", DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F" }, arbitrum: { USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", ETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", ARB: "0x912CE59144191C1204E64559FE8253a0e49E6548" }, optimism: { USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", WETH: "0x4200000000000000000000000000000000000006", ETH: "0x4200000000000000000000000000000000000006", OP: "0x4200000000000000000000000000000000000042" }, polygon: { USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", WPOL: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" } };
export async function v3pool(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const tk = (t) => (t ? (isA(t) ? t : SYM[ch][String(t).toUpperCase()] || null) : null);
  try {
    let pools = [];
    if (isA(q.pool)) pools = [q.pool];
    else { const a = tk(q.token_a || q.tokenA || "WETH"), b = tk(q.token_b || q.tokenB || "USDC"); if (!a || !b) return bad("pool, or token_a/token_b (0x or symbol: " + Object.keys(SYM[ch]).join(",") + ")"); const fees = q.fee ? [Number(q.fee)] : [100, 500, 3000, 10000]; const { results: r } = await rpcBatch(ch, fees.map((f) => ["eth_call", [{ to: FACT[ch], data: "0x1698ee82" + pad(a) + pad(b) + pad(f.toString(16)) }, "latest"]])); pools = r.map((x) => (x && x.length >= 66 ? "0x" + x.slice(26, 66) : null)).filter((x) => x && !/^0x0{40}$/.test(x)); if (!pools.length) return ok({ chain: ch, pools: [], note: "no Uniswap v3 pool for pair" }); }
    const calls = []; for (const p of pools) calls.push(["eth_call", [{ to: p, data: "0x3850c7bd" }, "latest"]], ["eth_call", [{ to: p, data: "0x1a686502" }, "latest"]], ["eth_call", [{ to: p, data: "0x0dfe1681" }, "latest"]], ["eth_call", [{ to: p, data: "0xd21220a7" }, "latest"]], ["eth_call", [{ to: p, data: "0xddca3f43" }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    const meta = []; for (let i = 0; i < pools.length; i++) { const t0 = r[5 * i + 2] ? "0x" + r[5 * i + 2].slice(26, 66) : null, t1 = r[5 * i + 3] ? "0x" + r[5 * i + 3].slice(26, 66) : null; meta.push([t0, t1]); }
    const tcalls = []; for (const [a, b] of meta) for (const t of [a, b]) tcalls.push(["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t, data: "0x70a08231" + pad("0") }, "latest"]]);
    const bcalls = []; pools.forEach((p, i) => { for (const t of meta[i]) bcalls.push(["eth_call", [{ to: t, data: "0x70a08231" + pad(p) }, "latest"]]); });
    const { results: tr } = await rpcBatch(ch, [...tcalls, ...bcalls]);
    const out = pools.map((p, i) => { const s0 = r[5 * i], L = r[5 * i + 1]; if (!s0 || s0.length < 130) return { pool: p, error: "not a v3 pool" }; const sp = BigInt(s0.slice(0, 66)); const tick = Number(BigInt.asIntN(24, BigInt("0x" + s0.slice(66 + 64 - 6, 130)))); const d0 = Number(BigInt(tr[6 * i] || "0x12")), d1 = Number(BigInt(tr[6 * i + 3] || "0x12")); const s0y = str(tr[6 * i + 1]), s1y = str(tr[6 * i + 4]); const ratio = (Number(sp) / 2 ** 96) ** 2 * 10 ** (d0 - d1); const off = tcalls.length + 2 * i; const b0 = tr[off] ? Number(BigInt(tr[off])) / 10 ** d0 : null, b1 = tr[off + 1] ? Number(BigInt(tr[off + 1])) / 10 ** d1 : null; return { pool: checksum(p), fee_bps: Number(BigInt(r[5 * i + 4] || "0x0")) / 100, token0: { address: checksum(meta[i][0]), symbol: s0y, decimals: d0 }, token1: { address: checksum(meta[i][1]), symbol: s1y, decimals: d1 }, tick, sqrt_price_x96: sp.toString(), price_token1_per_token0: ratio, price_token0_per_token1: ratio ? 1 / ratio : null, liquidity: L ? BigInt(L).toString() : null, reserves: { [s0y || "token0"]: b0, [s1y || "token1"]: b1 } }; });
    const best = out.filter((x) => x.reserves).sort((a, b) => Object.values(b.reserves)[1] - Object.values(a.reserves)[1])[0];
    return ok({ chain: ch, pools: out, deepest: best ? best.pool : null, source: "Uniswap v3 slot0 on-chain" });
  } catch (e) { return err(e); }
}
// ---- abiencode ----
function encodeArg(t, v) {
  const m = t.match(/^(.*)\[(\d*)\]$/);
  if (m) { const arr = typeof v === "string" ? JSON.parse(v) : v; if (!Array.isArray(arr)) throw new Error(t + " expects array"); if (m[2] && arr.length !== Number(m[2])) throw new Error(t + " expects " + m[2] + " items"); const body = encodeTuple(arr.map(() => m[1]), arr); return { dyn: !m[2] || isDyn(m[1]), data: m[2] ? body : pad(arr.length.toString(16)) + body }; }
  if (t === "string" || t === "bytes") { const b = t === "string" ? te.encode(String(v)) : unhex(v); const h = hex(b); return { dyn: true, data: pad(b.length.toString(16)) + h.padEnd(Math.ceil(h.length / 64) * 64, "0") }; }
  if (t === "address") { if (!isA(v)) throw new Error("bad address " + v); return { dyn: false, data: pad(v) }; }
  if (t === "bool") return { dyn: false, data: pad(v === true || v === "true" || v === 1 || v === "1" ? "1" : "0") };
  let mm = t.match(/^(u?)int(\d+)$/); if (mm) { let n = BigInt(v); const bits = BigInt(mm[2]); if (mm[1] === "u" ? n < 0n || n >= 1n << bits : n < -(1n << (bits - 1n)) || n >= 1n << (bits - 1n)) throw new Error(`${v} out of range for ${t}`); if (n < 0n) n = (1n << 256n) + n; return { dyn: false, data: n.toString(16).padStart(64, "0") }; }
  mm = t.match(/^bytes(\d+)$/); if (mm) { const b = unhex(v); if (b.length > Number(mm[1])) throw new Error(t + " too long"); return { dyn: false, data: hex(b).padEnd(64, "0") }; }
  throw new Error("unsupported type " + t);
}
const isDyn = (t) => t === "string" || t === "bytes" || /\[\]$/.test(t) || (/\[\d+\]$/.test(t) && isDyn(t.replace(/\[\d+\]$/, "")));
function encodeTuple(types, vals) { const parts = types.map((t, i) => encodeArg(t, vals[i])); let head = "", tail = "", off = parts.reduce((s, p) => s + (p.dyn ? 32 : p.data.length / 2), 0); for (const p of parts) { if (p.dyn) { head += pad(off.toString(16)); tail += p.data; off += p.data.length / 2; } else head += p.data; } return head + tail; }
export async function abiencode(q) {
  if (!q.signature && !q.types) return bad("signature (e.g. transfer(address,uint256)) or types (csv) required");
  let args = q.args ?? []; if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = args.split(",").map((s) => s.trim()); } }
  if (!Array.isArray(args)) return bad("args must be a JSON array");
  try {
    let types, sel = "", canon = null;
    if (q.signature) { const p = parseSig(q.signature); if (p.params.some((x) => x.type.startsWith("("))) return bad("tuple params not supported"); types = p.params.map((x) => x.type); sel = p.selector.slice(2); canon = p.canonical; }
    else types = String(q.types).split(",").map((s) => s.trim());
    if (types.length !== args.length) return bad(`expected ${types.length} args, got ${args.length}`);
    const body = encodeTuple(types, args);
    return ok({ signature: canon, selector: sel ? "0x" + sel : null, types, calldata: "0x" + sel + body, bytes: (sel.length + body.length) / 2, usage: "Pass calldata as data to /v1/multicall, /v1/simcall or eth_call." });
  } catch (e) { return bad(String(e.message || e)); }
}
// ---- units ----
const UNITS = { wei: 0, kwei: 3, mwei: 6, gwei: 9, szabo: 12, finney: 15, ether: 18, eth: 18, usdc: 6, usdt: 6, btc: 8, sat: 0 };
export async function units(q) {
  const v = String(q.value ?? q.amount ?? "").trim(); if (!v) return bad("value required (decimal, or 0x hex)");
  const from = String(q.from || (v.startsWith("0x") ? "wei" : "ether")).toLowerCase(); const fd = UNITS[from] ?? (/^\d+$/.test(from) ? Number(from) : null); if (fd == null || fd > 77) return bad("from: unit name (" + Object.keys(UNITS).join(",") + ") or decimals int");
  let base;
  try { if (/^0x[0-9a-f]+$/i.test(v)) base = BigInt(v); else { if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(v)) return bad("value not numeric"); let [m, e = "0"] = v.toLowerCase().split("e"); let neg = m.startsWith("-"); if (neg) m = m.slice(1); let [w, f = ""] = m.split("."); const sh = fd + Number(e); if (f.length > sh && /[1-9]/.test(f.slice(sh))) return bad("value has more precision than " + from + " allows"); base = BigInt(w + (f + "0".repeat(Math.max(sh, 0))).slice(0, Math.max(sh, 0)) || "0"); if (sh < 0) base = base / 10n ** BigInt(-sh); if (neg) base = -base; } } catch { return bad("value not parseable"); }
  const fmt = (d) => { const neg = base < 0n; let s = (neg ? -base : base).toString(); if (!d) return (neg ? "-" : "") + s; s = s.padStart(d + 1, "0"); const i = s.slice(0, -d), f = s.slice(-d).replace(/0+$/, ""); return (neg ? "-" : "") + i + (f ? "." + f : ""); };
  const to = q.to ? String(q.to).toLowerCase() : null; const td = to ? UNITS[to] ?? (/^\d+$/.test(to) ? Number(to) : null) : null;
  return ok({ input: v, from, base_units: base.toString(), hex: (base < 0n ? "-0x" + (-base).toString(16) : "0x" + base.toString(16)), uint256_word: base >= 0n ? "0x" + base.toString(16).padStart(64, "0") : null, ...(to ? { to, result: td != null ? fmt(td) : null } : {}), conversions: { wei: fmt(0), gwei: fmt(9), ether: fmt(18), usdc_6dp: fmt(6), btc_8dp: fmt(8) } });
}
// ---- msghash ----
export async function msghash(q) {
  const msg = q.message ?? q.text; const data = q.hex;
  if (msg == null && data == null) return bad("message (utf8) or hex required");
  try {
    const b = data != null ? unhex(data) : te.encode(String(msg)); if (b.length > 65536) return bad("max 64KB");
    const pre = te.encode("\x19Ethereum Signed Message:\n" + b.length); const full = new Uint8Array(pre.length + b.length); full.set(pre); full.set(b, pre.length);
    const out = { bytes: b.length, keccak256: "0x" + hex(keccak(b)), eip191_personal_sign_hash: "0x" + hex(keccak(full)), selector_if_signature: msg != null && /^\w+\(.*\)$/.test(String(msg)) ? keccakHex(String(msg)).slice(0, 10) : null };
    if (isA(q.validator)) { const v = unhex(q.validator), f2 = new Uint8Array(2 + 20 + b.length); f2.set([0x19, 0x00]); f2.set(v, 2); f2.set(b, 22); out.eip191_v0_hash = "0x" + hex(keccak(f2)); }
    return ok({ ...out, verify_with: "/v1/sigrecover (EOA) or /v1/sig1271 (smart wallet)" });
  } catch (e) { return bad(String(e.message || e)); }
}
