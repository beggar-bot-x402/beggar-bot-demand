// packb25 (builder B, 2026-11-02): permitdata, permit2data, namehash, x402req. $0 upstream (keyless public RPCs / pure compute).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak } from "./evm.js";
import { typedDigest } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137 };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => Uint8Array.from(String(h).replace(/^0x/, "").match(/../g) || [], (x) => parseInt(x, 16));
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const te = new TextEncoder();
function str(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
const MAXU = (1n << 256n) - 1n;
const amt = (v, d, max) => { if (v == null || v === "" || v === "max") return max; if (/^\d+$/.test(String(v))) return BigInt(v); return null; };
// ---- permitdata (EIP-2612) ----
export async function permitdata(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.token) || !isA(q.owner) || !isA(q.spender)) return bad("token, owner, spender addresses required");
  const value = amt(q.value, 0, MAXU); if (value == null) return bad("value must be integer base units or 'max'");
  const deadline = q.deadline ? BigInt(q.deadline) : BigInt(Math.floor(Date.now() / 1000) + 3600);
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.token, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x54fd4d50" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x7ecebe00" + pad(q.owner) }, "latest"]], ["eth_call", [{ to: q.token, data: "0x3644e515" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: q.token, data: "0xdd62ed3e" + pad(q.owner) + pad(q.spender) }, "latest"]]]);
    if (!r[2] || r[2].length < 66) return ok({ chain: ch, token: checksum(q.token), supports_eip2612: false, reason: "nonces(owner) reverted — token has no EIP-2612 permit; use Permit2 (/v1/permit2data) or approve()" });
    const name = q.name || str(r[0]) || ""; const onDs = r[3] && r[3].length >= 66 ? r[3].slice(0, 66).toLowerCase() : null;
    const nonce = BigInt(r[2].slice(0, 66));
    const build = (version) => ({ types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }] }, primaryType: "Permit", domain: { name, version, chainId: CID[ch], verifyingContract: checksum(q.token) }, message: { owner: checksum(q.owner), spender: checksum(q.spender), value: value.toString(), nonce: nonce.toString(), deadline: deadline.toString() } });
    const cands = [q.version, str(r[1]), "1", "2"].filter((x, i, a) => x && a.indexOf(x) === i);
    let td = null, d = null, matched = false;
    for (const v of cands) { const t = build(v), dd = typedDigest(t); if (!td) { td = t; d = dd; } if (onDs && dd.domain_separator.toLowerCase() === onDs) { td = t; d = dd; matched = true; break; } }
    const dec = r[4] ? Number(BigInt(r[4])) : null;
    return ok({ chain: ch, token: checksum(q.token), name, supports_eip2612: true, version: td.domain.version, domain_matches_onchain: onDs ? matched : null, nonce: nonce.toString(), deadline: deadline.toString(), deadline_iso: new Date(Number(deadline) * 1000).toISOString(), value: value.toString(), value_human: value === MAXU ? "unlimited" : dec != null ? Number(value) / 10 ** dec : null, unlimited: value === MAXU, current_allowance: r[5] ? BigInt(r[5].slice(0, 66)).toString() : null, digest: "0x" + hex(d.digest), typed_data: td, warnings: [...(value === MAXU ? ["unlimited permit — prefer an exact value"] : []), ...(onDs && !matched ? ["could not reproduce on-chain DOMAIN_SEPARATOR — pass version= explicitly"] : [])], note: "Owner signs typed_data (eth_signTypedData_v4); spender submits permit(owner,spender,value,deadline,v,r,s). Audit a signed one with /v1/permitcheck." });
  } catch (e) { return err(e); }
}
// ---- permit2data ----
const P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export async function permit2data(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.token) || !isA(q.owner) || !isA(q.spender)) return bad("token, owner, spender addresses required");
  const mode = String(q.mode || "allowance").toLowerCase(); if (!["allowance", "transfer"].includes(mode)) return bad("mode allowance|transfer");
  const MAX160 = (1n << 160n) - 1n; const amount = amt(q.amount, 0, mode === "allowance" ? MAX160 : null); if (amount == null) return bad("amount (base units) required for transfer mode");
  const now = Math.floor(Date.now() / 1000); const sigDeadline = BigInt(q.sig_deadline || now + 1800);
  try {
    const calls = [["eth_call", [{ to: q.token, data: "0xdd62ed3e" + pad(q.owner) + pad(P2) }, "latest"]], ["eth_call", [{ to: P2, data: "0x927da105" + pad(q.owner) + pad(q.token) + pad(q.spender) }, "latest"]], ["eth_call", [{ to: q.token, data: "0x313ce567" }, "latest"]]];
    let nonce;
    if (mode === "transfer") { nonce = q.nonce != null ? BigInt(q.nonce) : BigInt("0x" + hex(crypto.getRandomValues(new Uint8Array(8)))) ; calls.push(["eth_call", [{ to: P2, data: "0x4fe02b44" + pad(q.owner) + pad((nonce >> 8n).toString(16)) }, "latest"]]); }
    const { results: r } = await rpcBatch(ch, calls);
    const tokApp = r[0] ? BigInt(r[0].slice(0, 66)) : null;
    let p2 = null; if (r[1] && r[1].length >= 194) { const b = r[1].slice(2); p2 = { amount: BigInt("0x" + b.slice(0, 64)).toString(), expiration: Number(BigInt("0x" + b.slice(64, 128))), nonce: Number(BigInt("0x" + b.slice(128, 192))) }; }
    const dom = { name: "Permit2", chainId: CID[ch], verifyingContract: P2 }; const ED = [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }];
    let td;
    if (mode === "allowance") { const exp = BigInt(q.expiration || now + 30 * 86400); nonce = BigInt(p2 ? p2.nonce : 0); td = { types: { EIP712Domain: ED, PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }], PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }] }, primaryType: "PermitSingle", domain: dom, message: { details: { token: checksum(q.token), amount: amount.toString(), expiration: exp.toString(), nonce: nonce.toString() }, spender: checksum(q.spender), sigDeadline: sigDeadline.toString() } }; }
    else td = { types: { EIP712Domain: ED, PermitTransferFrom: [{ name: "permitted", type: "TokenPermissions" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }], TokenPermissions: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }] }, primaryType: "PermitTransferFrom", domain: dom, message: { permitted: { token: checksum(q.token), amount: amount.toString() }, spender: checksum(q.spender), nonce: nonce.toString(), deadline: sigDeadline.toString() } };
    const d = typedDigest(td);
    const nonceUsed = mode === "transfer" && r[3] ? ((BigInt(r[3].slice(0, 66)) >> (nonce & 255n)) & 1n) === 1n : null;
    const warn = []; if (tokApp === 0n) warn.push("owner has not approved Permit2 on this token — needs token.approve(Permit2, amount) once"); if (mode === "allowance" && amount === MAX160) warn.push("unlimited Permit2 allowance — prefer exact amount"); if (nonceUsed) warn.push("this unordered nonce is already used — pick another");
    return ok({ chain: ch, mode, permit2: P2, token_to_permit2_allowance: tokApp?.toString() ?? null, permit2_ready: tokApp != null ? tokApp > 0n : null, current_permit2_allowance: p2, nonce: nonce.toString(), nonce_used: nonceUsed, digest: "0x" + hex(d.digest), typed_data: td, warnings: warn, note: mode === "allowance" ? "Sign typed_data; spender calls Permit2.permit(owner, PermitSingle, sig) then transferFrom." : "Sign typed_data; spender calls Permit2.permitTransferFrom(permit, transferDetails, owner, sig). Audit with /v1/permit2 or /v1/permitcheck." });
  } catch (e) { return err(e); }
}
// ---- namehash ----
const nh = (name) => { let node = new Uint8Array(32); if (!name) return node; for (const l of name.split(".").reverse()) node = keccak(new Uint8Array([...node, ...keccak(te.encode(l))])); return node; };
export async function namehash(q) {
  const raw = String(q.name || "").trim(); if (!raw || raw.length > 255) return bad("name required, e.g. vitalik.eth or jesse.base.eth");
  const name = raw.toLowerCase().normalize("NFC"); if (/[\s\/\\]/.test(name) || name.split(".").some((l) => !l)) return bad("invalid name (empty label or whitespace)");
  const node = "0x" + hex(nh(name)), labels = name.split(".");
  const out = { name, normalized_note: name !== raw ? "lowercased (basic normalization only; full ENSIP-15 not applied)" : null, namehash: node, labelhash: "0x" + hex(keccak(te.encode(labels[0]))), labels: labels.length, parent_namehash: "0x" + hex(nh(labels.slice(1).join("."))), erc721_token_id: labels.length === 2 && labels[1] === "eth" ? BigInt("0x" + hex(keccak(te.encode(labels[0])))).toString() : null };
  if (q.resolve === "false") return ok(out);
  const isBase = name.endsWith(".base.eth"); const ch = isBase ? "base" : "ethereum"; const REG = isBase ? "0xB94704422c2a1E396835A571837Aa5AE53285a95" : "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: REG, data: "0x0178b8bf" + node.slice(2) }, "latest"]], ["eth_call", [{ to: REG, data: "0x02571be3" + node.slice(2) }, "latest"]]]);
    const res = r[0] && r[0].length >= 66 ? "0x" + r[0].slice(26, 66) : null, owner = r[1] && r[1].length >= 66 ? "0x" + r[1].slice(26, 66) : null;
    let addr = null; if (res && !/^0x0{40}$/.test(res)) { const { results: a } = await rpcBatch(ch, [["eth_call", [{ to: res, data: "0x3b3b57de" + node.slice(2) }, "latest"]]]); if (a[0] && a[0].length >= 66 && !/^0x0{64}$/.test(a[0].slice(0, 66))) addr = checksum("0x" + a[0].slice(26, 66)); }
    return ok({ ...out, registry_chain: ch, registry_owner: owner && !/^0x0{40}$/.test(owner) ? checksum(owner) : null, resolver: res && !/^0x0{40}$/.test(res) ? checksum(res) : null, address: addr, registered: !!(owner && !/^0x0{40}$/.test(owner)), note: addr ? null : "no addr record via registry resolver (CCIP-read/offchain names need /v1/ens)" });
  } catch (e) { return ok({ ...out, resolve_error: String(e.message || e) }); }
}
// ---- x402req ----
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
export async function x402req(q) {
  const net = String(q.network || "base").toLowerCase(); if (!USDC[net]) return bad("network base|base-sepolia");
  if (!isA(q.pay_to || q.payTo)) return bad("pay_to address required"); const payTo = checksum(q.pay_to || q.payTo);
  const p = String(q.price_usd ?? q.price ?? "0.01").replace(/^\$/, ""); if (!/^\d+(\.\d{1,6})?$/.test(p) || Number(p) <= 0) return bad("price_usd: positive number, max 6 decimals");
  const [i, f = ""] = p.split("."); const atomic = (BigInt(i) * 1000000n + BigInt((f + "000000").slice(0, 6))).toString();
  let resource = String(q.resource || "https://example.com/api"); try { new URL(resource); } catch { return bad("resource must be an absolute URL"); }
  const req = { scheme: "exact", network: net, maxAmountRequired: atomic, resource, description: String(q.description || "").slice(0, 300), mimeType: String(q.mime_type || "application/json"), payTo, maxTimeoutSeconds: Number(q.max_timeout || 60), asset: USDC[net], extra: { name: net === "base" ? "USD Coin" : "USDC", version: "2" } };
  const body = { x402Version: 1, error: "X-PAYMENT header is required", accepts: [req] };
  const checks = {};
  try { const { results: r } = await rpcBatch(net, [["eth_getCode", [payTo, "latest"]], ["eth_call", [{ to: USDC[net], data: "0xfe575a87" + pad(payTo) }, "latest"]], ["eth_call", [{ to: USDC[net], data: "0x70a08231" + pad(payTo) }, "latest"]]]); checks.pay_to_kind = r[0] == null ? null : r[0] === "0x" ? "EOA" : r[0].startsWith("0xef0100") ? "EIP-7702 delegated EOA" : "contract"; checks.pay_to_usdc_blacklisted = r[1] ? BigInt(r[1].slice(0, 66)) === 1n : null; checks.pay_to_usdc_balance = r[2] ? Number(BigInt(r[2].slice(0, 66))) / 1e6 : null; } catch (e) { checks.error = String(e.message || e); }
  const warn = []; if (checks.pay_to_usdc_blacklisted) warn.push("payTo is USDC-blacklisted — payments will fail"); if (checks.pay_to_kind === "contract") warn.push("payTo is a contract — make sure it can move USDC out");
  return ok({ payment_requirements: req, response_402_body: body, price_atomic: atomic, checks, warnings: warn, note: "Return HTTP 402 with response_402_body. Validate a buyer's X-PAYMENT with /v1/authverify; probe your live endpoint with /v1/x402check." });
}
