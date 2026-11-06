// Sticky-wallet enrichment SKUs: /v1/addrprofile (keyless public-RPC read, fail-soft), /v1/allowance (approval/permit decode + optional live allowance),
// /v1/ens (namehash/labelhash/token ids + optional keyless resolve/reverse), /v1/addrpoison (address-poisoning / look-alike check, pure compute).
import { keccak, keccakHex, checksum } from "./evm.js";
const te = new TextEncoder();
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const H = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const MAXU = (1n << 256n) - 1n, MAX160 = (1n << 160n) - 1n;
export const LABELS = Object.fromEntries(Object.entries({
  "0x000000000022D473030F116dDEE9F6B43aC78BA3": "Uniswap Permit2", "0x6fF5693b99212Da76ad316178A184AB56D299b43": "Uniswap Universal Router (Base)", "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD": "Uniswap Universal Router",
  "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af": "Uniswap Universal Router v4", "0x2626664c2603336E57B271c5C0b26F421741e481": "Uniswap V3 SwapRouter02 (Base)", "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45": "Uniswap V3 SwapRouter02",
  "0x111111125421cA6dc452d289314280a0f8842A65": "1inch Router v6", "0xDef1C0ded9bec7F1a1670819833240f027b25EfF": "0x Exchange Proxy", "0x00000000000000ADc04C56Bf30aC9d3c0aAF14dC": "OpenSea Seaport 1.5", "0x0000000000000068F116a894984e2DB1123eB395": "OpenSea Seaport 1.6",
  "0x0000000071727De22E5E9d8BAf0edAc6f37da032": "ERC-4337 EntryPoint v0.7", "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789": "ERC-4337 EntryPoint v0.6", "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108": "ERC-4337 EntryPoint v0.8",
  "0xcA11bde05977b3631167028862bE2a173976CA11": "Multicall3", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913": "USDC (Base)", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48": "USDC (Ethereum)", "0x036CbD53842c5426634e7929541eC2318f3dCF7e": "USDC (Base Sepolia)",
  "0x4200000000000000000000000000000000000006": "WETH (Base/OP)", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2": "WETH (Ethereum)", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2": "USDT (Base)", "0xdAC17F958D2ee523a2206206994597C13D831ec7": "USDT (Ethereum)",
  "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e": "ENS Registry", "0x41675C099F32341bf84BFc5382aF534df5C7461a": "Safe Singleton 1.4.1", "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67": "Safe ProxyFactory 1.4.1",
  "0x0000000000000000000000000000000000000000": "zero address", "0x000000000000000000000000000000000000dEaD": "burn address",
}).map(([k, v]) => [k.toLowerCase(), v]));
const label = (a) => LABELS[String(a).toLowerCase()] || null;
// ---- keyless public RPC (fail soft) ----
export const RPCS = { base: ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.drpc.org"], ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth", "https://eth.merkle.io"], "base-sepolia": ["https://sepolia.base.org"], optimism: ["https://optimism-rpc.publicnode.com"], arbitrum: ["https://arbitrum-one-rpc.publicnode.com"], polygon: ["https://polygon-bor-rpc.publicnode.com"] };
const CHAIN_ALIAS = { "8453": "base", "eip155:8453": "base", "1": "ethereum", mainnet: "ethereum", eth: "ethereum", "eip155:1": "ethereum", "84532": "base-sepolia", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const chainKey = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : CHAIN_ALIAS[s] || null; };
const USDC_BY = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
// One JSON-RPC batch per call (1 subrequest); tries next endpoint on failure. Returns array of results (null on per-call error) or throws.
export async function rpcBatch(chain, calls) {
  let last;
  for (const url of RPCS[chain]) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map(([m, p], i) => ({ jsonrpc: "2.0", id: i, method: m, params: p }))), signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error("http " + r.status);
      const j = await r.json(); if (!Array.isArray(j)) throw new Error(j && j.error ? j.error.message : "non-batch reply");
      const out = new Array(calls.length).fill(null); for (const x of j) if (x && typeof x.id === "number" && !x.error) out[x.id] = x.result; return { results: out, rpc: new URL(url).host };
    } catch (e) { last = e; }
  }
  throw new Error("public rpc unavailable: " + (last && last.message));
}
const w32 = (v) => BigInt(v).toString(16).padStart(64, "0");
const aw = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const fmtUnits = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const i = s.slice(0, -d) || "0", f = s.slice(-d).replace(/0+$/, ""); return d ? (f ? `${i}.${f}` : i) : s; };
// ---- 1. /v1/addrprofile ----
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
export function classifyCode(code) {
  const c = String(code || "0x").toLowerCase();
  if (c === "0x" || c === "") return { type: "eoa" };
  if (c.startsWith("0xef0100") && c.length === 48) return { type: "eip7702_delegated_eoa", delegate: checksum("0x" + c.slice(8)) };
  const m = c.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/); if (m) return { type: "contract", proxy: "eip1167_minimal", implementation: checksum("0x" + m[1]) };
  const safe = c.includes("a619486e"); return { type: "contract", bytes: (c.length - 2) / 2, ...(safe && c.length < 1300 ? { proxy: "safe_proxy" } : {}) };
}
export function scoreProfile(p) {
  let s = 70; const r = [];
  if (p.label) { r.push("known_label"); s += 15; }
  if (p.type === "eoa") { if (p.nonce === 0) { s -= 25; r.push("fresh_eoa_no_outgoing_tx"); } else if (p.nonce < 5) { s -= 10; r.push("low_activity_eoa"); } else if (p.nonce > 5000) r.push("high_frequency_sender_bot_or_hot_wallet"); else s += 5; }
  if (p.type === "eip7702_delegated_eoa") { r.push("eip7702_delegated_code"); s -= 5; if (!label(p.delegate)) { s -= 10; r.push("delegate_unlabeled_review_it"); } }
  if (p.type === "contract") { r.push("contract_account"); if (p.proxy) { r.push("proxy_" + p.proxy); if (p.proxy !== "safe_proxy") s -= 5; } if (p.implementation && !label(p.implementation)) r.push("upgradeable_or_cloned_implementation"); }
  if (p.native_balance === "0" && p.usdc_balance === "0") { s -= 10; r.push("empty_balances"); }
  if (p.address_flags && p.address_flags.length) { s -= 30; r.push(...p.address_flags); }
  s = Math.max(0, Math.min(100, s)); return { score: s, band: s >= 75 ? "low_risk" : s >= 50 ? "medium" : "high_risk", reasons: r };
}
const addrFlags = (a) => { const raw = a.toLowerCase().slice(2), f = []; if (/^0{40}$/.test(raw)) f.push("zero_address"); else if (/^0{36}dead$/.test(raw)) f.push("burn_address"); else if (/^0{38}/.test(raw)) f.push("precompile_range"); return f; };
const mixedBadChecksum = (a) => /[a-f]/.test(a.slice(2)) && /[A-F]/.test(a.slice(2)) && checksum(a) !== a;
export async function addrprofile(a) {
  const address = String(a.address || a.wallet || "").trim(); if (!isA(address)) return bad("address (0x 40 hex) required");
  const chain = chainKey(a.chain || a.network); if (!chain) return bad("chain: base (default), ethereum, base-sepolia, optimism, arbitrum, polygon");
  const out = { address: checksum(address), chain, label: label(address), checksum_input_ok: !mixedBadChecksum(address), address_flags: addrFlags(address) };
  const usdc = USDC_BY[chain];
  try {
    const { results: [code, nonce, bal, ub, impl, beacon], rpc } = await rpcBatch(chain, [["eth_getCode", [address, "latest"]], ["eth_getTransactionCount", [address, "latest"]], ["eth_getBalance", [address, "latest"]],
      ["eth_call", [{ to: usdc, data: sel("balanceOf(address)") + aw(address) }, "latest"]], ["eth_getStorageAt", [address, IMPL_SLOT, "latest"]], ["eth_getStorageAt", [address, BEACON_SLOT, "latest"]]]);
    if (code === null && nonce === null) throw new Error("rpc returned errors");
    Object.assign(out, classifyCode(code), { nonce: nonce == null ? null : Number(big(nonce)), native_balance: bal == null ? null : fmtUnits(big(bal), 18), usdc_balance: ub == null ? null : fmtUnits(big(ub), 6), rpc });
    if (out.type === "contract") { const i = big(impl) & MAX160, b = big(beacon) & MAX160; if (i) Object.assign(out, { proxy: "eip1967", implementation: checksum("0x" + i.toString(16).padStart(40, "0")) }); else if (b) Object.assign(out, { proxy: "eip1967_beacon", beacon: checksum("0x" + b.toString(16).padStart(40, "0")) }); }
    for (const k of ["delegate", "implementation", "beacon"]) if (out[k] && label(out[k])) out[k + "_label"] = label(out[k]);
    out.live = true;
  } catch (e) { out.live = false; out.rpc_error = String(e.message || e).slice(0, 160); out.note = "public RPC unreachable; returned offline checks only"; }
  out.risk = scoreProfile(out); out.agent_hint = out.type === "eoa" ? "plain key-held wallet" : out.type === "eip7702_delegated_eoa" ? "smart-EOA (7702): signatures may be validated by delegate code" : out.type === "contract" ? "smart account / contract: use ERC-1271 for signature checks" : "unknown";
  return { status: 200, body: out };
}
// ---- 2. /v1/allowance ----
const SIGS = { approve: "approve(address,uint256)", increaseAllowance: "increaseAllowance(address,uint256)", setApprovalForAll: "setApprovalForAll(address,bool)", permit: "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)", permit2Approve: "approve(address,address,uint160,uint48)" };
const SEL = Object.fromEntries(Object.entries(SIGS).map(([k, s]) => [sel(s), k]));
const P2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";
const amt = (v, max) => { v = BigInt(v); return { raw: v.toString(), unlimited: v === max || v >= max / 2n, ...(v !== max && v < max / 2n ? { usdc_if_6dp: fmtUnits(v, 6) } : {}) }; };
const when = (t, now) => { t = Number(t); if (!t) return { unix: 0, status: "no_expiry" }; return { unix: t, iso: t < 1e11 ? new Date(t * 1000).toISOString() : null, status: t < now ? "expired" : t - now > 365 * 86400 ? "far_future_over_1y" : "active" }; };
function decodeCalldata(data, to, now) {
  const d = data.toLowerCase().replace(/^0x/, ""); const kind = SEL["0x" + d.slice(0, 8)]; if (!kind) return null;
  const w = (i) => d.slice(8 + i * 64, 8 + (i + 1) * 64), A = (i) => checksum("0x" + w(i).slice(24)), U = (i) => BigInt("0x" + (w(i) || "0"));
  if (d.length < 8 + 128) throw new Error("calldata too short for " + kind);
  if (kind === "permit2Approve" && (!to || to.toLowerCase() === P2)) return { kind: "permit2_approve", token: A(0), spender: A(1), amount: amt(U(2), MAX160), expiration: when(U(3), now) };
  if (kind === "approve" || kind === "increaseAllowance") return { kind, token: to ? checksum(to) : null, spender: A(0), amount: amt(U(1), MAXU) };
  if (kind === "setApprovalForAll") return { kind, collection: to ? checksum(to) : null, operator: A(0), approved: U(1) === 1n, scope: "ALL tokens in collection" };
  if (kind === "permit") return { kind: "eip2612_permit_call", token: to ? checksum(to) : null, owner: A(0), spender: A(1), amount: amt(U(2), MAXU), deadline: when(U(3), now) };
  return null;
}
function decodeTyped(t, now) {
  const td = typeof t === "string" ? JSON.parse(t) : t; const m = td.message || {}, pt = td.primaryType, dom = td.domain || {};
  const base = { domain: { name: dom.name, version: dom.version, chainId: dom.chainId != null ? Number(dom.chainId) : null, verifyingContract: dom.verifyingContract } };
  if (pt === "Permit" && m.spender) return { kind: "eip2612_permit_signature", ...base, token: dom.verifyingContract, owner: m.owner, spender: m.spender, amount: amt(m.value, MAXU), deadline: when(m.deadline, now), nonce: String(m.nonce) };
  if (pt === "PermitSingle") return { kind: "permit2_permit_single", ...base, token: m.details?.token, spender: m.spender, amount: amt(m.details?.amount ?? 0, MAX160), expiration: when(m.details?.expiration, now), sig_deadline: when(m.sigDeadline, now) };
  if (pt === "PermitBatch") return { kind: "permit2_permit_batch", ...base, spender: m.spender, items: (m.details || []).map((x) => ({ token: x.token, amount: amt(x.amount ?? 0, MAX160), expiration: when(x.expiration, now) })), sig_deadline: when(m.sigDeadline, now) };
  if (pt === "PermitTransferFrom" || pt === "PermitBatchTransferFrom") { const p = Array.isArray(m.permitted) ? m.permitted : [m.permitted || {}]; return { kind: "permit2_signature_transfer", ...base, spender: m.spender, items: p.map((x) => ({ token: x.token, amount: amt(x.amount ?? 0, MAXU) })), deadline: when(m.deadline, now) }; }
  if (pt === "TransferWithAuthorization" || pt === "ReceiveWithAuthorization") return { kind: "eip3009_" + pt, ...base, from: m.from, to: m.to, amount: amt(m.value, MAXU), valid_before: when(m.validBefore, now) };
  return { kind: "unknown_typed_data", ...base, primaryType: pt };
}
function flags(x) {
  const f = []; const all = [x, ...(x.items || [])];
  if (all.some((i) => i.amount && i.amount.unlimited)) f.push("UNLIMITED_AMOUNT");
  if (x.kind === "setApprovalForAll" && x.approved) f.push("APPROVE_ALL_NFTS");
  for (const k of ["expiration", "deadline", "sig_deadline"]) if (x[k] && x[k].status === "far_future_over_1y") f.push(k.toUpperCase() + "_OVER_1Y"); else if (x[k] && x[k].status === "no_expiry" && k !== "sig_deadline") f.push("NO_EXPIRY");
  const sp = x.spender || x.operator; if (sp) { if (!label(sp)) f.push("SPENDER_UNLABELED"); }
  if (x.kind && x.kind.startsWith("permit")) f.push("GASLESS_SIGNATURE_PHISHING_VECTOR");
  return f;
}
export async function allowance(a) {
  const now = Number(a.now) || Math.floor(Date.now() / 1000); let d = null;
  try {
    if (a.typed_data) d = decodeTyped(a.typed_data, now);
    else if (a.data || a.calldata) { const data = String(a.data || a.calldata); if (!/^0x[0-9a-fA-F]{8,}$/.test(data)) return bad("data must be 0x hex calldata"); d = decodeCalldata(data, isA(a.to || a.token || "") ? String(a.to || a.token) : null, now); if (!d) return bad("unrecognised selector: supports approve, increaseAllowance, setApprovalForAll, EIP-2612 permit, Permit2 approve"); }
  } catch (e) { return bad(String(e.message || e)); }
  const owner = a.owner, spender = a.spender || (d && (d.spender || d.operator)), token = a.token || (d && d.token);
  if (!d && !(isA(owner || "") && isA(spender || "") && isA(token || ""))) return bad("give data (calldata, +to), typed_data (EIP-712), or owner+spender+token for a live allowance read");
  const out = d ? { ...d, spender_label: label(d.spender || d.operator || "") , token_label: d.token ? label(d.token) : null, flags: flags(d) } : {};
  if (isA(owner || "") && isA(spender || "") && isA(token || "")) {
    const chain = chainKey(a.chain || a.network); if (!chain) return bad("bad chain");
    try {
      const { results: [al, dec, p2], rpc } = await rpcBatch(chain, [["eth_call", [{ to: token, data: sel("allowance(address,address)") + aw(owner) + aw(spender) }, "latest"]], ["eth_call", [{ to: token, data: sel("decimals()") }, "latest"]],
        ["eth_call", [{ to: P2, data: sel("allowance(address,address,address)") + aw(owner) + aw(token) + aw(spender) }, "latest"]]]);
      const decimals = dec ? Number(big(dec)) : null, v = big(al);
      out.live = { chain, rpc, owner: checksum(owner), token: checksum(token), spender: checksum(spender), erc20_allowance: al == null ? null : { raw: v.toString(), unlimited: v >= MAXU / 2n, ...(decimals != null && v < MAXU / 2n ? { formatted: fmtUnits(v, decimals) } : {}) }, decimals };
      if (p2 && p2.length >= 194) { const h = p2.slice(2); const pa = BigInt("0x" + h.slice(0, 64)), pe = Number(BigInt("0x" + h.slice(64, 128))); out.live.permit2_allowance = { raw: pa.toString(), unlimited: pa === MAX160, expiration: when(pe, now) }; }
      if (out.live.erc20_allowance && out.live.erc20_allowance.unlimited) (out.flags ||= []).push("LIVE_UNLIMITED_ALLOWANCE");
    } catch (e) { out.live = { error: String(e.message || e).slice(0, 160), note: "public RPC unreachable; decode-only result" }; }
  }
  out.verdict = (out.flags || []).some((f) => /UNLIMITED|APPROVE_ALL/.test(f)) ? "review: broad approval" : (out.flags || []).includes("SPENDER_UNLABELED") ? "caution: unknown spender" : "ok";
  if (d && (d.spender || d.operator) && (out.flags || []).length) out.revoke_calldata = d.kind === "setApprovalForAll" ? sel(SIGS.setApprovalForAll) + aw(d.operator) + w32(0) : d.kind.startsWith("permit2") ? { to: P2, data: sel("lockdown((address,address)[])") + w32(32) + w32(1) + aw(d.token || d.items?.[0]?.token || "0x0") + aw(d.spender) } : sel(SIGS.approve) + aw(d.spender) + w32(0);
  return { status: 200, body: out };
}
// ---- 3. /v1/ens ----
export function namehash(name) { let node = new Uint8Array(32); const labels = name ? name.split(".") : []; for (let i = labels.length - 1; i >= 0; i--) node = keccak(cat(node, keccak(te.encode(labels[i])))); return node; }
const REG = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
export function ensNormalize(raw) {
  const issues = []; let n = String(raw).trim().normalize("NFC"); if (n !== n.toLowerCase()) issues.push("uppercase_lowered"); n = n.toLowerCase();
  if (!n || /\s/.test(n)) return { error: "name empty or contains whitespace" }; if (n.split(".").some((l) => !l)) return { error: "empty label (double dot or leading/trailing dot)" };
  if (/[^\x00-\x7f]/.test(n)) issues.push("non_ascii_needs_full_ensip15_check"); if (/[\u0430-\u044f\u0391-\u03c9]/.test(n) && /[a-z]/.test(n)) issues.push("mixed_script_homoglyph_risk");
  if (/[\u200b-\u200d\ufeff]/.test(n)) issues.push("zero_width_characters"); if (/^xn--/.test(n) || n.includes(".xn--")) issues.push("punycode_label");
  if (/[^a-z0-9\-._\u0080-\uffff\u{10000}-\u{10ffff}]/u.test(n)) issues.push("disallowed_ascii_chars");
  return { name: n, issues };
}
const decStr = (h) => { try { const b = h.slice(2); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); const hexs = b.slice(off + 64, off + 64 + len * 2); return new TextDecoder().decode(Uint8Array.from(hexs.match(/../g) || [], (x) => parseInt(x, 16))); } catch { return null; } };
const decAddr = (h) => (h && h.length >= 66 ? "0x" + h.slice(-40) : null);
export async function ens(a) {
  const resolve = !(a.resolve === false || a.resolve === "false" || a.resolve === "0");
  if (a.address) {
    const address = String(a.address).trim(); if (!isA(address)) return bad("address must be 0x 40 hex");
    const node = H(namehash(address.toLowerCase().slice(2) + ".addr.reverse")); const out = { address: checksum(address), reverse_name: address.toLowerCase().slice(2) + ".addr.reverse", reverse_node: node };
    if (resolve) try {
      const r1 = (await rpcBatch("ethereum", [["eth_call", [{ to: REG, data: sel("resolver(bytes32)") + node.slice(2) }, "latest"]]])).results[0]; const res = decAddr(r1);
      if (!res || /^0x0{40}$/.test(res)) Object.assign(out, { primary_name: null, live: true });
      else { const nm = decStr((await rpcBatch("ethereum", [["eth_call", [{ to: res, data: sel("name(bytes32)") + node.slice(2) }, "latest"]]])).results[0] || "0x"); out.primary_name = nm || null; out.live = true;
        if (nm) { const fn = H(namehash(nm)); const fr = (await rpcBatch("ethereum", [["eth_call", [{ to: REG, data: sel("resolver(bytes32)") + fn.slice(2) }, "latest"]]])).results[0]; const fres = decAddr(fr);
          const fa = fres && !/^0x0{40}$/.test(fres) ? decAddr((await rpcBatch("ethereum", [["eth_call", [{ to: fres, data: sel("addr(bytes32)") + fn.slice(2) }, "latest"]]])).results[0]) : null;
          out.forward_verified = !!fa && fa.toLowerCase() === address.toLowerCase(); if (!out.forward_verified) out.warning = "reverse record does not forward-resolve to this address: do not trust the name"; } }
    } catch (e) { out.live = false; out.rpc_error = String(e.message || e).slice(0, 160); }
    return { status: 200, body: out };
  }
  if (!a.name) return bad("name (e.g. vitalik.eth) or address required");
  const nz = ensNormalize(a.name); if (nz.error) return bad(nz.error);
  const labels = nz.name.split("."), lh = H(keccak(te.encode(labels[0]))), node = H(namehash(nz.name));
  const out = { name: nz.name, normalization_issues: nz.issues, labels: labels.length, namehash: node, labelhash: lh, tld: labels[labels.length - 1], parent: labels.slice(1).join(".") || null,
    ...(labels.length === 2 && labels[1] === "eth" ? { eth_2ld: true, erc721_token_id: BigInt(lh).toString(), registrar: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85", short_name_lt3: [...labels[0]].length < 3 } : {}), name_wrapper_token_id: BigInt(node).toString(), dns_name: labels.length && labels[labels.length - 1] !== "eth" };
  if (resolve) try {
    const r = (await rpcBatch("ethereum", [["eth_call", [{ to: REG, data: sel("resolver(bytes32)") + node.slice(2) }, "latest"]], ["eth_call", [{ to: REG, data: sel("owner(bytes32)") + node.slice(2) }, "latest"]]])).results;
    const res = decAddr(r[0]), own = decAddr(r[1]); out.resolver = res && !/^0x0{40}$/.test(res) ? checksum(res) : null; out.registry_owner = own && !/^0x0{40}$/.test(own) ? checksum(own) : null;
    if (out.resolver) { const q = (await rpcBatch("ethereum", [["eth_call", [{ to: out.resolver, data: sel("addr(bytes32)") + node.slice(2) }, "latest"]], ["eth_call", [{ to: out.resolver, data: sel("text(bytes32,string)") + node.slice(2) + w32(64) + w32(3) + H(te.encode("url")).slice(2).padEnd(64, "0") }, "latest"]],
      ["eth_call", [{ to: out.resolver, data: sel("contenthash(bytes32)") + node.slice(2) }, "latest"]]])).results;
      const ad = decAddr(q[0]); out.address = ad && !/^0x0{40}$/.test(ad) ? checksum(ad) : null; out.url = q[1] ? decStr(q[1]) || null : null; out.has_contenthash = !!(q[2] && q[2].length > 130); }
    out.live = true; out.registered = !!(out.registry_owner || out.resolver);
    if (!out.address && out.resolver) out.note = "resolver has no ETH addr record (or uses offchain CCIP-read/wildcard, not followed)";
  } catch (e) { out.live = false; out.rpc_error = String(e.message || e).slice(0, 160); }
  return { status: 200, body: out };
}
// ---- 4. /v1/addrpoison ----
const list = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,;]+/) : []).map((x) => String(x).trim()).filter(Boolean);
const sim = (x, y) => { x = x.toLowerCase().slice(2); y = y.toLowerCase().slice(2); let p = 0, s = 0; while (p < 40 && x[p] === y[p]) p++; while (s < 40 && x[39 - s] === y[39 - s]) s++; return { prefix: p, suffix: s }; };
export async function addrpoison(a) {
  const cand = list(a.addresses || a.address || a.candidates), refs = list(a.known || a.address_book || a.reference), intended = a.intended ? String(a.intended).trim() : null;
  if (!cand.length) return bad("addresses (array or comma list, ≤50) required; optional known[] address book and intended");
  if (cand.length > 50 || refs.length > 200) return bad("max 50 addresses and 200 known");
  if (intended && !isA(intended)) return bad("intended must be 0x 40 hex");
  const book = [...new Set([...(intended ? [intended] : []), ...refs.filter(isA)].map((x) => x.toLowerCase()))];
  const results = cand.map((c) => {
    if (!isA(c)) return { input: c, valid: false, verdict: "invalid_address" };
    const lc = c.toLowerCase(), r = { input: c, valid: true, checksummed: checksum(c), checksum_input_ok: !mixedBadChecksum(c), label: label(c), flags: addrFlags(c) };
    if (!r.checksum_input_ok) r.flags.push("bad_eip55_checksum_typo_or_tampered");
    const lead = (lc.slice(2).match(/^0*/) || [""])[0].length; if (lead >= 6) r.flags.push("vanity_leading_zeros_" + lead);
    r.in_known = book.includes(lc);
    const looks = []; for (const k of book) if (k !== lc) { const s = sim(lc, k); if ((s.prefix >= 3 && s.suffix >= 3) || s.prefix + s.suffix >= 8) looks.push({ resembles: checksum(k), prefix_match: s.prefix, suffix_match: s.suffix, ...(label(k) ? { label: label(k) } : {}) }); }
    for (const [k, v] of Object.entries(LABELS)) if (k !== lc && !book.includes(k)) { const s = sim(lc, k); if (s.prefix >= 4 && s.suffix >= 4) looks.push({ resembles: checksum(k), label: v, prefix_match: s.prefix, suffix_match: s.suffix }); }
    if (looks.length) { r.lookalikes = looks; r.flags.push("ADDRESS_POISONING_SUSPECT"); }
    if (intended) { const s = sim(lc, intended); r.matches_intended = lc === intended.toLowerCase(); if (!r.matches_intended && s.prefix + s.suffix >= 6) r.flags.push("NEAR_MISS_OF_INTENDED"); }
    r.verdict = r.flags.some((f) => /POISON|NEAR_MISS|zero_address|burn_address|bad_eip55/.test(f)) ? "block" : intended && !r.matches_intended ? "mismatch" : r.in_known || r.label ? "known" : "unknown_ok";
    return r;
  });
  return { status: 200, body: { count: results.length, blocked: results.filter((r) => r.verdict === "block").length, results, method: "prefix/suffix similarity vs address book + well-known contracts; EIP-55 checksum; pure compute, zero outbound" } };
}
