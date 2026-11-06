// packb28 (builder B, 2026-11-02): wrapbuild, multisend, aavebuild, rlpcodec. $0 upstream (keyless public RPCs).
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
// ---- wrapbuild ----
export async function wrapbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required");
  const dir = String(q.direction || "wrap").toLowerCase(); if (!["wrap", "unwrap"].includes(dir)) return bad("direction: wrap|unwrap");
  const units = toUnits(q.amount, 18); if (units == null || units === 0n) return bad("amount (human units, 18 decimals, > 0) required");
  const token = WETH[ch];
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_getBalance", [q.from, "latest"]]]);
    const wbal = r[0] ? w(r[0], 0) : null, nbal = r[1] ? BigInt(r[1]) : null;
    const data = dir === "wrap" ? "0xd0e30db0" : "0x2e1a7d4d" + pad(units.toString(16));
    const warn = []; if (dir === "wrap" && nbal != null && nbal < units) warn.push("insufficient native balance"); if (dir === "unwrap" && wbal != null && wbal < units) warn.push("insufficient wrapped balance");
    const t = await txbuild({ chain: ch, from: q.from, to: token, data, value: dir === "wrap" ? units.toString() : "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, direction: dir, wrapped_token: checksum(token), symbol: ch === "polygon" ? "WPOL" : "WETH", amount: String(q.amount), amount_wei: units.toString(), from: checksum(q.from), native_balance: nbal == null ? null : Number(nbal) / 1e18, wrapped_balance: wbal == null ? null : Number(wbal) / 1e18, calldata: data, tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null, safe_to_send: !warn.length && !t.body.error, warnings: warn });
  } catch (e) { return err(e); }
}
// ---- multisend (Safe MultiSendCallOnly 1.3.0 / 1.4.1) ----
const MS = { "1.3.0": "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D", "1.4.1": "0x9641d764fc13c8B624c04430C7356C1C7C8102e2" };
export async function multisend(q) {
  let txs = q.txs; if (typeof txs === "string") { try { txs = JSON.parse(txs); } catch { return bad("txs must be JSON array of {to,value,data}"); } }
  if (!Array.isArray(txs) || !txs.length || txs.length > 50) return bad("txs: JSON array of 1-50 {to, value?, data?}");
  const ver = String(q.version || "1.4.1"); if (!MS[ver]) return bad("version: 1.3.0|1.4.1");
  const parts = [], out = [];
  for (const [i, t] of txs.entries()) {
    if (!t || !isA(t.to)) return bad(`txs[${i}].to must be an address`);
    let d, v; try { d = unhex(t.data || "0x"); v = BigInt(t.value || 0); } catch { return bad(`txs[${i}] has invalid data/value`); }
    if (v < 0n) return bad(`txs[${i}].value negative`);
    parts.push(cat(Uint8Array.of(0), unhex(t.to), unhex(pad(v.toString(16))), unhex(pad(d.length.toString(16))), d));
    out.push({ to: checksum(t.to), value: v.toString(), data_bytes: d.length, selector: d.length >= 4 ? "0x" + hex(d.slice(0, 4)) : null });
  }
  const packed = cat(...parts); const plen = Math.ceil(packed.length / 32) * 32; const body = new Uint8Array(plen); body.set(packed);
  const data = "0x8d80ff0a" + pad("20") + pad(packed.length.toString(16)) + hex(body);
  const total = out.reduce((s, x) => s + BigInt(x.value), 0n);
  return ok({ multisend_contract: MS[ver], version: ver, operation: 1, operation_note: "Safe tx must use operation=1 (DELEGATECALL) to the MultiSendCallOnly contract", safe_tx: { to: MS[ver], value: "0", data, operation: 1 }, total_value_wei: total.toString(), count: out.length, transactions: out, packed_transactions: "0x" + hex(packed), note: "Feed safe_tx into /v1/safehash to get the safeTxHash to sign. CallOnly forbids nested delegatecalls." });
}
// ---- aavebuild (Aave v3 Pool) ----
const POOL = { base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", optimism: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
export async function aavebuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required");
  const action = String(q.action || "supply").toLowerCase(); if (!["supply", "withdraw", "repay", "borrow"].includes(action)) return bad("action: supply|withdraw|repay|borrow");
  const asset = isA(q.asset) ? q.asset : String(q.asset || "USDC").toUpperCase() === "USDC" ? USDC[ch] : String(q.asset).toUpperCase() === "WETH" ? WETH[ch] : null; if (!asset) return bad("asset: address, USDC or WETH");
  const max = String(q.amount).toLowerCase() === "max";
  const pool = POOL[ch];
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: asset, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: asset, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: asset, data: "0xdd62ed3e" + pad(q.from) + pad(pool) }, "latest"]], ["eth_call", [{ to: pool, data: sel("getUserAccountData(address)") + pad(q.from) }, "latest"]], ["eth_call", [{ to: pool, data: sel("getReserveData(address)") + pad(asset) }, "latest"]]]);
    if (!r[0]) return bad("asset has no decimals() on " + ch);
    const dec = Number(BigInt(r[0]));
    if (max && !["withdraw", "repay"].includes(action)) return bad("amount=max only for withdraw/repay");
    const units = max ? (1n << 256n) - 1n : toUnits(q.amount, dec); if (units == null || units === 0n) return bad(`amount (human units, <= ${dec} decimals) or max required`);
    const reserveListed = r[4] && r[4].length > 2 && w(r[4], 8) !== 0n;
    const of = q.on_behalf_of && isA(q.on_behalf_of) ? q.on_behalf_of : q.from;
    const data = action === "supply" ? sel("supply(address,uint256,address,uint16)") + pad(asset) + pad(units.toString(16)) + pad(of) + pad("0")
      : action === "withdraw" ? sel("withdraw(address,uint256,address)") + pad(asset) + pad(units.toString(16)) + pad(q.from)
      : action === "repay" ? sel("repay(address,uint256,uint256,address)") + pad(asset) + pad(units.toString(16)) + pad("2") + pad(of)
      : sel("borrow(address,uint256,uint256,uint16,address)") + pad(asset) + pad(units.toString(16)) + pad("2") + pad("0") + pad(of);
    const bal = r[1] ? w(r[1], 0) : null, alw = r[2] ? w(r[2], 0) : null;
    const acct = r[3] && r[3].length >= 2 + 64 * 6 ? { collateral_usd: Number(w(r[3], 0)) / 1e8, debt_usd: Number(w(r[3], 1)) / 1e8, available_borrow_usd: Number(w(r[3], 2)) / 1e8, ltv_pct: Number(w(r[3], 4)) / 100, health_factor: w(r[3], 1) === 0n ? null : Number(w(r[3], 5)) / 1e18 } : null;
    const warn = []; let approval = null;
    if (!reserveListed) warn.push("asset does not look like an active Aave v3 reserve on " + ch);
    if (["supply", "repay"].includes(action)) { const need = max ? (bal ?? 0n) : units; if (bal != null && !max && bal < units) warn.push("insufficient asset balance"); if (alw != null && alw < need) { approval = { to: checksum(asset), data: "0x095ea7b3" + pad(pool) + pad(need.toString(16)), note: "approve Pool first, then send tx" }; warn.push("allowance to Pool insufficient — send approval tx first"); } }
    if (action === "borrow" && acct && acct.available_borrow_usd === 0) warn.push("no borrow capacity");
    const t = approval ? { body: {} } : await txbuild({ chain: ch, from: q.from, to: pool, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, action, pool: checksum(pool), asset: checksum(asset), decimals: dec, amount: max ? "max" : String(q.amount), amount_units: units.toString(), on_behalf_of: checksum(of), wallet_balance: bal == null ? null : Number(bal) / 10 ** dec, pool_allowance: alw == null ? null : alw.toString(), account: acct, approval_tx: approval, calldata: data, tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null, safe_to_send: !warn.length && !t.body.error, warnings: warn, note: approval ? "tx not gas-estimated because approval is required first" : "variable rate mode (2) used for borrow/repay" });
  } catch (e) { return err(e); }
}
// ---- rlpcodec ----
function rlpEnc(x) { const L = (n, off) => { if (n < 56) return Uint8Array.of(off + n); const b = be(n); return cat(Uint8Array.of(off + 55 + b.length), b); }; if (Array.isArray(x)) { const b = cat(...x.map(rlpEnc)); return cat(L(b.length, 0xc0), b); } const s = typeof x === "number" || /^\d+$/.test(String(x)) ? be(x) : unhex(String(x)); if (s.length === 1 && s[0] < 0x80) return s; return cat(L(s.length, 0x80), s); }
function rlpDec(b, i = 0, depth = 0) { if (depth > 32) throw new Error("too deep"); if (i >= b.length) throw new Error("truncated"); const p = b[i]; const rd = (o, n) => { if (o + n > b.length) throw new Error("truncated"); return b.slice(o, o + n); }; const ln = (o, n) => Number(BigInt("0x" + (hex(rd(o, n)) || "0")));
  if (p < 0x80) return [{ hex: "0x" + hex([p]) }, i + 1];
  if (p < 0xb8) { const n = p - 0x80; return [{ hex: "0x" + hex(rd(i + 1, n)) }, i + 1 + n]; }
  if (p < 0xc0) { const k = p - 0xb7, n = ln(i + 1, k); return [{ hex: "0x" + hex(rd(i + 1 + k, n)) }, i + 1 + k + n]; }
  let s, n; if (p < 0xf8) { s = i + 1; n = p - 0xc0; } else { const k = p - 0xf7; n = ln(i + 1, k); s = i + 1 + k; } const end = s + n; if (end > b.length) throw new Error("truncated"); const items = []; let j = s; while (j < end) { const [v, nj] = rlpDec(b, j, depth + 1); items.push(v); j = nj; } if (j !== end) throw new Error("list length mismatch"); return [items, end]; }
const ann = (v) => Array.isArray(v) ? v.map(ann) : { ...v, ...(v.hex.length <= 66 ? { uint: v.hex === "0x" ? "0" : BigInt(v.hex).toString() } : {}), ...(v.hex.length === 42 ? { address: checksum(v.hex) } : {}) };
const TXT = { "0x01": "EIP-2930", "0x02": "EIP-1559", "0x03": "EIP-4844", "0x04": "EIP-7702" };
export async function rlpcodec(q) {
  if (q.data != null) {
    let b; try { b = unhex(q.data); } catch { return bad("data must be hex"); } if (!b.length) return bad("data empty"); if (b.length > 131072) return bad("data too large");
    let type = null; if (b[0] < 0x7f && b[0] <= 0x04) { type = TXT["0x0" + b[0]] || "typed"; b = b.slice(1); }
    try { const [v, end] = rlpDec(b); if (end !== b.length) return bad(`trailing bytes after RLP item (${b.length - end})`); return ok({ mode: "decode", typed_envelope: type, item_count: Array.isArray(v) ? v.length : 1, decoded: ann(v) }); } catch (e) { return bad("invalid RLP: " + e.message); }
  }
  if (q.items != null) { let it = q.items; if (typeof it === "string") { try { it = JSON.parse(it); } catch { return bad("items must be JSON (nested arrays of hex strings / decimal ints)"); } } try { const e = rlpEnc(it); return ok({ mode: "encode", encoded: "0x" + hex(e), bytes: e.length }); } catch (e) { return bad("encode failed: " + e.message); } }
  return bad("provide data (hex to decode) or items (JSON to encode)");
}
