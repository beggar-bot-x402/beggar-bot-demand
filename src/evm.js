// On-chain data SKUs (pure compute, zero outbound): /v1/abidecode (calldata/ABI decode) + /v1/evmtx (raw signed tx RLP decode + tx hash + calldata decode).
import { recover, HALF_N } from "./secp.js";
const bad = (m) => ({ status: 400, body: { error: m } });
// ---- keccak-256 (BigInt lanes; inputs are small) ----
const RC = []; { let r = 1n; for (let i = 0; i < 24; i++) { let c = 0n; for (let j = 0; j < 7; j++) { if (r & 1n) c ^= 1n << ((1n << BigInt(j)) - 1n); r = (r << 1n) ^ (r & 0x80n ? 0x71n : 0n); r &= 0xffn; } RC.push(c); } }
const ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14], M = (1n << 64n) - 1n;
const rotl = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & M;
function f(s) { for (let r = 0; r < 24; r++) { const C = [0,1,2,3,4].map((x) => s[x] ^ s[x+5] ^ s[x+10] ^ s[x+15] ^ s[x+20]);
  for (let x = 0; x < 5; x++) { const D = C[(x+4)%5] ^ rotl(C[(x+1)%5], 1); for (let y = 0; y < 25; y += 5) s[x+y] ^= D; }
  const B = new Array(25); for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) B[y + 5*((2*x+3*y)%5)] = rotl(s[x+5*y], ROT[x+5*y]);
  for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) s[x+5*y] = B[x+5*y] ^ ((~B[(x+1)%5+5*y] & M) & B[(x+2)%5+5*y]);
  s[0] ^= RC[r]; } }
export function keccak(bytes) { const rate = 136, p = new Uint8Array(Math.floor(bytes.length / rate + 1) * rate); p.set(bytes); p[bytes.length] ^= 1; p[p.length-1] ^= 0x80;
  const s = new Array(25).fill(0n); for (let o = 0; o < p.length; o += rate) { for (let i = 0; i < 17; i++) { let v = 0n; for (let b = 7; b >= 0; b--) v = (v << 8n) | BigInt(p[o+i*8+b]); s[i] ^= v; } f(s); }
  const out = new Uint8Array(32); for (let i = 0; i < 4; i++) for (let b = 0; b < 8; b++) out[i*8+b] = Number((s[i] >> BigInt(8*b)) & 0xffn); return out; }
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h).trim().replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); const o = new Uint8Array(h.length/2); for (let i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i*2, 2), 16); return o; };
export const keccakHex = (s) => "0x" + hex(keccak(new TextEncoder().encode(s)));
export function checksum(a) { a = a.toLowerCase().replace(/^0x/, ""); const h = hex(keccak(new TextEncoder().encode(a))); return "0x" + [...a].map((c, i) => parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c).join(""); }
// ---- ABI types ----
function splitTop(s) { const out = []; let d = 0, cur = ""; for (const c of s) { if (c === "(") d++; if (c === ")") d--; if (c === "," && d === 0) { out.push(cur); cur = ""; } else cur += c; } if (cur.trim()) out.push(cur); return out.map((x) => x.trim()); }
export function parseSig(sig) { sig = String(sig).replace(/^function\s+/, "").trim(); const i = sig.indexOf("("); if (i < 1 || !sig.endsWith(")")) throw new Error("signature must look like name(type1,type2)");
  const name = sig.slice(0, i), inner = sig.slice(i + 1, -1); const params = splitTop(inner).map((p) => { const parts = p.split(/\s+(?![^(]*\))/); return { type: norm(parts[0]), name: parts.slice(1).filter((w) => !["indexed","memory","calldata","storage"].includes(w)).pop() || "" }; });
  const canon = `${name}(${params.map((p) => p.type).join(",")})`; return { name, params, canonical: canon, selector: keccakHex(canon).slice(0, 10) }; }
export function norm(t) { if (t.startsWith("(")) { const j = t.lastIndexOf(")"); return "(" + splitTop(t.slice(1, j)).map((x) => norm(x.split(/\s+(?![^(]*\))/)[0])).join(",") + ")" + t.slice(j + 1); } return t.replace(/^uint(?=$|\[)/, "uint256").replace(/^int(?=$|\[)/, "int256"); }
const isDyn = (t) => { if (t === "string" || t === "bytes" || /\[\]$/.test(t)) return true; const m = t.match(/^(.*)\[(\d+)\]$/); if (m) return isDyn(m[1]); if (t.startsWith("(")) return splitTop(t.slice(1, -1)).some(isDyn); return false; };
const headSize = (t) => { if (isDyn(t)) return 32; const m = t.match(/^(.*)\[(\d+)\]$/); if (m) return Number(m[2]) * headSize(m[1]); if (t.startsWith("(")) return splitTop(t.slice(1, -1)).reduce((a, x) => a + headSize(x), 0); return 32; };
const word = (b, o) => { if (o + 32 > b.length) throw new Error("data too short at offset " + o); return b.subarray(o, o + 32); };
const big = (w) => BigInt("0x" + (hex(w) || "0"));
const num = (b, o) => { const v = big(word(b, o)); if (v > BigInt(b.length)) throw new Error("offset/length out of range"); return Number(v); };
export function decTuple(types, b, base) { let o = base; return types.map((t) => { let v; if (isDyn(t)) v = decOne(t, b, base + num(b, o)); else v = decOne(t, b, o); o += headSize(t); return v; }); }
function decOne(t, b, o) {
  let m;
  if ((m = t.match(/^(.*)\[\]$/))) { const n = num(b, o); if (n > 1000) throw new Error("array too long"); return decTuple(Array(n).fill(m[1]), b, o + 32); }
  if ((m = t.match(/^(.*)\[(\d+)\]$/))) return decTuple(Array(Number(m[2])).fill(m[1]), b, o);
  if (t.startsWith("(")) return decTuple(splitTop(t.slice(1, -1)), b, o);
  const w = word(b, o);
  if (t === "address") return checksum(hex(w.subarray(12)));
  if (t === "bool") return big(w) !== 0n;
  if ((m = t.match(/^uint(\d*)$/))) return big(w).toString();
  if ((m = t.match(/^int(\d*)$/))) { let v = big(w); if (v >> 255n) v -= 1n << 256n; return v.toString(); }
  if ((m = t.match(/^bytes(\d+)$/))) return "0x" + hex(w.subarray(0, Number(m[1])));
  if (t === "bytes" || t === "string") { const n = num(b, o); const d = b.subarray(o + 32, o + 32 + n); if (d.length < n) throw new Error("data too short"); return t === "string" ? new TextDecoder().decode(d) : "0x" + hex(d); }
  throw new Error("unsupported type " + t);
}
export const KNOWN = ["transfer(address,uint256)", "transferFrom(address,address,uint256)", "approve(address,uint256)", "balanceOf(address)", "allowance(address,address)", "totalSupply()", "decimals()", "symbol()", "name()",
  "safeTransferFrom(address,address,uint256)", "safeTransferFrom(address,address,uint256,bytes)", "setApprovalForAll(address,bool)", "safeTransferFrom(address,address,uint256,uint256,bytes)", "mint(address,uint256)", "burn(uint256)",
  "deposit()", "withdraw(uint256)", "multicall(bytes[])", "multicall(uint256,bytes[])", "execute(bytes,bytes[],uint256)", "execute(bytes,bytes[])",
  "swapExactTokensForTokens(uint256,uint256,address[],address,uint256)", "swapExactETHForTokens(uint256,address[],address,uint256)", "swapExactTokensForETH(uint256,uint256,address[],address,uint256)", "swapTokensForExactTokens(uint256,uint256,address[],address,uint256)",
  "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)", "removeLiquidity(address,address,uint256,uint256,uint256,address,uint256)",
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))", "exactInput((bytes,address,uint256,uint256,uint256))", "exactOutputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))",
  "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,bytes32,uint8,bytes32)", "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes)", "receiveWithAuthorization(address,address,uint256,uint256,uint256,uint8,bytes32,bytes32)",
  "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", "increaseAllowance(address,uint256)", "decreaseAllowance(address,uint256)", "supply(address,uint256,address,uint16)", "borrow(address,uint256,uint256,uint16,address)", "repay(address,uint256,uint256,address)",
  "register(string,address,uint256,bytes32,address,bytes[],bool,uint16)", "setText(bytes32,string,string)", "setAddr(bytes32,address)", "aggregate((address,bytes)[])", "aggregate3((address,bool,bytes)[])", "tryAggregate(bool,(address,bytes)[])"];
let KMAP; const known = () => KMAP ||= new Map(KNOWN.map((s) => { const p = parseSig(s); return [p.selector, p]; }));
export function decodeCall(data, sigs) {
  const b = unhex(data); if (b.length < 4) return { selector: "0x" + hex(b), note: b.length ? "data shorter than a 4-byte selector" : "empty calldata (plain value transfer)" };
  const sel = "0x" + hex(b.subarray(0, 4)); const cands = []; for (const s of sigs || []) { const p = parseSig(s); if (p.selector === sel) cands.push(p); } if (!cands.length && known().has(sel)) cands.push(known().get(sel));
  if (!cands.length) return { selector: sel, decoded: false, note: "selector not in supplied signatures or built-in table; pass sig= (e.g. transfer(address,uint256))", words: Array.from({ length: Math.min(32, Math.floor((b.length - 4) / 32)) }, (_, i) => "0x" + hex(b.subarray(4 + i*32, 36 + i*32))) };
  const errs = []; for (const p of cands) { try { const vals = decTuple(p.params.map((x) => x.type), b.subarray(4), 0);
    const args = p.params.map((x, i) => ({ name: x.name || `arg${i}`, type: x.type, value: vals[i] })); return { selector: sel, decoded: true, function: p.canonical, source: (sigs || []).length ? "supplied" : "builtin", args, summary: summarize(p, vals) }; } catch (e) { errs.push(e.message); } }
  return { selector: sel, decoded: false, function: cands[0].canonical, error: errs[0] };
}
function summarize(p, v) { const n = p.name;
  if (n === "transfer") return `transfer ${v[1]} base units to ${v[0]}`; if (n === "transferFrom") return `move ${v[2]} base units from ${v[0]} to ${v[1]}`;
  if (n === "approve") return (BigInt(v[1]) >= (1n << 255n) ? "UNLIMITED approval" : `approve ${v[1]} base units`) + ` for spender ${v[0]}`;
  if (n === "setApprovalForAll") return `${v[1] ? "GRANT" : "revoke"} operator-for-all to ${v[0]}`; if (n === "permit") return `permit spender ${v[1]} for ${v[2]} (owner ${v[0]})`;
  if (n === "transferWithAuthorization" || n === "receiveWithAuthorization") return `EIP-3009 ${n}: ${v[2]} base units ${v[0]} → ${v[1]}, valid ${v[3]}–${v[4]}`; return `${n}(${v.length} args)`; }
export async function abidecode(a) {
  const data = a.data ?? a.calldata ?? a.input; if (!data) return bad("data required (0x-prefixed calldata hex)"); if (String(data).length > 200000) return bad("data too long (≤100KB)");
  let sigs = a.sig ?? a.sigs ?? a.signature ?? a.abi; if (typeof sigs === "string") sigs = sigs.includes(";") ? sigs.split(";") : [sigs];
  if (Array.isArray(sigs)) sigs = sigs.map((s) => typeof s === "object" && s?.type === "function" ? `${s.name}(${(s.inputs || []).map(ti).join(",")})` : s).filter((s) => typeof s === "string" && s.includes("(")).slice(0, 200);
  if (a.types) { try { const ty = String(a.types).split(/,(?![^(]*\))/).map((x) => norm(x.trim())); const b = unhex(data); return { status: 200, body: { mode: "raw_types", types: ty, values: decTuple(ty, b, 0) } }; } catch (e) { return bad(e.message); } }
  try { return { status: 200, body: decodeCall(data, sigs) }; } catch (e) { return bad(e.message); }
}
const ti = (x) => x.type.startsWith("tuple") ? "(" + x.components.map(ti).join(",") + ")" + x.type.slice(5) : x.type;
// ---- RLP + typed tx ----
function rlpEnc(x) { const len = (n, off) => { if (n < 56) return [off + n]; const h = n.toString(16), b = (h.length % 2 ? "0" + h : h).match(/../g).map((y) => parseInt(y, 16)); return [off + 55 + b.length, ...b]; };
  if (Array.isArray(x)) { const parts = x.map(rlpEnc), n = parts.reduce((a, p) => a + p.length, 0), o = new Uint8Array(len(n, 0xc0).length + n); const h = len(n, 0xc0); o.set(h); let i = h.length; for (const p of parts) { o.set(p, i); i += p.length; } return o; }
  if (x.length === 1 && x[0] < 0x80) return x; const h = len(x.length, 0x80), o = new Uint8Array(h.length + x.length); o.set(h); o.set(x, h.length); return o; }
const beBytes = (v) => { if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
function sender(type, L, b0) { // b0 = full raw bytes; returns {from, public_key, signing_hash, high_s}
  let fields, v, r, s, parity, pre;
  if (type === 0) { v = BigInt(I(L[6])); r = L[7]; s = L[8];
    if (v >= 35n) { const cid = (v - 35n) / 2n; parity = Number((v - 35n) % 2n); fields = [...L.slice(0, 6), beBytes(cid), new Uint8Array(0), new Uint8Array(0)]; }
    else if (v === 27n || v === 28n) { parity = Number(v - 27n); fields = L.slice(0, 6); } else throw new Error("bad legacy v " + v);
    pre = null; }
  else { const k = L.length - 3; fields = L.slice(0, k); parity = Number(BigInt(I(L[k]))); r = L[k + 1]; s = L[k + 2]; pre = type; }
  const enc = rlpEnc(fields), msg = pre === null ? enc : new Uint8Array([pre, ...enc]), h = keccak(msg);
  const sv = BigInt(I(s)), [x, y] = recover(h, BigInt(I(r)), sv, parity);
  const pub = unhex(x.toString(16).padStart(64, "0") + y.toString(16).padStart(64, "0")), addr = checksum(hex(keccak(pub)).slice(24));
  return { from: addr, public_key: "0x04" + hex(pub), signing_hash: "0x" + hex(h), high_s: sv > HALF_N };
}
function rlp(b, o = 0) { const p = b[o]; if (p === undefined) throw new Error("rlp: truncated");
  if (p < 0x80) return [b.subarray(o, o + 1), o + 1];
  if (p < 0xb8) { const n = p - 0x80; chk(b, o + 1 + n); return [b.subarray(o + 1, o + 1 + n), o + 1 + n]; }
  if (p < 0xc0) { const ll = p - 0xb7, n = Number(big(pad(b.subarray(o + 1, o + 1 + ll)))); chk(b, o + 1 + ll + n); return [b.subarray(o + 1 + ll, o + 1 + ll + n), o + 1 + ll + n]; }
  let s, e; if (p < 0xf8) { s = o + 1; e = s + p - 0xc0; } else { const ll = p - 0xf7; s = o + 1 + ll; e = s + Number(big(pad(b.subarray(o + 1, s)))); } chk(b, e);
  const out = []; let i = s; while (i < e) { const [v, n] = rlp(b, i); out.push(v); i = n; } return [out, e]; }
const chk = (b, e) => { if (e > b.length) throw new Error("rlp: length exceeds input"); };
const pad = (u) => { const o = new Uint8Array(32); o.set(u.subarray(Math.max(0, u.length - 32)), 32 - Math.min(32, u.length)); return o; };
const I = (u) => (u.length ? BigInt("0x" + hex(u)) : 0n).toString(); const A = (u) => u.length ? checksum(hex(u)) : null; const H = (u) => "0x" + hex(u);
const units = (s, d) => { const v = BigInt(s), D = 10n ** BigInt(d), fr = (v % D).toString().padStart(d, "0").replace(/0+$/, ""); return (v / D).toString() + (fr ? "." + fr : ""); };
const gwei = (s) => units(s, 9), eth = (s) => units(s, 18);
const CHAINS = { 1: "Ethereum", 10: "Optimism", 56: "BNB Chain", 137: "Polygon", 8453: "Base", 84532: "Base Sepolia", 42161: "Arbitrum One", 11155111: "Sepolia", 324: "zkSync Era", 59144: "Linea", 534352: "Scroll", 43114: "Avalanche C" };
export async function evmtx(a) {
  const raw = a.raw ?? a.tx ?? a.rawTransaction; if (!raw) return bad("raw required (0x signed transaction hex, e.g. from eth_signTransaction / explorer 'raw tx')"); if (String(raw).length > 260000) return bad("raw too long");
  let b; try { b = unhex(raw); } catch (e) { return bad(e.message); } if (!b.length) return bad("empty");
  try { let type = 0, body = b; if (b[0] < 0x7f) { type = b[0]; body = b.subarray(1); } const [L, end] = rlp(body); if (!Array.isArray(L)) throw new Error("not an RLP list"); if (end !== body.length) throw new Error("trailing bytes after RLP");
    const out = { type, type_name: { 0: "legacy", 1: "EIP-2930", 2: "EIP-1559", 3: "EIP-4844 blob", 4: "EIP-7702 setcode" }[type] || "unknown", hash: "0x" + hex(keccak(b)) };
    let f; if (type === 0) { if (L.length !== 9) throw new Error("legacy tx needs 9 fields");
      const v = BigInt(I(L[6])); f = { nonce: I(L[0]), gas_price: I(L[1]), gas_limit: I(L[2]), to: A(L[3]), value: I(L[4]), data: L[5], v: v.toString(), r: H(L[7]), s: H(L[8]) }; f.chain_id = v >= 35n ? ((v - 35n) / 2n).toString() : null; f.eip155 = v >= 35n; }
    else if (type === 2 || type === 3 || type === 4 || type === 1) { const n = L; f = { chain_id: I(n[0]), nonce: I(n[1]) };
      if (type === 1) Object.assign(f, { gas_price: I(n[2]), gas_limit: I(n[3]), to: A(n[4]), value: I(n[5]), data: n[6], access_list: n[7], y_parity: I(n[8]), r: H(n[9]), s: H(n[10]) });
      else Object.assign(f, { max_priority_fee_per_gas: I(n[2]), max_fee_per_gas: I(n[3]), gas_limit: I(n[4]), to: A(n[5]), value: I(n[6]), data: n[7], access_list: n[8] });
      if (type === 2) Object.assign(f, { y_parity: I(n[9]), r: H(n[10]), s: H(n[11]) }); if (type === 3) Object.assign(f, { max_fee_per_blob_gas: I(n[9]), blob_versioned_hashes: n[10].map(H), y_parity: I(n[11]), r: H(n[12]), s: H(n[13]) });
      if (type === 4) Object.assign(f, { authorization_list: n[9].map((x) => ({ chain_id: I(x[0]), address: A(x[1]), nonce: I(x[2]) })), y_parity: I(n[10]), r: H(n[11]), s: H(n[12]) }); }
    else throw new Error("unsupported tx type " + type);
    const data = H(f.data); f.access_list = Array.isArray(f.access_list) ? f.access_list.map((x) => ({ address: A(x[0]), storage_keys: x[1].map(H) })) : undefined;
    const call = f.to === null ? { contract_creation: true, init_code_bytes: f.data.length } : decodeCall(data, a.sig ? String(a.sig).split(";") : undefined); delete f.data;
    const maxFee = BigInt(f.max_fee_per_gas ?? f.gas_price) * BigInt(f.gas_limit);
    Object.assign(out, f, { chain: CHAINS[f.chain_id] || null, data_bytes: (data.length - 2) / 2, value_eth: eth(f.value), max_fee_gwei: gwei(f.max_fee_per_gas ?? f.gas_price), max_cost_eth: eth((maxFee + BigInt(f.value)).toString()), call,
      note: "decoded offline incl. secp256k1 sender recovery — check hash on an explorer for inclusion" });
    try { const sd = sender(type, L, b); out.from = sd.from; out.sender = sd; if (sd.high_s) out.warning = "high-s signature (non-canonical; rejected by post-Homestead nodes)"; } catch (e) { out.from = null; out.sender_error = e.message; }
    return { status: 200, body: out };
  } catch (e) { return { status: 200, body: { valid: false, error: e.message } }; }
}
