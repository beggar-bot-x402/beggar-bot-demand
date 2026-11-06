// packb37 (builder B, 2026-11-02): erc1155send, nftapprovalall, permit2lockdown, cancelauth. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex, keccak } from "./evm.js";
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
const P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const big = (v) => { try { const b = BigInt(String(v)); return b >= 0n ? b : null; } catch { return null; } };
const dstr = (x) => { const s = (x || "0x").slice(2); if (s.length < 128) return null; const n = Number(BigInt("0x" + s.slice(64, 128))); return new TextDecoder().decode(unhex(s.slice(128, 128 + n * 2))); };
// ---- erc1155send: ERC-1155 safeTransferFrom with balance + receiver check ----
export async function erc1155send(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from) || !isA(q.to) || !isA(q.contract)) return bad("from, to, contract addresses required");
  const id = big(q.token_id), amt = big(q.amount ?? "1"); if (id == null || !amt) return bad("token_id and amount (>0 integer) required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.contract, data: sel("supportsInterface(bytes4)") + "d9b67a26" + "0".repeat(56) }, "latest"]], ["eth_call", [{ to: q.contract, data: sel("balanceOf(address,uint256)") + pad(q.from) + pad(id.toString(16)) }, "latest"]], ["eth_getCode", [q.to, "latest"]]]);
    const is1155 = r[0] ? w(r[0], 0) === 1n : false, bal = r[1] && r[1].length >= 66 ? w(r[1], 0) : null, toContract = !!(r[2] && r[2] !== "0x");
    const data = sel("safeTransferFrom(address,address,uint256,uint256,bytes)") + pad(q.from) + pad(q.to) + pad(id.toString(16)) + pad(amt.toString(16)) + pad("a0") + pad("0");
    const warn = []; if (!is1155) warn.push("contract does not report ERC-1155 via supportsInterface"); if (bal != null && bal < amt) warn.push("from balance " + bal + " < amount"); if (toContract) warn.push("recipient is a contract: it must implement onERC1155Received or the transfer reverts");
    const t = await txbuild({ chain: ch, from: q.from, to: q.contract, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, contract: checksum(q.contract), token_id: id.toString(), amount: amt.toString(), from: checksum(q.from), to: checksum(q.to), is_erc1155: is1155, from_balance: bal == null ? null : bal.toString(), recipient_is_contract: toContract, calldata: data, ...pick(t), warnings: warn });
  } catch (e) { return err(e); }
}
// ---- nftapprovalall: setApprovalForAll grant/revoke with current state ----
export async function nftapprovalall(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from) || !isA(q.operator) || !isA(q.contract)) return bad("from, operator, contract addresses required");
  const appr = !/^(false|0|no|revoke)$/i.test(String(q.approved ?? "false"));
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.contract, data: sel("isApprovedForAll(address,address)") + pad(q.from) + pad(q.operator) }, "latest"]], ["eth_getCode", [q.operator, "latest"]]]);
    if (!r[0] || r[0].length < 66) return bad("isApprovedForAll() failed — not an ERC-721/1155 contract?");
    const cur = w(r[0], 0) === 1n, data = sel("setApprovalForAll(address,bool)") + pad(q.operator) + pad(appr ? "1" : "0");
    const warn = []; if (cur === appr) warn.push("already " + (appr ? "approved" : "revoked") + " — tx is a no-op"); if (appr && !(r[1] && r[1] !== "0x")) warn.push("operator is an EOA: it could move every NFT in this collection"); if (appr) warn.push("grants operator control of ALL your tokens in this collection");
    const t = await txbuild({ chain: ch, from: q.from, to: q.contract, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, contract: checksum(q.contract), owner: checksum(q.from), operator: checksum(q.operator), currently_approved: cur, set_to: appr, noop: cur === appr, calldata: data, ...pick(t), warnings: warn });
  } catch (e) { return err(e); }
}
// ---- permit2lockdown: revoke Permit2 allowances (lockdown) for token/spender pairs ----
export async function permit2lockdown(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  const pairs = String(q.pairs || "").split(/[\s,;]+/).filter(Boolean).map((x) => x.split(/[:=]/)).map(([t, s]) => [tok(ch, t), s]);
  if (!pairs.length || pairs.length > 50 || pairs.some(([t, s]) => !t || !isA(s))) return bad("pairs: 1-50 entries token:spender (token address, USDC or WETH)");
  try {
    const { results: r } = await rpcBatch(ch, pairs.map(([t, s]) => ["eth_call", [{ to: P2, data: sel("allowance(address,address,address)") + pad(q.from) + pad(t) + pad(s) }, "latest"]]));
    const now = BigInt(Math.floor(Date.now() / 1000));
    const rows = pairs.map(([t, s], i) => { const x = r[i]; const a = x && x.length >= 194 ? w(x, 0) : null, e = x && x.length >= 194 ? w(x, 1) : null; return { token: checksum(t), spender: checksum(s), amount_raw: a == null ? null : a.toString(), expiration: e == null ? null : Number(e), active: a != null && a > 0n && e >= now }; });
    const data = sel("lockdown((address,address)[])") + pad("20") + pad(pairs.length.toString(16)) + pairs.map(([t, s]) => pad(t) + pad(s)).join("");
    const t = await txbuild({ chain: ch, from: q.from, to: P2, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    const act = rows.filter((x) => x.active).length;
    return ok({ chain: ch, permit2: P2, owner: checksum(q.from), pairs: rows, active_allowances: act, calldata: data, ...pick(t), warnings: act ? [] : ["no active Permit2 allowances found for these pairs — lockdown is a no-op"], note: "lockdown zeroes Permit2 amounts. It does not reset the ERC-20 approval to Permit2 itself; revoke that separately if needed." });
  } catch (e) { return err(e); }
}
// ---- cancelauth: EIP-3009 cancelAuthorization typed data (USDC) ----
export async function cancelauth(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from (authorizer) address required");
  const token = tok(ch, q.token || "USDC"); if (!token) return bad("token: address or USDC"); if (!/^0x[0-9a-fA-F]{64}$/.test(String(q.nonce || ""))) return bad("nonce: the 32-byte authorization nonce to cancel");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: sel("authorizationState(address,bytes32)") + pad(q.from) + pad(q.nonce) }, "latest"]], ["eth_call", [{ to: token, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: token, data: "0x54fd4d50" }, "latest"]], ["eth_chainId", []]]);
    if (!r[0] || r[0].length < 66) return bad("authorizationState() failed — token does not support EIP-3009");
    const used = w(r[0], 0) === 1n, name = dstr(r[1]), version = dstr(r[2]) || "1", chainId = Number(BigInt(r[3]));
    const typed = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], CancelAuthorization: [{ name: "authorizer", type: "address" }, { name: "nonce", type: "bytes32" }] }, primaryType: "CancelAuthorization", domain: { name, version, chainId, verifyingContract: checksum(token) }, message: { authorizer: checksum(q.from), nonce: q.nonce.toLowerCase() } };
    const h = (s) => keccak(unhex(s)); const enc = (s) => unhex(keccakHex(s).slice(2));
    const ds = hex(h(hex(enc("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")) + hex(enc(name)) + hex(enc(version)) + pad(chainId.toString(16)) + pad(token)));
    const sh = hex(h(hex(enc("CancelAuthorization(address authorizer,bytes32 nonce)")) + pad(q.from) + pad(q.nonce)));
    const digest = "0x" + hex(h("1901" + ds + sh));
    return ok({ chain: ch, token: checksum(token), authorizer: checksum(q.from), nonce: q.nonce.toLowerCase(), nonce_already_used_or_canceled: used, typed_data: typed, digest, submit: { method: "cancelAuthorization(address,bytes32,uint8,bytes32,bytes32)", selector: sel("cancelAuthorization(address,bytes32,uint8,bytes32,bytes32)"), to: checksum(token), note: "anyone (relayer) may submit with the authorizer's v,r,s" }, warnings: used ? ["nonce is already used or canceled — nothing to cancel"] : [] });
  } catch (e) { return err(e); }
}
