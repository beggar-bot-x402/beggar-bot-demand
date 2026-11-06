// x402 payment-dev tools, pure compute, zero outbound: /v1/x402check, /v1/eip3009, /v1/paymentheader, /v1/usdcamount.
import { checksum } from "./evm.js";
import { typedDigest, recoverAddress } from "./sig.js";
const bad = (m, extra = {}) => ({ status: 400, body: { error: m, ...extra } });
const hx = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
// Native USDC per chain (decimals 6). name/version = EIP-712 domain used by EIP-3009 signatures.
export const USDC = {
  base: { chainId: 8453, caip: "eip155:8453", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", name: "USD Coin", version: "2" },
  "base-sepolia": { chainId: 84532, caip: "eip155:84532", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", name: "USDC", version: "2" },
  ethereum: { chainId: 1, caip: "eip155:1", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin", version: "2" },
  arbitrum: { chainId: 42161, caip: "eip155:42161", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", name: "USD Coin", version: "2" },
  optimism: { chainId: 10, caip: "eip155:10", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", name: "USD Coin", version: "2" },
  polygon: { chainId: 137, caip: "eip155:137", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", name: "USD Coin", version: "2" },
  avalanche: { chainId: 43114, caip: "eip155:43114", address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", name: "USD Coin", version: "2" },
  solana: { caip: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", svm: true },
  "solana-devnet": { caip: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1", address: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", svm: true },
};
const ALIAS = { "eip155:8453": "base", 8453: "base", "eip155:84532": "base-sepolia", 84532: "base-sepolia", mainnet: "ethereum", "eip155:1": "ethereum", 1: "ethereum", "eip155:42161": "arbitrum", 42161: "arbitrum", "eip155:10": "optimism", 10: "optimism", "eip155:137": "polygon", 137: "polygon", "eip155:43114": "avalanche", 43114: "avalanche", "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp": "solana", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1": "solana-devnet" };
export const netKey = (n) => { if (n === undefined || n === null || n === "") return null; const s = String(n).trim().toLowerCase(); return USDC[s] ? s : ALIAS[s] || ALIAS[n] || null; };
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
const ckState = (a) => { if (!isA(a)) return "invalid"; const lo = a.slice(2); if (lo === lo.toLowerCase() || lo === lo.toUpperCase()) return "unchecksummed"; return checksum(a) === a ? "valid" : "BAD_CHECKSUM"; };
const sameA = (a, b) => isA(a) && isA(b) && a.toLowerCase() === b.toLowerCase();
const fromB64 = (s) => { const t = String(s).trim().replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(t + "=".repeat((4 - t.length % 4) % 4))))); };
export function parseJsonish(v) {
  if (v && typeof v === "object") return v;
  if (typeof v !== "string" || !v.trim()) throw new Error("empty");
  const s = v.trim(); if (s.startsWith("{") || s.startsWith("[")) return JSON.parse(s);
  return fromB64(s);
}
export const atomicToDec = (x) => { const n = BigInt(x), neg = n < 0n, a = neg ? -n : n, i = a / 1000000n, f = (a % 1000000n).toString().padStart(6, "0").replace(/0+$/, ""); return (neg ? "-" : "") + i + (f ? "." + f : ""); };
export const decToAtomic = (d) => { const s = String(d).trim().replace(/^\$/, "").replace(/_/g, ""); const m = s.match(/^(\d*)(?:\.(\d*))?$/); if (!m || (!m[1] && !m[2])) throw new Error("amount must be a non-negative decimal like 0.02"); if ((m[2] || "").length > 6) throw new Error("USDC has 6 decimals; more precision than 0.000001 would be truncated"); return (BigInt(m[1] || "0") * 1000000n + BigInt((m[2] || "").padEnd(6, "0") || "0")).toString(); };

// ---- /v1/usdcamount
export async function usdcamount(a) {
  const chain = a.chain ?? a.network ?? "base";
  const chains = String(chain).toLowerCase() === "all" ? Object.keys(USDC) : [netKey(chain)];
  if (!chains[0]) return bad("unknown chain; use one of " + Object.keys(USDC).join(", ") + " (or CAIP-2 / chainId) or all");
  let atomic;
  try {
    if (a.atomic !== undefined && a.atomic !== "") { if (!/^\d+$/.test(String(a.atomic).trim())) throw new Error("atomic must be a non-negative integer string"); atomic = BigInt(String(a.atomic).trim()).toString(); }
    else if (a.amount !== undefined && a.amount !== "") atomic = decToAtomic(a.amount);
  } catch (e) { return bad(e.message); }
  const out = { decimals: 6 };
  if (atomic !== undefined) Object.assign(out, { atomic, decimal: atomicToDec(atomic), usd_display: "$" + atomicToDec(atomic), hex: "0x" + BigInt(atomic).toString(16), x402: { v1_maxAmountRequired: atomic, v2_amount: atomic } });
  out.tokens = chains.map((k) => { const t = USDC[k]; return { chain: k, caip2: t.caip, chain_id: t.chainId ?? null, usdc: t.address, address_checksum: t.svm ? "n/a (base58)" : ckState(t.address), eip712_domain: t.svm ? null : { name: t.name, version: t.version, chainId: t.chainId, verifyingContract: t.address } }; });
  if (a.address) out.address_check = { input: a.address, state: ckState(a.address), checksummed: isA(a.address) ? checksum(a.address) : null, is_usdc_on: Object.keys(USDC).filter((k) => sameA(USDC[k].address, a.address)) };
  if (atomic === undefined && !a.address) out.hint = "pass amount (decimal, e.g. 0.02) or atomic (e.g. 20000); chain=all lists every USDC";
  return { status: 200, body: out };
}

// ---- /v1/x402check
const reqAmount = (r) => r.maxAmountRequired ?? r.amount;
export function checkAccept(r, expect = {}) {
  const issues = [], warnings = [];
  if (!r || typeof r !== "object") return { ok: false, issues: ["accept_not_object"], warnings };
  if (r.scheme !== "exact") (r.scheme ? warnings : issues).push(r.scheme ? "scheme_not_exact:" + r.scheme : "scheme_missing");
  const nk = netKey(r.network), t = nk && USDC[nk];
  if (!r.network) issues.push("network_missing"); else if (!nk) warnings.push("network_unrecognized:" + r.network);
  const amt = reqAmount(r);
  if (amt === undefined) issues.push("amount_missing (v1 maxAmountRequired / v2 amount)"); else if (!/^\d+$/.test(String(amt))) issues.push("amount_not_atomic_integer_string"); else if (typeof amt !== "string") warnings.push("amount_should_be_string"); else if (amt === "0") warnings.push("amount_zero");
  if (!r.payTo) issues.push("payTo_missing"); else if (t && !t.svm) { const s = ckState(r.payTo); if (s === "invalid") issues.push("payTo_invalid"); else if (s === "BAD_CHECKSUM") issues.push("payTo_bad_checksum"); else if (s === "unchecksummed") warnings.push("payTo_not_checksummed"); }
  if (!r.asset) issues.push("asset_missing"); else if (t && t.address.toLowerCase() !== String(r.asset).toLowerCase()) warnings.push("asset_not_native_usdc_for_" + nk);
  if (t && !t.svm) { if (!r.extra?.name) warnings.push("extra.name_missing (EIP-712 domain name; clients may sign wrong domain)"); else if (r.extra.name !== t.name) issues.push(`extra.name_mismatch: ${r.extra.name} != on-chain ${t.name}`); if (r.extra?.version && String(r.extra.version) !== t.version) issues.push("extra.version_mismatch"); }
  if (r.maxTimeoutSeconds === undefined) warnings.push("maxTimeoutSeconds_missing"); else if (!(Number(r.maxTimeoutSeconds) > 0)) issues.push("maxTimeoutSeconds_invalid"); else if (Number(r.maxTimeoutSeconds) > 3600) warnings.push("maxTimeoutSeconds_over_1h");
  if (r.resource !== undefined && !/^https:\/\//.test(String(r.resource))) warnings.push("resource_not_https");
  if (expect.payTo && !sameA(expect.payTo, r.payTo)) issues.push("payTo_differs_from_expected");
  if (expect.network && netKey(expect.network) !== nk) issues.push("network_differs_from_expected");
  if (expect.amount !== undefined || expect.atomic !== undefined) { try { const e = expect.atomic !== undefined ? String(expect.atomic) : decToAtomic(expect.amount); if (String(amt) !== e) issues.push(`amount_differs_from_expected: ${amt} != ${e}`); } catch { warnings.push("expect.amount_unparseable"); } }
  let price_usdc = null; try { if (/^\d+$/.test(String(amt))) price_usdc = atomicToDec(amt); } catch {}
  return { ok: !issues.length, scheme: r.scheme ?? null, network: r.network ?? null, chain: nk, asset: r.asset ?? null, payTo: r.payTo ?? null, amount_atomic: amt ?? null, price_usdc, issues, warnings };
}
export async function x402check(a) {
  const src = a.challenge ?? a.json ?? a.body ?? a.header ?? a.input;
  if (src === undefined || src === "") return bad("challenge required: the 402 JSON body, a PAYMENT-REQUIRED header (base64), a single accepts[] entry, or a /.well-known/x402 doc");
  let doc; try { doc = parseJsonish(src); } catch { return bad("challenge must be JSON or base64-encoded JSON"); }
  let expect = a.expect || {}; if (typeof expect === "string") { try { expect = JSON.parse(expect); } catch { expect = {}; } }
  for (const k of ["payTo", "network", "amount", "atomic"]) if (a["expect_" + k] !== undefined) expect[k] = a["expect_" + k];
  let kind, list, issues = [], warnings = [];
  if (Array.isArray(doc)) { kind = "accepts_array"; list = doc; }
  else if (Array.isArray(doc.accepts)) { kind = doc.x402Version === 2 ? "payment_required_v2" : "payment_required_v1"; list = doc.accepts; if (doc.x402Version === undefined) warnings.push("x402Version_missing"); else if (![1, 2].includes(doc.x402Version)) issues.push("x402Version_unknown:" + doc.x402Version); if (doc.x402Version === 2 && !doc.resource?.url) warnings.push("v2_resource.url_missing"); }
  else if (Array.isArray(doc.resources)) { kind = "discovery_doc"; list = doc.resources.flatMap((r) => (r.accepts || []).map((x) => ({ ...x, resource: x.resource || r.resource || r.url }))); if (!list.length) warnings.push("discovery_has_no_paid_accepts"); }
  else if (doc.scheme || doc.payTo) { kind = "single_requirement"; list = [doc]; }
  else return bad("no accepts[] / resources[] / requirement found", { keys: Object.keys(doc).slice(0, 20) });
  if (!list.length && kind !== "discovery_doc") issues.push("accepts_empty");
  const accepts = list.slice(0, 50).map((r) => checkAccept(r, expect));
  const valid = !issues.length && accepts.length > 0 && accepts.every((x) => x.ok);
  const nIss = issues.length + accepts.reduce((n, x) => n + x.issues.length, 0), nWarn = warnings.length + accepts.reduce((n, x) => n + x.warnings.length, 0);
  return { status: 200, body: { valid, kind, x402Version: doc.x402Version ?? null, score: Math.max(0, 100 - 25 * nIss - 5 * nWarn), accepts_count: list.length, accepts, issues, warnings, note: "Static check, no network calls. Pair with /v1/paymentheader to test a signed payment against these requirements." } };
}

// ---- /v1/eip3009
const TWA = [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }];
export function checkAuthorization({ authorization: au, signature, chain = "base", name, version, verifyingContract, chainId, primaryType = "TransferWithAuthorization", now }) {
  const nk = netKey(chain), t = nk && USDC[nk];
  if (!au || typeof au !== "object") throw new Error("authorization object required {from,to,value,validAfter,validBefore,nonce}");
  for (const k of ["from", "to", "value", "validAfter", "validBefore", "nonce"]) if (au[k] === undefined || au[k] === null || au[k] === "") throw new Error("authorization." + k + " missing");
  if (!signature) throw new Error("signature required (0x 65-byte)");
  if (t?.svm) throw new Error("EIP-3009 is EVM-only; " + nk + " uses SPL transfers (try /v1/soltx)");
  if (!t && (!chainId || !verifyingContract)) throw new Error("unknown chain; pass chain (base, base-sepolia, ethereum, arbitrum, optimism, polygon, avalanche) or chainId + verifyingContract");
  const domain = { name: name || t.name, version: String(version || t?.version || "2"), chainId: Number(chainId || t.chainId), verifyingContract: verifyingContract || t.address };
  if (!["TransferWithAuthorization", "ReceiveWithAuthorization"].includes(primaryType)) throw new Error("primaryType must be TransferWithAuthorization or ReceiveWithAuthorization");
  const message = { from: au.from, to: au.to, value: String(au.value), validAfter: String(au.validAfter), validBefore: String(au.validBefore), nonce: au.nonce };
  const issues = [], warnings = [];
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(au.nonce))) issues.push("nonce_not_bytes32");
  const td = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], [primaryType]: TWA }, primaryType, domain, message };
  const dg = typedDigest(td), rec = recoverAddress(dg.digest, signature);
  const signer_matches_from = sameA(rec.address, au.from);
  if (!signer_matches_from) issues.push("signer_not_from");
  if (rec.high_s) issues.push("high_s_signature (USDC ecrecover rejects s > n/2)");
  const ts = Math.floor(Number(now ?? Date.now() / 1000)), va = BigInt(au.validAfter), vb = BigInt(au.validBefore);
  let time_status = "valid_now"; if (BigInt(ts) <= va) time_status = "not_yet_valid"; else if (BigInt(ts) >= vb) time_status = "expired";
  if (time_status !== "valid_now") issues.push("time_window_" + time_status);
  if (vb - BigInt(ts) > 86400n * 7n) warnings.push("validBefore_far_future (>7d)");
  if (BigInt(au.value) === 0n) warnings.push("value_zero");
  const alt = [];
  if (!signer_matches_from) for (const [k, u] of Object.entries(USDC)) { if (u.svm) continue; for (const nm of new Set([u.name, "USDC", "USD Coin"])) { if (k === nk && nm === domain.name) continue; try { const d2 = typedDigest({ ...td, domain: { name: nm, version: u.version, chainId: u.chainId, verifyingContract: u.address } }); if (sameA(recoverAddress(d2.digest, signature).address, au.from)) alt.push({ chain: k, name: nm }); } catch {} } }
  if (alt.length) warnings.push("signature_valid_for_other_domain: " + alt.map((x) => `${x.chain}/${x.name}`).join(", "));
  return { valid: !issues.length, chain: nk, primaryType, domain, digest: hx(dg.digest), domain_separator: dg.domain_separator, struct_hash: dg.struct_hash, recovered_signer: rec.address, from: au.from, signer_matches_from, to: au.to, value_atomic: String(au.value), value_usdc: atomicToDec(au.value), validAfter: String(au.validAfter), validBefore: String(au.validBefore), checked_at_unix: ts, time_status, seconds_left: Number(vb - BigInt(ts)), high_s: rec.high_s, matching_other_domains: alt, issues, warnings };
}
const tryJ = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };
export async function eip3009(a) {
  let au = tryJ(a.authorization), sig = a.signature;
  if (!au && a.payload) { const p = tryJ(a.payload); au = p?.authorization || p?.payload?.authorization; sig = sig || p?.signature || p?.payload?.signature; }
  if (!au && a.from) au = { from: a.from, to: a.to, value: a.value, validAfter: a.validAfter ?? a.valid_after, validBefore: a.validBefore ?? a.valid_before, nonce: a.nonce };
  try { return { status: 200, body: checkAuthorization({ authorization: au, signature: sig, chain: a.chain ?? a.network ?? "base", name: a.name, version: a.version, verifyingContract: a.verifyingContract ?? a.verifying_contract, chainId: a.chainId ?? a.chain_id, primaryType: a.primaryType || a.primary_type || "TransferWithAuthorization", now: a.now }) }; }
  catch (e) { return bad(String(e.message || e).slice(0, 200)); }
}

// ---- /v1/paymentheader
export async function paymentheader(a) {
  const raw = a.header ?? a.x_payment ?? a["X-PAYMENT"] ?? a.payment_signature ?? a["PAYMENT-SIGNATURE"] ?? a.payment;
  if (raw === undefined || raw === "") return bad("header required: the base64 X-PAYMENT (v1) or PAYMENT-SIGNATURE (v2) value, or its decoded JSON");
  let p; try { p = parseJsonish(raw); } catch { return bad("header is not base64 JSON (or JSON)"); }
  const version = p.x402Version ?? (p.accepted ? 2 : 1), issues = [], warnings = [];
  const inner = p.payload || {}, au = inner.authorization, sig = inner.signature;
  const network = version === 2 ? p.accepted?.network : p.network, scheme = version === 2 ? p.accepted?.scheme : p.scheme;
  let reqs = null;
  if (a.requirements !== undefined && a.requirements !== "") { try { const r = parseJsonish(a.requirements); reqs = Array.isArray(r) ? r : Array.isArray(r.accepts) ? r.accepts : [r]; } catch { return bad("requirements must be JSON / base64 JSON (402 body, PAYMENT-REQUIRED header, accepts[] or one requirement)"); } }
  else if (version === 2 && p.accepted) { reqs = [p.accepted]; warnings.push("no requirements given; checked against payload.accepted (self-declared)"); }
  let sigcheck = null;
  if (!au || !sig) issues.push(inner.transaction ? "svm_payload (base64 tx) — decode with /v1/soltx" : "payload.authorization/signature missing");
  else { try { sigcheck = checkAuthorization({ authorization: au, signature: sig, chain: network || "base", name: a.name, version: a.version, now: a.now }); issues.push(...sigcheck.issues.map((x) => "sig:" + x)); } catch (e) { issues.push("sig_check_error: " + String(e.message).slice(0, 120)); } }
  let match = null;
  if (reqs && reqs.length) {
    const results = reqs.slice(0, 20).map((r) => { const m = []; const ra = String(reqAmount(r) ?? "");
      if (scheme && r.scheme && scheme !== r.scheme) m.push("scheme_mismatch"); if (netKey(network) !== netKey(r.network)) m.push(`network_mismatch: ${network} vs ${r.network}`);
      if (au) { if (!sameA(au.to, r.payTo)) m.push("to_not_payTo"); if (ra && String(au.value) !== ra) m.push(BigInt(au.value || 0) < BigInt(ra || 0) ? `value_below_required: ${au.value} < ${ra}` : `value_not_exact: ${au.value} != ${ra}`);
        const t = USDC[netKey(r.network)]; if (r.asset && t && !t.svm && !sameA(r.asset, t.address)) m.push("requirement_asset_not_native_usdc");
        if (r.maxTimeoutSeconds && sigcheck && sigcheck.seconds_left > Number(r.maxTimeoutSeconds) + 600) m.push("validBefore_beyond_maxTimeoutSeconds"); }
      if (version === 2 && p.accepted && r !== p.accepted && JSON.stringify(p.accepted) !== JSON.stringify(r)) m.push("v2_accepted_not_identical_to_requirement");
      return { network: r.network, payTo: r.payTo, amount_atomic: ra || null, mismatches: m }; });
    match = results.find((x) => !x.mismatches.length) || null; if (!match) issues.push("no_requirement_matches"); 
    return out(results);
  }
  warnings.push("no requirements supplied; only signature/time checked");
  return out(null);
  function out(results) { return { status: 200, body: { valid: !issues.length, x402Version: version, scheme: scheme ?? null, network: network ?? null, payer: au?.from ?? null, pay_to: au?.to ?? null, value_atomic: au?.value != null ? String(au.value) : null, value_usdc: au?.value != null ? atomicToDec(au.value) : null, signature_check: sigcheck, requirement_results: results, matched_requirement: match, issues, warnings, note: "Pure compute: does not check balance or nonce-used on chain; a facilitator /verify does that." } }; }
}
