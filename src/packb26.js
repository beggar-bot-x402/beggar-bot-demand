// packb26 (builder B, 2026-11-02): sigformat, selectors, codemeta, aeropool. $0 upstream (keyless public RPCs / pure compute).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak, keccakHex, KNOWN } from "./evm.js";
import { recoverAddress } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h ?? "").trim().replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const te = new TextEncoder();
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n, HALF = N >> 1n;
const h64 = (v) => "0x" + v.toString(16).padStart(64, "0");
// ---- sigformat ----
export async function sigformat(q) {
  let b; try { b = unhex(q.signature || q.sig); } catch { return bad("signature must be hex"); }
  if (b.length !== 65 && b.length !== 64) return bad("signature must be 65 bytes (r,s,v) or 64 bytes (EIP-2098)");
  const r = BigInt("0x" + hex(b.slice(0, 32))); let s, yp, vraw = null;
  if (b.length === 65) { s = BigInt("0x" + hex(b.slice(32, 64))); vraw = b[64]; yp = vraw < 27 ? vraw : vraw >= 35 ? (vraw - 35) % 2 : vraw - 27; } else { const vs = BigInt("0x" + hex(b.slice(32))); yp = Number(vs >> 255n); s = vs & ((1n << 255n) - 1n); }
  if (yp > 1) return bad("bad v / recovery id"); if (r === 0n || r >= N || s === 0n || s >= N) return bad("r or s out of curve range");
  const high = s > HALF; const ls = high ? N - s : s, lyp = high ? 1 - yp : yp;
  const full = (ss, y) => h64(r) + ss.toString(16).padStart(64, "0") + (27 + y).toString(16);
  const compact = (ss, y) => h64(r) + ((BigInt(y) << 255n) | ss).toString(16).padStart(64, "0");
  const out = { input_length: b.length, format: b.length === 64 ? "EIP-2098 compact" : "r,s,v (65)", r: h64(r), s: h64(s), v: 27 + yp, v_raw: vraw, y_parity: yp, eip155_chain_id: vraw >= 35 ? Math.floor((vraw - 35) / 2) : null, high_s: high, malleable: high, rsv: full(s, yp), compact_2098: high ? null : compact(s, yp), normalized_low_s: { rsv: full(ls, lyp), compact_2098: compact(ls, lyp), v: 27 + lyp }, warnings: high ? ["high-s signature: OpenZeppelin ECDSA and most contracts reject it — use normalized_low_s"] : [] };
  let hash = null; try { if (q.hash) hash = unhex(q.hash); else if (q.message != null) { const m = te.encode(String(q.message)); hash = keccak(new Uint8Array([...te.encode("\x19Ethereum Signed Message:\n" + m.length), ...m])); } } catch { return bad("hash must be 32-byte hex"); }
  if (hash) { if (hash.length !== 32) return bad("hash must be 32 bytes"); try { const rec = recoverAddress(hash, full(ls, lyp)); out.signer = rec.address; out.public_key = rec.public_key; if (isA(q.expected)) out.matches_expected = rec.address.toLowerCase() === q.expected.toLowerCase(); } catch (e) { out.recover_error = String(e.message || e); } }
  return ok(out);
}
// ---- selectors ----
const EXTRA = ["name()", "symbol()", "decimals()", "owner()", "pendingOwner()", "renounceOwnership()", "transferOwnership(address)", "acceptOwnership()", "paused()", "pause()", "unpause()", "hasRole(bytes32,address)", "grantRole(bytes32,address)", "revokeRole(bytes32,address)", "getRoleAdmin(bytes32)", "DEFAULT_ADMIN_ROLE()", "supportsInterface(bytes4)", "upgradeTo(address)", "upgradeToAndCall(address,bytes)", "proxiableUUID()", "implementation()", "admin()", "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", "nonces(address)", "DOMAIN_SEPARATOR()", "eip712Domain()", "mint(address,uint256)", "burn(uint256)", "burnFrom(address,uint256)", "ownerOf(uint256)", "safeTransferFrom(address,address,uint256)", "safeTransferFrom(address,address,uint256,bytes)", "setApprovalForAll(address,bool)", "isApprovedForAll(address,address)", "getApproved(uint256)", "tokenURI(uint256)", "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)", "receiveWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)", "authorizationState(address,bytes32)", "cancelAuthorization(address,bytes32,uint8,bytes32,bytes32)", "isBlacklisted(address)", "blacklist(address)", "isValidSignature(bytes32,bytes)", "execute(address,uint256,bytes)", "executeBatch(address[],uint256[],bytes[])", "validateUserOp((address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes),bytes32,uint256)", "entryPoint()", "multicall(bytes[])", "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)", "getOwners()", "getThreshold()", "nonce()", "deposit()", "withdraw(uint256)", "asset()", "totalAssets()", "convertToAssets(uint256)", "convertToShares(uint256)", "deposit(uint256,address)", "redeem(uint256,address,address)", "swap(uint256,uint256,address,bytes)", "getReserves()", "token0()", "token1()", "slot0()", "liquidity()", "latestRoundData()", "flashLoan(address,address,uint256,bytes)", "setFee(uint256)", "withdrawAll()", "sweep(address)", "rescueTokens(address,address,uint256)", "selfdestruct()", "kill()"];
const SMAP = Object.fromEntries([...KNOWN, ...EXTRA].map((s) => [keccakHex(s).slice(2, 10), s]));
const IFACES = { "ERC-20": ["a9059cbb", "095ea7b3", "23b872dd", "70a08231", "dd62ed3e", "18160ddd"], "ERC-721": ["6352211e", "42842e0e", "a22cb465", "081812fc"], "EIP-2612 permit": ["d505accf", "7ecebe00"], "EIP-3009": ["e3ee160e"], Ownable: ["8da5cb5b", "f2fde38b"], AccessControl: ["91d14854", "2f2ff15d"], Pausable: ["5c975abb"], "UUPS upgradeable": ["4f1ef286"], "ERC-4626 vault": ["38d52e0f", "01e1d114"], "ERC-1271": ["1626ba7e"], "Safe multisig": ["6a761202", "a0e67e2b"], "Uniswap-v2 pair": ["0902f1ac", "022c0d9f"] };
const RISKY = ["mint(address,uint256)", "blacklist(address)", "pause()", "upgradeTo(address)", "upgradeToAndCall(address,bytes)", "setFee(uint256)", "withdrawAll()", "sweep(address)", "rescueTokens(address,address,uint256)", "kill()", "selfdestruct()"];
function scanSelectors(code) { const out = new Set(); for (let i = 0; i < code.length; i++) { const op = code[i]; if (op === 0x63 && i + 5 < code.length) { const sel = hex(code.slice(i + 1, i + 5)); const n1 = code[i + 5], n2 = code[i + 6]; if (n1 === 0x14 || n2 === 0x14 || (n1 >= 0x80 && n1 <= 0x8f && code[i + 6] === 0x14) || n1 === 0x81 || n1 === 0x11 || n1 === 0x10) out.add(sel); } if (op >= 0x60 && op <= 0x7f) i += op - 0x5f; } return [...out]; }
export async function selectors(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.address)) return bad("address required");
  try {
    let target = q.address, via = null;
    let { results: r } = await rpcBatch(ch, [["eth_getCode", [q.address, "latest"]], ["eth_getStorageAt", [q.address, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", "latest"]], ["eth_getStorageAt", [q.address, "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3", "latest"]]]);
    let code = r[0]; if (!code || code === "0x") return ok({ chain: ch, address: checksum(q.address), is_contract: false });
    const m1167 = code.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i);
    const impl = m1167 ? "0x" + m1167[1] : r[1] && !/^0x0*$/.test(r[1]) ? "0x" + r[1].slice(-40) : r[2] && !/^0x0*$/.test(r[2]) ? "0x" + r[2].slice(-40) : code.startsWith("0xef0100") ? "0x" + code.slice(8, 48) : null;
    if (impl && q.follow !== "false") { const { results: r2 } = await rpcBatch(ch, [["eth_getCode", [impl, "latest"]]]); if (r2[0] && r2[0] !== "0x") { via = { proxy: checksum(q.address), kind: m1167 ? "EIP-1167 clone" : code.startsWith("0xef0100") ? "EIP-7702 delegation" : "EIP-1967 proxy", implementation: checksum(impl) }; target = impl; code = r2[0]; } }
    const sels = scanSelectors(unhex(code)); const set = new Set(sels);
    const named = sels.map((s) => ({ selector: "0x" + s, signature: SMAP[s] || null }));
    const ifaces = Object.entries(IFACES).filter(([, l]) => l.every((s) => set.has(s))).map(([k]) => k);
    const risky = named.filter((x) => RISKY.includes(x.signature)).map((x) => x.signature);
    return ok({ chain: ch, address: checksum(q.address), proxy: via, analyzed: checksum(target), bytecode_bytes: (code.length - 2) / 2, selector_count: sels.length, identified: named.filter((x) => x.signature).length, interfaces: ifaces, privileged_functions: risky, selectors: named, note: "Heuristic PUSH4 dispatcher scan; unknown selectors -> /v1/fnsig. Vyper/huff layouts may be partial." });
  } catch (e) { return err(e); }
}
// ---- codemeta ----
function cbor(b) { let i = 0; const rd = () => { const ib = b[i++], mt = ib >> 5; let ai = ib & 31, n = ai; if (ai === 24) n = b[i++]; else if (ai === 25) { n = (b[i] << 8) | b[i + 1]; i += 2; } else if (ai === 26) { n = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; i += 4; } else if (ai > 26 && mt !== 7) throw new Error("cbor"); if (mt === 0) return n; if (mt === 2) { const v = b.slice(i, i + n); i += n; return v; } if (mt === 3) { const v = new TextDecoder().decode(b.slice(i, i + n)); i += n; return v; } if (mt === 5) { const o = {}; for (let k = 0; k < n; k++) { const key = rd(); o[key] = rd(); } return o; } if (mt === 7) return ai === 21 ? true : ai === 20 ? false : null; throw new Error("cbor type " + mt); }; return rd(); }
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const b58 = (u) => { let n = BigInt("0x" + hex(u)), s = ""; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; } for (const x of u) { if (x) break; s = "1" + s; } return s; };
export async function codemeta(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.address)) return bad("address required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getCode", [q.address, "latest"]], ["eth_getTransactionCount", [q.address, "latest"]], ["eth_getBalance", [q.address, "latest"]]]);
    const code = r[0]; if (!code || code === "0x") return ok({ chain: ch, address: checksum(q.address), is_contract: false, nonce: r[1] ? Number(BigInt(r[1])) : null });
    const b = unhex(code); const out = { chain: ch, address: checksum(q.address), is_contract: true, size_bytes: b.length, size_limit_pct: Math.round((b.length / 24576) * 1000) / 10, codehash: "0x" + hex(keccak(b)), nonce: r[1] ? Number(BigInt(r[1])) : null, balance_eth: r[2] ? Number(BigInt(r[2])) / 1e18 : null };
    const m1167 = code.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/i);
    out.kind = code.startsWith("0xef0100") ? "EIP-7702 delegation designator" : m1167 ? "EIP-1167 minimal proxy" : b[0] === 0x60 && b[1] === 0x80 ? "solidity runtime" : b[0] === 0x5f || b[0] === 0x34 ? "possibly vyper/other" : "unknown";
    if (code.startsWith("0xef0100")) out.delegate = checksum("0x" + code.slice(8, 48)); if (m1167) out.implementation = checksum("0x" + m1167[1]);
    let meta = null; if (b.length > 4) { const L = (b[b.length - 2] << 8) | b[b.length - 1]; if (L > 0 && L + 2 <= b.length && L < 200) { try { const m = cbor(b.slice(b.length - 2 - L, b.length - 2)); if (m && typeof m === "object") { meta = {}; for (const [k, v] of Object.entries(m)) { if (k === "solc" && v instanceof Uint8Array) meta.solc = [...v].join("."); else if (k === "ipfs" && v instanceof Uint8Array) meta.ipfs = b58(v); else if (v instanceof Uint8Array) meta[k] = "0x" + hex(v); else meta[k] = v; } meta.metadata_bytes = L + 2; } } catch {} } }
    out.metadata = meta; if (meta?.solc) out.compiler = (meta.vyper ? "vyper " : "solc ") + meta.solc; else if (meta?.vyper) out.compiler = "vyper " + (meta.vyper instanceof Uint8Array ? [...meta.vyper].join(".") : meta.vyper);
    if (meta?.ipfs) out.metadata_url = "https://ipfs.io/ipfs/" + meta.ipfs;
    out.opcodes = { selfdestruct: b.includes(0xff) ? "byte 0xff present (may be data)" : "absent", delegatecall: b.includes(0xf4), create2: b.includes(0xf5) };
    return ok({ ...out, note: "Compare codehash across chains/deployments; verification status via /v1/verified, source match via /v1/codematch." });
  } catch (e) { return err(e); }
}
// ---- aeropool (Base) ----
const SYM = { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", WETH: "0x4200000000000000000000000000000000000006", ETH: "0x4200000000000000000000000000000000000006", CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", CBETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22", WSTETH: "0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452", EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", USDBC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" };
const VF = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da", CLF = "0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A";
function strDec(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
export async function aeropool(q) {
  const tk = (t) => (isA(t) ? t : SYM[String(t || "").toUpperCase()] || null);
  const a = tk(q.token_a || "WETH"), bb = tk(q.token_b || "USDC"); if (!a || !bb) return bad("token_a/token_b: 0x address or " + Object.keys(SYM).join(","));
  try {
    const TS = [1, 50, 100, 200, 2000];
    const { results: r } = await rpcBatch("base", [["eth_call", [{ to: VF, data: "0x79bc57d5" + pad(a) + pad(bb) + pad("0") }, "latest"]], ["eth_call", [{ to: VF, data: "0x79bc57d5" + pad(a) + pad(bb) + pad("1") }, "latest"]], ...TS.map((t) => ["eth_call", [{ to: CLF, data: "0x28af8d0b" + pad(a) + pad(bb) + pad(t.toString(16)) }, "latest"]]), ["eth_call", [{ to: a, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: bb, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: a, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: bb, data: "0x95d89b41" }, "latest"]]]);
    const addr = (x) => (x && x.length >= 66 && !/^0x0{64}$/.test(x.slice(0, 66)) ? "0x" + x.slice(26, 66) : null);
    const dA = Number(BigInt(r[7] || "0x12")), dB = Number(BigInt(r[8] || "0x12")), sA = strDec(r[9]), sB = strDec(r[10]);
    const lo = a.toLowerCase() < bb.toLowerCase(); const d0 = lo ? dA : dB, d1 = lo ? dB : dA, s0 = lo ? sA : sB, s1 = lo ? sB : sA;
    const pools = [];
    for (const [i, stable] of [[0, false], [1, true]]) { const p = addr(r[i]); if (p) pools.push({ type: stable ? "v2-stable" : "v2-volatile", pool: p, stable }); }
    TS.forEach((t, j) => { const p = addr(r[2 + j]); if (p) pools.push({ type: "slipstream-cl", tick_spacing: t, pool: p }); });
    if (!pools.length) return ok({ chain: "base", pools: [], note: "no Aerodrome pool for pair" });
    const calls = []; for (const p of pools) { if (p.type === "slipstream-cl") calls.push(["eth_call", [{ to: p.pool, data: "0x3850c7bd" }, "latest"]], ["eth_call", [{ to: p.pool, data: "0xddca3f43" }, "latest"]]); else calls.push(["eth_call", [{ to: p.pool, data: "0x0902f1ac" }, "latest"]], ["eth_call", [{ to: VF, data: "0xcc56b2c5" + pad(p.pool) + pad(p.stable ? "1" : "0") }, "latest"]]); calls.push(["eth_call", [{ to: lo ? a : bb, data: "0x70a08231" + pad(p.pool) }, "latest"]], ["eth_call", [{ to: lo ? bb : a, data: "0x70a08231" + pad(p.pool) }, "latest"]]); }
    const { results: s } = await rpcBatch("base", calls);
    const out = pools.map((p, i) => { const x = s[4 * i], f = s[4 * i + 1]; const b0 = s[4 * i + 2] ? Number(BigInt(s[4 * i + 2].slice(0, 66))) / 10 ** d0 : null, b1 = s[4 * i + 3] ? Number(BigInt(s[4 * i + 3].slice(0, 66))) / 10 ** d1 : null; let price = null, fee = null; if (p.type === "slipstream-cl") { if (x && x.length >= 130) price = (Number(BigInt(x.slice(0, 66))) / 2 ** 96) ** 2 * 10 ** (d0 - d1); if (f) fee = Number(BigInt(f.slice(0, 66))) / 100; } else { if (x && x.length >= 130) { const r0 = Number(BigInt(x.slice(0, 66))) / 10 ** d0, r1 = Number(BigInt("0x" + x.slice(66, 130))) / 10 ** d1; price = r0 ? r1 / r0 : null; } if (f) fee = Number(BigInt(f.slice(0, 66))); } return { ...p, pool: checksum(p.pool), stable: undefined, fee_bps: fee, [`price_${s1}_per_${s0}`]: price, reserves: { [s0]: b0, [s1]: b1 }, ...(p.type === "v2-stable" ? { price_note: "stable-curve pool: reserve ratio ≠ marginal price" } : {}) }; });
    out.sort((x, y) => (Object.values(y.reserves)[1] || 0) - (Object.values(x.reserves)[1] || 0));
    return ok({ chain: "base", dex: "Aerodrome", token0: { symbol: s0, decimals: d0 }, token1: { symbol: s1, decimals: d1 }, deepest: out[0].pool, pools: out, source: "Aerodrome factories on-chain (v2 + Slipstream)" });
  } catch (e) { return err(e); }
}
