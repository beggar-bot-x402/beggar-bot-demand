// /v1/userop (ERC-4337 UserOperation decode + userOpHash, EntryPoint v0.6/v0.7/v0.8) and /v1/evmaddr (EIP-55, CREATE/CREATE2/CREATE3 address prediction, ENS namehash, pubkey→address).
// Pure compute, zero outbound, no RPC, no keys.
import { keccak, checksum, decodeCall } from "./evm.js";
import { recoverAddress } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const te = new TextEncoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h ?? "").trim().replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const w32 = (v) => unhex(BigInt.asUintN(256, v).toString(16).padStart(64, "0"));
const big = (v, f) => { if (v === undefined || v === null || v === "") return 0n; try { const b = BigInt(typeof v === "number" ? Math.trunc(v) : String(v).trim()); if (b < 0n || b >= 1n << 256n) throw 0; return b; } catch { throw new Error(`${f} must be a uint (decimal or 0x hex)`); } };
const addr = (v, f) => { const s = String(v ?? "").trim(); if (!/^0x[0-9a-fA-F]{40}$/.test(s)) throw new Error(`${f} must be a 0x 20-byte address`); return s; };
const aw = (a) => cat(new Uint8Array(12), unhex(a));
const H = (u) => "0x" + hex(u);
const bytesHex = (u) => (u.length ? "0x" + hex(u) : "0x");
// ---------------- ERC-4337 ----------------
export const ENTRYPOINTS = { "0.6": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "0.7": "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "0.8": "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" };
const EP_VER = Object.fromEntries(Object.entries(ENTRYPOINTS).map(([v, a]) => [a.toLowerCase(), v]));
const PACKED_TYPEHASH = keccak(te.encode("PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)"));
const ACCOUNT_SIGS = ["execute(address,uint256,bytes)", "executeBatch(address[],bytes[])", "executeBatch(address[],uint256[],bytes[])", "executeBatch((address,uint256,bytes)[])", "executeUserOp(address,uint256,bytes,uint8)",
  "executeUserOpWithErrorString(address,uint256,bytes,uint8)", "execute(bytes32,bytes)", "executeCall(address,uint256,bytes)", "execTransactionFromEntrypoint(address,uint256,bytes)", "executeAndRevert(address,uint256,bytes,uint8)"];
const u128pair = (b32, a, b) => { const v = big(b32, "packed field"); return { [a]: (v >> 128n).toString(), [b]: (v & ((1n << 128n) - 1n)).toString() }; };
function normalizeOp(op) {
  const g = (k) => op[k]; const isV06 = g("callGasLimit") !== undefined && g("initCode") !== undefined && g("accountGasLimits") === undefined && g("factory") === undefined && g("paymaster") === undefined;
  const o = { sender: addr(g("sender"), "sender"), nonce: big(g("nonce"), "nonce"), callData: unhex(g("callData") ?? "0x"), signature: unhex(g("signature") ?? "0x"), preVerificationGas: big(g("preVerificationGas"), "preVerificationGas") };
  if (isV06) { Object.assign(o, { shape: "v0.6", initCode: unhex(g("initCode")), paymasterAndData: unhex(g("paymasterAndData") ?? "0x"), callGasLimit: big(g("callGasLimit"), "callGasLimit"), verificationGasLimit: big(g("verificationGasLimit"), "verificationGasLimit"), maxFeePerGas: big(g("maxFeePerGas"), "maxFeePerGas"), maxPriorityFeePerGas: big(g("maxPriorityFeePerGas"), "maxPriorityFeePerGas"), pmVer: 0n, pmPost: 0n }); return o; }
  if (g("accountGasLimits") !== undefined) { // packed (on-chain) form
    const agl = big(g("accountGasLimits"), "accountGasLimits"), gf = big(g("gasFees"), "gasFees"), M = (1n << 128n) - 1n; const pmd = unhex(g("paymasterAndData") ?? "0x");
    Object.assign(o, { shape: "packed", initCode: unhex(g("initCode") ?? "0x"), paymasterAndData: pmd, verificationGasLimit: agl >> 128n, callGasLimit: agl & M, maxPriorityFeePerGas: gf >> 128n, maxFeePerGas: gf & M,
      pmVer: pmd.length >= 52 ? BigInt("0x" + hex(pmd.subarray(20, 36))) : 0n, pmPost: pmd.length >= 52 ? BigInt("0x" + hex(pmd.subarray(36, 52))) : 0n }); return o; }
  // unpacked v0.7/0.8 RPC form
  const factory = g("factory"), pm = g("paymaster"); const pmVer = big(g("paymasterVerificationGasLimit"), "paymasterVerificationGasLimit"), pmPost = big(g("paymasterPostOpGasLimit"), "paymasterPostOpGasLimit");
  const initCode = factory && !/^0x0{40}$/i.test(factory) ? cat(unhex(factory.length === 42 ? factory : addr(factory, "factory")), unhex(g("factoryData") ?? "0x")) : new Uint8Array(0);
  const paymasterAndData = pm && !/^0x0{40}$/i.test(pm) ? cat(unhex(addr(pm, "paymaster")), unhex(pmVer.toString(16).padStart(32, "0")), unhex(pmPost.toString(16).padStart(32, "0")), unhex(g("paymasterData") ?? "0x")) : new Uint8Array(0);
  Object.assign(o, { shape: "v0.7-unpacked", initCode, paymasterAndData, callGasLimit: big(g("callGasLimit"), "callGasLimit"), verificationGasLimit: big(g("verificationGasLimit"), "verificationGasLimit"), maxFeePerGas: big(g("maxFeePerGas"), "maxFeePerGas"), maxPriorityFeePerGas: big(g("maxPriorityFeePerGas"), "maxPriorityFeePerGas"), pmVer, pmPost });
  if (g("eip7702Auth")) o.eip7702 = true; return o;
}
const packed = (o) => ({ accountGasLimits: w32((o.verificationGasLimit << 128n) | o.callGasLimit), gasFees: w32((o.maxPriorityFeePerGas << 128n) | o.maxFeePerGas) });
export function userOpHash(o, version, entryPoint, chainId) {
  if (version === "0.6") { const inner = keccak(cat(aw(o.sender), w32(o.nonce), keccak(o.initCode), keccak(o.callData), w32(o.callGasLimit), w32(o.verificationGasLimit), w32(o.preVerificationGas), w32(o.maxFeePerGas), w32(o.maxPriorityFeePerGas), keccak(o.paymasterAndData)));
    return keccak(cat(inner, aw(entryPoint), w32(chainId))); }
  const p = packed(o);
  if (version === "0.7") { const inner = keccak(cat(aw(o.sender), w32(o.nonce), keccak(o.initCode), keccak(o.callData), p.accountGasLimits, w32(o.preVerificationGas), p.gasFees, keccak(o.paymasterAndData)));
    return keccak(cat(inner, aw(entryPoint), w32(chainId))); }
  // 0.8: EIP-712 over PackedUserOperation, domain {name:"ERC4337",version:"1",chainId,verifyingContract:entryPoint}
  const dom = keccak(cat(keccak(te.encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")), keccak(te.encode("ERC4337")), keccak(te.encode("1")), w32(chainId), aw(entryPoint)));
  const sh = keccak(cat(PACKED_TYPEHASH, aw(o.sender), w32(o.nonce), keccak(o.initCode), keccak(o.callData), p.accountGasLimits, w32(o.preVerificationGas), p.gasFees, keccak(o.paymasterAndData)));
  return keccak(cat(new Uint8Array([0x19, 0x01]), dom, sh));
}
const eth = (v) => { const D = 10n ** 18n, fr = (v % D).toString().padStart(18, "0").replace(/0+$/, ""); return (v / D).toString() + (fr ? "." + fr : ""); };
function decodeInner(cd, depth = 0) {
  if (!cd || cd.length < 4) return null; const d = decodeCall(H(cd), ACCOUNT_SIGS); const r = decodeCall(H(cd)); const dec = d.decoded ? d : r;
  if (!dec.decoded) return { selector: dec.selector, decoded: false };
  const out = { selector: dec.selector, function: dec.function, summary: dec.summary, calls: [] }; const v = Object.fromEntries(dec.args.map((x) => [x.name, x.value])); const A = dec.args.map((x) => x.value); const f = dec.function;
  const one = (to, value, data) => { const c = { to, value: String(value ?? "0"), value_eth: eth(BigInt(value ?? 0)) }; if (data && data !== "0x") { c.data_bytes = (data.length - 2) / 2; if (depth < 1) { const inner = decodeCall(data); c.decoded = inner.decoded ? { function: inner.function, args: inner.args, summary: inner.summary } : { selector: inner.selector, decoded: false }; } } return c; };
  if (/^(execute|executeCall|execTransactionFromEntrypoint|executeUserOp|executeUserOpWithErrorString|executeAndRevert)\(address,uint256,bytes/.test(f)) out.calls.push(one(A[0], A[1], A[2]));
  else if (f === "executeBatch(address[],bytes[])") A[0].forEach((t, i) => out.calls.push(one(t, "0", A[1][i])));
  else if (f === "executeBatch(address[],uint256[],bytes[])") A[0].forEach((t, i) => out.calls.push(one(t, A[1][i], A[2][i])));
  else if (f === "executeBatch((address,uint256,bytes)[])") A[0].forEach((c) => out.calls.push(one(c[0], c[1], c[2])));
  else if (f === "execute(bytes32,bytes)") { out.erc7579_mode = A[0]; const ct = A[0].slice(2, 4); const ed = unhex(A[1]);
    if (ct === "00" && ed.length >= 52) out.calls.push(one(checksum(hex(ed.subarray(0, 20))), BigInt("0x" + hex(ed.subarray(20, 52))).toString(), bytesHex(ed.subarray(52))));
    else if (ct === "01") out.note = "ERC-7579 batch mode; executionData is abi-encoded (address,uint256,bytes)[]"; }
  void v; return out;
}
export async function userop(a) {
  let op = a.userop ?? a.user_op ?? a.userOp ?? a.op; if (typeof op === "string") { if (op.length > 300000) return bad("userop too long"); try { op = JSON.parse(op); } catch { return bad("userop must be JSON"); } }
  if (!op || typeof op !== "object") { const keys = ["sender", "nonce", "callData"]; if (keys.every((k) => a[k] !== undefined)) op = a; else return bad("userop required: JSON UserOperation (v0.6 fields, v0.7/0.8 unpacked RPC fields, or packed accountGasLimits/gasFees form)"); }
  if (op.userOperation && typeof op.userOperation === "object") op = op.userOperation;
  let o; try { o = normalizeOp(op); } catch (e) { return bad(e.message); }
  let chainId; try { chainId = big(a.chain_id ?? a.chainId ?? 8453, "chain_id"); } catch (e) { return bad(e.message); }
  let ep = a.entrypoint ?? a.entry_point ?? a.entryPoint, ver = a.version ? String(a.version).replace(/^v/, "") : null;
  if (ver && !ENTRYPOINTS[ver]) return bad("version must be 0.6, 0.7 or 0.8");
  if (ep) { try { ep = addr(ep, "entrypoint"); } catch (e) { return bad(e.message); } ver ||= EP_VER[ep.toLowerCase()] || (o.shape === "v0.6" ? "0.6" : "0.7"); }
  else { ver ||= o.shape === "v0.6" ? "0.6" : "0.7"; ep = ENTRYPOINTS[ver]; }
  if (o.shape === "v0.6" && ver !== "0.6") return bad("v0.6-shaped op (callGasLimit + initCode) cannot be hashed for EntryPoint " + ver);
  if (o.shape !== "v0.6" && ver === "0.6") return bad("v0.7/0.8-shaped op cannot be hashed for EntryPoint 0.6");
  const h = userOpHash(o, ver, ep, chainId);
  const out = { entrypoint_version: ver, entrypoint: checksum(ep.slice(2)), chain_id: chainId.toString(), input_shape: o.shape, user_op_hash: H(h), sender: checksum(o.sender.slice(2)), nonce: o.nonce.toString(), nonce_key: (o.nonce >> 64n).toString(), nonce_seq: (o.nonce & ((1n << 64n) - 1n)).toString() };
  if (ver !== "0.6") { const alt = ver === "0.7" ? "0.8" : "0.7"; out.alt_hash = { version: alt, entrypoint: ENTRYPOINTS[alt], user_op_hash: H(userOpHash(o, alt, ENTRYPOINTS[alt], chainId)) }; const p = packed(o); out.packed = { initCode: bytesHex(o.initCode), accountGasLimits: H(p.accountGasLimits), gasFees: H(p.gasFees), paymasterAndData: bytesHex(o.paymasterAndData) }; }
  if (o.initCode.length >= 20) { out.deploys_account = true; out.factory = checksum(hex(o.initCode.subarray(0, 20))); out.factory_data_bytes = o.initCode.length - 20; } else out.deploys_account = false;
  if (o.paymasterAndData.length >= 20) { out.paymaster = checksum(hex(o.paymasterAndData.subarray(0, 20))); if (ver !== "0.6" && o.paymasterAndData.length >= 52) { out.paymaster_verification_gas_limit = o.pmVer.toString(); out.paymaster_post_op_gas_limit = o.pmPost.toString(); out.paymaster_data = bytesHex(o.paymasterAndData.subarray(52)); } else out.paymaster_data = bytesHex(o.paymasterAndData.subarray(20)); out.gas_sponsored = true; } else out.gas_sponsored = false;
  const gas = o.callGasLimit + o.verificationGasLimit + o.preVerificationGas + (ver === "0.6" && out.paymaster ? o.verificationGasLimit * 2n : 0n) + o.pmVer + o.pmPost;
  out.gas = { callGasLimit: o.callGasLimit.toString(), verificationGasLimit: o.verificationGasLimit.toString(), preVerificationGas: o.preVerificationGas.toString(), maxFeePerGas: o.maxFeePerGas.toString(), maxPriorityFeePerGas: o.maxPriorityFeePerGas.toString(), total_gas_limit: gas.toString(), max_cost_wei: (gas * o.maxFeePerGas).toString(), max_cost_eth: eth(gas * o.maxFeePerGas) };
  out.call = decodeInner(o.callData); out.call_data_bytes = o.callData.length;
  const warn = []; if (o.maxPriorityFeePerGas > o.maxFeePerGas) warn.push("maxPriorityFeePerGas > maxFeePerGas"); if (!o.callData.length) warn.push("empty callData");
  for (const c of out.call?.calls || []) if (c.decoded?.summary && /UNLIMITED|GRANT operator/.test(c.decoded.summary)) warn.push("inner call: " + c.decoded.summary);
  if (o.signature.length === 65) { const cands = {}; try { cands.raw_hash = recoverAddress(h, H(o.signature)).address; } catch {} try { cands.eth_signed_message = recoverAddress(keccak(cat(te.encode("\x19Ethereum Signed Message:\n32"), h)), H(o.signature)).address; } catch {}
    out.signature = { bytes: 65, ecdsa_signer_candidates: cands, note: "Account-specific: SimpleAccount/Light/Coinbase owners sign the eth_signed_message form; validate against the account's owner (EIP-1271 not checked)" };
    if (a.expected_signer) { const e = String(a.expected_signer).toLowerCase(); out.signature.expected_signer = a.expected_signer; out.signature.matches = Object.values(cands).some((x) => x.toLowerCase() === e); } }
  else out.signature = { bytes: o.signature.length, note: o.signature.length ? "non-65-byte signature (smart-account/validator specific, e.g. WebAuthn, Safe, Kernel prefix); not recovered" : "empty signature (unsigned / gas-estimation op)" };
  if (o.eip7702) warn.push("eip7702Auth present: v0.8 hashes replace initCode with the delegate address when initCode starts with 0x7702; supply initCode accordingly");
  out.warnings = warn; out.note = "offline: hash computed from supplied fields; no RPC, bundler or simulation"; return { status: 200, body: out };
}
// ---------------- address toolkit ----------------
const P = 2n ** 256n - 2n ** 32n - 977n;
const powm = (b, e, m) => { let r = 1n; b %= m; while (e) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; };
function rlpBytes(b) { if (b.length === 1 && b[0] < 0x80) return b; if (b.length < 56) return cat(new Uint8Array([0x80 + b.length]), b); throw new Error("rlp too long"); }
const beBytes = (v) => { if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
export function createAddress(deployer, nonce) { const body = cat(rlpBytes(unhex(deployer)), rlpBytes(beBytes(nonce))); return checksum(hex(keccak(cat(new Uint8Array([0xc0 + body.length]), body))).slice(24)); }
export function create2Address(deployer, salt32, initHash) { return checksum(hex(keccak(cat(new Uint8Array([0xff]), unhex(deployer), salt32, initHash))).slice(24)); }
const CREATE3_PROXY_HASH = unhex("21c35dbe1b344a2488cf3321d6ce542f8e9f305544ff09e4993a62319a497c1f"); // Solady/0xSequence CREATE3 proxy initcode hash
export function namehash(name) { let node = new Uint8Array(32); const labels = name ? name.split(".") : []; for (let i = labels.length - 1; i >= 0; i--) node = keccak(cat(node, keccak(te.encode(labels[i])))); return node; }
function pubToAddress(pk) { let b = unhex(pk); if (b.length === 65 && b[0] === 4) b = b.subarray(1);
  else if (b.length === 33 && (b[0] === 2 || b[0] === 3)) { const x = BigInt("0x" + hex(b.subarray(1))); if (x >= P) throw new Error("invalid x"); const y2 = (x ** 3n + 7n) % P; let y = powm(y2, (P + 1n) / 4n, P); if (y * y % P !== y2) throw new Error("point not on curve"); if ((y & 1n) !== BigInt(b[0] & 1)) y = P - y; b = cat(b.subarray(1), w32(y)); }
  if (b.length !== 64) throw new Error("pubkey must be 33-byte compressed, 65-byte 0x04 or 64-byte raw");
  const x = BigInt("0x" + hex(b.subarray(0, 32))), y = BigInt("0x" + hex(b.subarray(32))); if ((y * y - x ** 3n - 7n) % P !== 0n) throw new Error("point not on secp256k1");
  return { address: checksum(hex(keccak(b)).slice(24)), uncompressed: "0x04" + hex(b), compressed: "0x0" + (2 + Number(y & 1n)) + hex(b.subarray(0, 32)) }; }
function checkAddr(s) { s = String(s).trim(); if (!/^(0x)?[0-9a-fA-F]{40}$/.test(s)) return { input: s, valid: false, reason: "not 20-byte hex" };
  const raw = s.replace(/^0x/i, ""), cs = checksum(raw), mixed = /[a-f]/.test(raw) && /[A-F]/.test(raw);
  const o = { input: s, valid: true, checksummed: cs, lowercase: "0x" + raw.toLowerCase(), checksum_status: !mixed ? "unchecksummed (all one case)" : cs.slice(2) === raw ? "valid EIP-55" : "INVALID EIP-55 checksum (typo?)", zero_address: /^0{40}$/.test(raw),
    precompile: /^0{38}(0[1-9a-f]|1[01])$/i.test(raw) && !/^0{40}$/.test(raw), ens_reverse_node: H(namehash(raw.toLowerCase() + ".addr.reverse")) };
  if (mixed && cs.slice(2) !== raw) o.valid = false; return o; }
export async function evmaddr(a) {
  const out = {}; const ops = [];
  try {
    if (a.address) { const list = (Array.isArray(a.address) ? a.address : String(a.address).split(/[,\s]+/)).filter(Boolean); if (list.length > 100) return bad("max 100 addresses"); out.addresses = list.map(checkAddr); ops.push("checksum"); }
    if (a.deployer !== undefined) { const d = addr(a.deployer, "deployer");
      if (a.nonce !== undefined && a.nonce !== "") { const n = big(a.nonce, "nonce"); if (n >= 1n << 64n) return bad("nonce must be < 2^64"); out.create = { deployer: checksum(d.slice(2)), nonce: n.toString(), address: createAddress(d, n) }; ops.push("create"); }
      if (a.salt !== undefined && a.salt !== "") { let s = String(a.salt).trim(); let salt; if (/^0x[0-9a-f]{0,64}$/i.test(s)) salt = unhex(s.slice(2).padStart(64, "0")); else if (/^\d+$/.test(s)) salt = w32(BigInt(s)); else salt = keccak(te.encode(s));
        const saltNote = /^0x[0-9a-f]{64}$/i.test(s) ? "bytes32 as given" : /^0x/i.test(s) ? "hex left-padded to 32 bytes" : /^\d+$/.test(s) ? "uint256" : "keccak256(utf8 salt)";
        if (a.init_code !== undefined || a.init_code_hash !== undefined) { const ih = a.init_code_hash ? unhex(a.init_code_hash) : keccak(unhex(a.init_code)); if (ih.length !== 32) return bad("init_code_hash must be 32 bytes"); if (a.init_code && String(a.init_code).length > 200000) return bad("init_code too long (≤100KB)");
          out.create2 = { deployer: checksum(d.slice(2)), salt: H(salt), salt_interpretation: saltNote, init_code_hash: H(ih), address: create2Address(d, salt, ih) }; ops.push("create2"); }
        if (String(a.create3) === "true" || (a.init_code === undefined && a.init_code_hash === undefined)) { const proxy = create2Address(d, salt, CREATE3_PROXY_HASH); out.create3 = { deployer: checksum(d.slice(2)), salt: H(salt), salt_interpretation: saltNote, proxy, address: createAddress(proxy, 1n), note: "Solady/0xSequence CREATE3 (proxy initcode hash 0x21c3…7c1f). CreateX guards/permissioned salts hash the salt first — pass the guarded salt" }; ops.push("create3"); } } }
    if (a.name !== undefined && a.name !== "") { const raw = String(a.name).trim(); if (raw.length > 255) return bad("name too long"); const n = raw.toLowerCase().replace(/\.$/, ""); const labels = n.split(".");
      if (labels.some((l) => !l)) return bad("empty label in name"); const nonAscii = /[^\x00-\x7f]/.test(n);
      out.ens = { input: raw, normalized: n, namehash: H(namehash(n)), labelhash: H(keccak(te.encode(labels[0]))), parent_namehash: H(namehash(labels.slice(1).join("."))), labels: labels.length, token_id_erc721: labels.length === 2 && labels[1] === "eth" ? BigInt(H(keccak(te.encode(labels[0])))).toString() : null, wrapped_token_id_erc1155: BigInt(H(namehash(n))).toString(),
        warning: nonAscii ? "non-ASCII label: only lowercased, full ENSIP-15 normalization not applied — confirm with an ENSIP-15 library before using" : raw !== n ? "input lowercased" : null }; ops.push("ens_namehash"); }
    if (a.pubkey) { out.pubkey = pubToAddress(a.pubkey); ops.push("pubkey_to_address"); }
  } catch (e) { return bad(e.message); }
  if (!ops.length) return bad("provide address (checksum/validate), deployer+nonce (CREATE), deployer+salt+init_code|init_code_hash (CREATE2), deployer+salt (CREATE3), name (ENS namehash) and/or pubkey");
  return { status: 200, body: { ops, ...out, note: "pure compute, no RPC: predicted addresses are deterministic; whether code is deployed there is not checked" } };
}
