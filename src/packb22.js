// packb22 (builder B, 2026-11-02): authverify, rawtx, upgrades, ownerlog. $0 upstream (keyless public RPCs / pure compute).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak, keccakHex } from "./evm.js";
import { typedDigest, recoverAddress } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon", "84532": "base-sepolia" };
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137, "base-sepolia": 84532 };
const BYID = Object.fromEntries(Object.entries(CID).map(([k, v]) => [v, k]));
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : AL[s] || null; };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const unhex = (h) => { h = String(h).replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
const hex = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
function str(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
// ---- authverify: off-chain + on-chain checks of a signed EIP-3009 authorization (x402 exact) ----
export async function authverify(q) {
  let p = q.payload || q; if (typeof p === "string") { try { p = JSON.parse(p); } catch { return bad("payload must be JSON"); } }
  if (p.payload) p = p.payload; const a = p.authorization || (typeof q.authorization === "string" ? JSON.parse(q.authorization) : q.authorization); const sig = p.signature || q.signature;
  if (!a || !isA(a.from) || !isA(a.to) || a.value == null || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce || "") || !sig) return bad("authorization {from,to,value,validAfter,validBefore,nonce} and signature required (or x402 payload)");
  const ch = ck(q.chain || q.network?.replace?.("eip155:", "") || "base"); if (!ch) return bad("unknown chain");
  const tok = isA(q.token) ? q.token : USDC[ch];
  try {
    const { results: [nm, ver, st, bal, code, bl] } = await rpcBatch(ch, [["eth_call", [{ to: tok, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: tok, data: "0x54fd4d50" }, "latest"]], ["eth_call", [{ to: tok, data: "0xe94a0102" + pad(a.from) + pad(a.nonce) }, "latest"]], ["eth_call", [{ to: tok, data: "0x70a08231" + pad(a.from) }, "latest"]], ["eth_getCode", [a.from, "latest"]], ["eth_call", [{ to: tok, data: "0xfe575a87" + pad(a.from) }, "latest"]]]);
    const td = { types: { TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] }, primaryType: "TransferWithAuthorization", domain: { name: q.domain_name || str(nm), version: q.domain_version || str(ver) || "2", chainId: CID[ch], verifyingContract: tok }, message: { from: a.from, to: a.to, value: String(a.value), validAfter: String(a.validAfter ?? 0), validBefore: String(a.validBefore ?? 0), nonce: a.nonce } };
    let signer = null, sigErr = null; try { signer = recoverAddress(typedDigest(td).digest, sig).address; } catch (e) { sigErr = String(e.message || e); }
    const now = Math.floor(Date.now() / 1000), va = Number(a.validAfter ?? 0), vb = Number(a.validBefore ?? 0);
    const isContract = !!code && code !== "0x" && !code.toLowerCase().startsWith("0xef0100");
    const checks = { signature_recovers_from: signer ? signer.toLowerCase() === a.from.toLowerCase() : false, valid_after_passed: now >= va, not_expired: now < vb, nonce_unused: st ? BigInt(st.slice(0, 66)) === 0n : null, sufficient_balance: bal ? BigInt(bal.slice(0, 66)) >= BigInt(a.value) : null, payer_not_blacklisted: bl && bl.length >= 66 ? BigInt(bl.slice(0, 66)) === 0n : null, pay_to_matches: isA(q.pay_to) ? q.pay_to.toLowerCase() === a.to.toLowerCase() : null, amount_matches: q.max_amount != null ? BigInt(a.value) <= BigInt(q.max_amount) : null };
    const fails = Object.entries(checks).filter(([, v]) => v === false).map(([k]) => k);
    return ok({ chain: ch, token: checksum(tok.toLowerCase()), valid: fails.length === 0 || (fails.length === 1 && fails[0] === "signature_recovers_from" && isContract), failed_checks: fails, checks, recovered_signer: signer, signature_error: sigErr, payer_is_contract: isContract, contract_note: isContract ? "payer is a smart wallet: verify via /v1/sig1271 (EIP-1271)" : undefined, seconds_left: vb - now, domain: td.domain, note: "Read-only pre-settlement check; nothing broadcast." });
  } catch (e) { return err(e); }
}
// ---- rawtx: decode + recover sender of a signed raw transaction ----
function rlp(b, o = 0) { const t = b[o]; if (t < 0x80) return { v: b.subarray(o, o + 1), end: o + 1 }; if (t < 0xb8) { const l = t - 0x80; return { v: b.subarray(o + 1, o + 1 + l), end: o + 1 + l }; } if (t < 0xc0) { const ll = t - 0xb7; let l = 0; for (let i = 0; i < ll; i++) l = l * 256 + b[o + 1 + i]; return { v: b.subarray(o + 1 + ll, o + 1 + ll + l), end: o + 1 + ll + l }; } let l, s; if (t < 0xf8) { l = t - 0xc0; s = o + 1; } else { const ll = t - 0xf7; l = 0; for (let i = 0; i < ll; i++) l = l * 256 + b[o + 1 + i]; s = o + 1 + ll; } const items = []; let p = s; while (p < s + l) { const r = rlp(b, p); items.push({ ...r, raw: b.subarray(p, r.end) }); p = r.end; } if (p !== s + l) throw new Error("bad RLP"); return { v: items, end: s + l, list: true }; }
const enc = (payload) => { const L = payload.length; let h; if (L < 56) h = [0xc0 + L]; else { const lb = []; let x = L; while (x) { lb.unshift(x & 255); x = Math.floor(x / 256); } h = [0xf7 + lb.length, ...lb]; } const o = new Uint8Array(h.length + L); o.set(h); o.set(payload, h.length); return o; };
const encInt = (n) => { if (n === 0n) return Uint8Array.of(0x80); const bs = []; while (n) { bs.unshift(Number(n & 255n)); n >>= 8n; } return bs.length === 1 && bs[0] < 0x80 ? Uint8Array.of(bs[0]) : Uint8Array.of(0x80 + bs.length, ...bs); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const bi = (u) => (u.length ? BigInt(hex(u)) : 0n);
export async function rawtx(q) {
  const raw = String(q.raw || q.tx || ""); if (!/^0x[0-9a-fA-F]{20,}$/.test(raw) || raw.length > 262144) return bad("raw: signed transaction hex (0x…) required");
  try {
    const b = unhex(raw); let type = 0, body = b; if (b[0] < 0x7f) { type = b[0]; body = b.subarray(1); }
    const { v: f } = rlp(body); if (!Array.isArray(f)) return bad("not an RLP list");
    const L = { 0: 9, 1: 11, 2: 12, 3: 14, 4: 13 }[type]; if (!L || f.length !== L) return bad("unsupported tx type " + type + " or wrong field count " + f.length);
    const n = f.length, r = f[n - 2].v, s = f[n - 1].v; let yp, chainId, unsigned;
    if (type === 0) { const v = bi(f[6].v); if (v >= 35n) { chainId = (v - 35n) / 2n; yp = Number((v - 35n) % 2n); unsigned = enc(cat(...f.slice(0, 6).map((x) => x.raw), encInt(chainId), Uint8Array.of(0x80), Uint8Array.of(0x80))); } else { chainId = null; yp = Number(v - 27n); unsigned = enc(cat(...f.slice(0, 6).map((x) => x.raw))); } }
    else { yp = Number(bi(f[n - 3].v)); chainId = bi(f[0].v); unsigned = cat(Uint8Array.of(type), enc(cat(...f.slice(0, n - 3).map((x) => x.raw)))); }
    const h = keccak(unsigned); const sig = hex(cat(unhex(pad(hex(r))), unhex(pad(hex(s))), Uint8Array.of(27 + yp)));
    const from = recoverAddress(h, sig).address;
    const g = (i) => bi(f[i].v);
    const fld = type === 0 ? { nonce: g(0), gas_price: g(1), gas: g(2), to: f[3].v, value: g(4), data: f[5].v } : type === 1 ? { nonce: g(1), gas_price: g(2), gas: g(3), to: f[4].v, value: g(5), data: f[6].v } : { nonce: g(1), max_priority_fee: g(2), max_fee: g(3), gas: g(4), to: f[5].v, value: g(6), data: f[7].v };
    const data = hex(fld.data); const sel = data.slice(0, 10);
    const known = { "0xa9059cbb": "transfer(address,uint256)", "0x095ea7b3": "approve(address,uint256)", "0x23b872dd": "transferFrom(address,address,uint256)", "0xe3ee160e": "transferWithAuthorization(...)", "0xef5cfb8c": "receiveWithAuthorization(...)", "0x": "native transfer" };
    const cid = chainId != null ? Number(chainId) : null;
    return ok({ type, type_name: ["legacy", "eip2930", "eip1559", "eip4844 blob", "eip7702 set-code"][type], chain_id: cid, chain: cid != null ? BYID[cid] || null : null, from, to: fld.to.length ? checksum(hex(fld.to).slice(2)) : null, contract_creation: !fld.to.length, nonce: Number(fld.nonce), value_wei: fld.value.toString(), value_native: Number(fld.value) / 1e18, gas_limit: Number(fld.gas), gas_price_gwei: fld.gas_price != null ? Number(fld.gas_price) / 1e9 : undefined, max_fee_gwei: fld.max_fee != null ? Number(fld.max_fee) / 1e9 : undefined, max_priority_fee_gwei: fld.max_priority_fee != null ? Number(fld.max_priority_fee) / 1e9 : undefined, max_cost_native: Number(fld.gas * (fld.max_fee ?? fld.gas_price) + fld.value) / 1e18, selector: data.length >= 10 ? sel : "0x", method: known[data.length >= 10 ? sel : "0x"] || null, data_bytes: fld.data.length, authorization_count: type === 4 ? f[9].v.length : undefined, tx_hash: hex(keccak(b)), replay_protected: cid != null, note: "Pure decode; nothing broadcast." });
  } catch (e) { return bad("decode failed: " + String(e.message || e)); }
}
// ---- rolecheck / ownership: governance state reads ----
const ROLES = { DEFAULT_ADMIN_ROLE: "0x" + "0".repeat(64), MINTER_ROLE: keccakHex("MINTER_ROLE"), PAUSER_ROLE: keccakHex("PAUSER_ROLE"), UPGRADER_ROLE: keccakHex("UPGRADER_ROLE"), BURNER_ROLE: keccakHex("BURNER_ROLE"), OPERATOR_ROLE: keccakHex("OPERATOR_ROLE"), ADMIN_ROLE: keccakHex("ADMIN_ROLE"), GUARDIAN_ROLE: keccakHex("GUARDIAN_ROLE"), PROPOSER_ROLE: keccakHex("PROPOSER_ROLE"), EXECUTOR_ROLE: keccakHex("EXECUTOR_ROLE"), CANCELLER_ROLE: keccakHex("CANCELLER_ROLE") };
export async function rolecheck(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const c = q.contract || q.address; if (!isA(c)) return bad("contract 0x required");
  const accts = String(q.accounts || q.account || "").split(",").map((s) => s.trim()).filter(Boolean); if (!accts.length || accts.length > 10 || !accts.every(isA)) return bad("accounts: csv of 0x (max 10)");
  const extra = String(q.roles || "").split(",").map((s) => s.trim()).filter(Boolean); const roles = { ...ROLES }; for (const r of extra) roles[r] = /^0x[0-9a-fA-F]{64}$/.test(r) ? r : keccakHex(r);
  const names = Object.keys(roles);
  try {
    const calls = [["eth_call", [{ to: c, data: "0x01ffc9a7" + "7965db0b".padEnd(64, "0") }, "latest"]]]; for (const a of accts) for (const n of names) calls.push(["eth_call", [{ to: c, data: "0x91d14854" + pad(roles[n]) + pad(a) }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    let i = 1; const out = accts.map((a) => { const held = []; for (const n of names) { const x = r[i++]; if (x && x.length >= 66 && BigInt(x.slice(0, 66)) === 1n) held.push(n); } return { account: checksum(a.toLowerCase()), roles: held, is_admin: held.includes("DEFAULT_ADMIN_ROLE") }; });
    const supported = (r[0] && r[0].length >= 66 && BigInt(r[0].slice(0, 66)) === 1n) || r.slice(1).some((x) => x && x.length >= 66);
    return ok({ chain: ch, contract: checksum(c.toLowerCase()), access_control: supported, roles_checked: names, accounts: out, privileged: out.filter((x) => x.roles.length).map((x) => x.account) });
  } catch (e) { return err(e); }
}
export async function ownership(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const c = q.contract || q.address; if (!isA(c)) return bad("contract 0x required");
  try {
    const { results: [o, po, md, code] } = await rpcBatch(ch, [["eth_call", [{ to: c, data: "0x8da5cb5b" }, "latest"]], ["eth_call", [{ to: c, data: "0xe30c3978" }, "latest"]], ["eth_call", [{ to: c, data: "0xf27a0c92" }, "latest"]], ["eth_getCode", [c, "latest"]]]);
    if (!code || code === "0x") return bad("no contract code at address on " + ch);
    const ad = (x) => (x && x.length >= 66 ? checksum("0x" + x.slice(26, 66)) : null);
    const owner = ad(o), pending = ad(po); const zero = "0x0000000000000000000000000000000000000000";
    let kind = null, safe = null, delay = null;
    if (owner && owner !== zero) {
      const { results: [oc, th, ow, d2] } = await rpcBatch(ch, [["eth_getCode", [owner, "latest"]], ["eth_call", [{ to: owner, data: "0xe75235b8" }, "latest"]], ["eth_call", [{ to: owner, data: "0xa0e67e2b" }, "latest"]], ["eth_call", [{ to: owner, data: "0xf27a0c92" }, "latest"]]]);
      if (!oc || oc === "0x") kind = "eoa"; else if (oc.toLowerCase().startsWith("0xef0100")) kind = "eip7702_eoa"; else if (th && th.length >= 66 && ow) { const n = Number(BigInt("0x" + ow.slice(66, 130))); kind = "safe"; safe = { threshold: Number(BigInt(th.slice(0, 66))), owners: n }; } else if (d2 && d2.length >= 66) { kind = "timelock"; delay = Number(BigInt(d2.slice(0, 66))); } else kind = "contract";
    }
    const own = md && md.length >= 66 ? Number(BigInt(md.slice(0, 66))) : null;
    const risk = owner == null ? "not Ownable (check /v1/rolecheck or /v1/admins)" : owner === zero ? "renounced" : kind === "eoa" || kind === "eip7702_eoa" ? "high: single key controls contract" : kind === "safe" ? (safe.threshold >= 2 ? "medium: multisig " + safe.threshold + "/" + safe.owners : "high: 1-of-N Safe") : kind === "timelock" ? "lower: timelocked (" + delay + "s)" : "unknown contract owner";
    return ok({ chain: ch, contract: checksum(c.toLowerCase()), ownable: owner != null, owner, renounced: owner === zero, pending_owner: pending && pending !== zero ? pending : null, two_step: po != null && po.length >= 66, owner_kind: kind, owner_safe: safe, owner_timelock_delay_s: delay, self_timelock_delay_s: own, risk });
  } catch (e) { return err(e); }
}
