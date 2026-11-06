// Sticky pack 6 (2026-11-02): /v1/basename (Basenames forward/reverse on Base), /v1/permitcheck (EIP-2612 / Permit2 / EIP-3009 signature risk check, pure compute),
// /v1/contractrisk (bytecode + proxy + privileged-selector scan, keyless RPC), /v1/txstatus (tx confirmation / pending / dropped + nonce gap),
// /v1/paycheck (can this wallet pay N USDC: USDC + gas balance across 5 chains), /v1/siwe (EIP-4361 Sign-In-With-Ethereum parse + verify, pure compute).
import { keccak, keccakHex, checksum } from "./evm.js";
import { rpcBatch, LABELS, namehash } from "./walletintel.js";
import { typedDigest, recoverAddress } from "./sig.js";
import { decodeStr, fmtUnits } from "./onchain.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const H = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const aw = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const decAddr = (h) => (h && h.length >= 66 && !/^0x0*$/.test(h) ? checksum("0x" + h.slice(-40)) : null);
const label = (a) => (a ? LABELS[String(a).toLowerCase()] || null : null);
const MAX = (1n << 256n) - 1n, MAX160 = (1n << 160n) - 1n;
const nowS = (a) => (a && a.now != null ? Number(a.now) : Math.floor(Date.now() / 1000));
const CH = { base: "base", "8453": "base", "eip155:8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", "eip155:1": "ethereum", optimism: "optimism", op: "optimism", "10": "optimism", "eip155:10": "optimism", arbitrum: "arbitrum", arb: "arbitrum", "42161": "arbitrum", "eip155:42161": "arbitrum", polygon: "polygon", "137": "polygon", "eip155:137": "polygon", "base-sepolia": "base-sepolia", "84532": "base-sepolia", "eip155:84532": "base-sepolia" };
const chainOf = (c) => CH[String(c ?? "base").trim().toLowerCase()] || null;
const CHAIN_ID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137, "base-sepolia": 84532 };

// ---- 1. /v1/basename ----
const B_REG = "0xB94704422c2a1E396835A571837Aa5AE53285a95", B_RES = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
const decStrAbi = (h) => { try { return decodeStr(h); } catch { return null; } };
export function basenameNorm(raw) { let n = String(raw || "").trim().toLowerCase(); if (!n) return null; if (!n.includes(".")) n += ".base.eth"; return n; }
export async function basename(a) {
  const live = !(a.resolve === false || a.resolve === "false");
  if (a.address) {
    const ad = String(a.address).trim(); if (!isA(ad)) return bad("address must be 0x 40 hex");
    const rev = ad.toLowerCase().slice(2) + ".80002105.reverse", node = H(namehash(rev)); const out = { address: checksum(ad), reverse_name: rev, reverse_node: node, name: null, verified: false, live: false };
    if (!live) return { status: 200, body: out };
    try { const r = (await rpcBatch("base", [call(B_REG, sel("resolver(bytes32)") + node.slice(2)), call(B_RES, sel("name(bytes32)") + node.slice(2))])).results;
      const res = decAddr(r[0]); let nm = decStrAbi(r[1]);
      if (res && res.toLowerCase() !== B_RES.toLowerCase()) { const r2 = (await rpcBatch("base", [call(res, sel("name(bytes32)") + node.slice(2))])).results; nm = decStrAbi(r2[0]) || nm; }
      out.live = true; out.resolver = res; out.name = nm || null;
      if (nm) { const fn = H(namehash(nm)); const f = (await rpcBatch("base", [call(B_RES, sel("addr(bytes32)") + fn.slice(2))])).results; const fwd = decAddr(f[0]); out.forward_address = fwd; out.verified = !!fwd && fwd.toLowerCase() === ad.toLowerCase(); if (!out.verified) out.flags = ["PRIMARY_NAME_NOT_FORWARD_VERIFIED"]; }
    } catch (e) { out.error = String(e.message || e); }
    return { status: 200, body: out };
  }
  const name = basenameNorm(a.name); if (!name) return bad("name (e.g. jesse or jesse.base.eth) or address required");
  if (/\s|\.\./.test(name)) return bad("invalid name");
  const flags = []; if (/[^\x00-\x7f]/.test(name)) flags.push("NON_ASCII_HOMOGLYPH_RISK"); if (!name.endsWith(".base.eth")) flags.push("NOT_A_BASENAME_SUFFIX");
  const label0 = name.split(".")[0], node = H(namehash(name)), lh = keccakHex(label0);
  const out = { name, label: label0, node, labelhash: lh, token_id: BigInt(lh).toString(), registrar_hint: "Basenames ERC-721 token id = uint256(labelhash)", flags, live: false };
  if (!live) return { status: 200, body: out };
  try { const r = (await rpcBatch("base", [call(B_REG, sel("resolver(bytes32)") + node.slice(2)), call(B_REG, sel("owner(bytes32)") + node.slice(2))])).results;
    const res = decAddr(r[0]); out.resolver = res; out.owner = decAddr(r[1]); out.live = true; out.registered = !!out.owner;
    if (res) { const r2 = (await rpcBatch("base", [call(res, sel("addr(bytes32)") + node.slice(2)), call(res, sel("text(bytes32,string)") + node.slice(2) + "40".padStart(64, "0") + "6".padStart(64, "0") + Buffer_hex("avatar")), call(res, sel("text(bytes32,string)") + node.slice(2) + "40".padStart(64, "0") + "3".padStart(64, "0") + Buffer_hex("url")), call(res, sel("text(bytes32,string)") + node.slice(2) + "40".padStart(64, "0") + "f".padStart(64, "0") + Buffer_hex("com.twitter"))])).results;
      out.address = decAddr(r2[0]); out.records = { avatar: decStrAbi(r2[1]) || null, url: decStrAbi(r2[2]) || null, "com.twitter": decStrAbi(r2[3]) || null }; if (!out.address) flags.push("NO_ADDR_RECORD"); }
    else if (!out.registered) flags.push("NOT_REGISTERED");
  } catch (e) { out.error = String(e.message || e); }
  return { status: 200, body: out };
}
function Buffer_hex(s) { const h = [...new TextEncoder().encode(s)].map((b) => b.toString(16).padStart(2, "0")).join(""); return h.padEnd(64, "0"); }

// ---- 2. /v1/permitcheck ----
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const KINDS = { Permit: "eip2612_permit", PermitSingle: "permit2_allowance", PermitBatch: "permit2_allowance_batch", PermitTransferFrom: "permit2_signature_transfer", PermitBatchTransferFrom: "permit2_signature_transfer_batch", PermitWitnessTransferFrom: "permit2_witness_transfer", TransferWithAuthorization: "eip3009_transfer", ReceiveWithAuthorization: "eip3009_receive", PermitForAll: "nft_permit_for_all" };
export async function permitcheck(a) {
  let td = a.typed_data ?? a.typedData ?? a.data; if (!td) return bad("typed_data (EIP-712 JSON of the permit) required; signature, expected_owner, chain optional");
  try { if (typeof td === "string") td = JSON.parse(td); } catch { return bad("typed_data is not JSON"); }
  if (!td || typeof td !== "object" || !td.primaryType) return bad("typed_data needs primaryType, types, domain, message");
  let d; try { d = typedDigest(td); } catch (e) { return bad("typed data: " + e.message); }
  const now = nowS(a), m = td.message || {}, dom = td.domain || {}, pt = td.primaryType, flags = [], kind = KINDS[pt] || "unknown_typed_data";
  const vc = dom.verifyingContract ? String(dom.verifyingContract) : null; const isP2 = vc && vc.toLowerCase() === PERMIT2.toLowerCase();
  if (pt.startsWith("Permit") && pt !== "Permit" && pt !== "PermitForAll" && !isP2) flags.push("PERMIT2_TYPE_BUT_VERIFYING_CONTRACT_NOT_PERMIT2");
  const grants = []; const addG = (token, amount, spender, expiry) => { let amt = null; try { amt = BigInt(amount); } catch {} const unl = amt != null && (amt === MAX || amt === MAX160 || amt >= (1n << 128n)); grants.push({ token: token ? checksum(token) : vc && checksum(vc), token_label: label(token || vc), amount: amount != null ? String(amount) : null, unlimited: unl, spender: spender ? checksum(spender) : null, spender_label: label(spender), expires_at: expiry != null ? Number(expiry) : null }); if (unl) flags.push("UNLIMITED_AMOUNT"); };
  try {
    if (pt === "Permit") addG(vc, m.value, m.spender, m.deadline);
    else if (pt === "PermitSingle") addG(m.details?.token, m.details?.amount, m.spender, m.details?.expiration);
    else if (pt === "PermitBatch") for (const x of m.details || []) addG(x.token, x.amount, m.spender, x.expiration);
    else if (pt === "PermitTransferFrom" || pt === "PermitWitnessTransferFrom") addG(m.permitted?.token, m.permitted?.amount, m.spender, m.deadline);
    else if (pt === "PermitBatchTransferFrom") for (const x of m.permitted || []) addG(x.token, x.amount, m.spender, m.deadline);
    else if (pt === "TransferWithAuthorization" || pt === "ReceiveWithAuthorization") addG(vc, m.value, m.to, m.validBefore);
  } catch {}
  const deadline = m.deadline ?? m.validBefore ?? m.sigDeadline ?? (m.details && !Array.isArray(m.details) ? m.details.expiration : null);
  let dl = null; if (deadline != null) { dl = Number(deadline); if (dl && dl < now) flags.push("EXPIRED"); else if (dl > now + 365 * 86400 || BigInt(deadline) >= (1n << 47n)) flags.push("DEADLINE_OVER_1_YEAR_OR_NEVER"); }
  if (m.sigDeadline != null && Number(m.sigDeadline) < now) flags.push("SIG_DEADLINE_EXPIRED");
  const ch = a.chain ? chainOf(a.chain) : null; if (ch && dom.chainId != null && Number(dom.chainId) !== CHAIN_ID[ch]) flags.push("CHAIN_ID_MISMATCH");
  const owner = m.owner ?? m.from ?? null; const out = { kind, primaryType: pt, digest: H(d.digest), domain_separator: d.domain_separator, struct_hash: d.struct_hash, verifying_contract: vc && checksum(vc), verifying_contract_label: isP2 ? "Uniswap Permit2" : label(vc), chain_id: dom.chainId != null ? Number(dom.chainId) : null, owner: owner && isA(owner) ? checksum(owner) : owner, nonce: m.nonce != null ? String(m.nonce) : null, deadline: dl, seconds_left: dl ? dl - now : null, grants };
  if (a.signature) { try { const r = recoverAddress(d.digest, a.signature); out.signer = r.address; if (r.high_s) flags.push("HIGH_S_MALLEABLE"); const exp = a.expected_owner || owner; if (exp && isA(exp)) { out.signer_matches_owner = r.address.toLowerCase() === exp.toLowerCase(); if (!out.signer_matches_owner) flags.push("SIGNER_NOT_OWNER_OR_CONTRACT_WALLET_EIP1271"); } } catch (e) { flags.push("BAD_SIGNATURE"); out.signature_error = e.message; } }
  for (const g of grants) if (g.spender && !g.spender_label && !isP2 && kind === "eip2612_permit") { flags.push("UNKNOWN_SPENDER"); break; }
  out.flags = [...new Set(flags)];
  const severe = out.flags.some((f) => /BAD_SIGNATURE|SIGNER_NOT|CHAIN_ID|NOT_PERMIT2/.test(f)), risky = out.flags.some((f) => /UNLIMITED|NEVER|UNKNOWN_SPENDER/.test(f));
  out.verdict = severe ? "reject" : out.flags.includes("EXPIRED") ? "expired" : risky ? "caution" : "ok";
  return { status: 200, body: out };
}

// ---- 3. /v1/contractrisk ----
const RISK_SIGS = { "mint(address,uint256)": "mint", "mint(uint256)": "mint", "burn(address,uint256)": "owner_burn", "blacklist(address)": "blacklist", "addToBlacklist(address)": "blacklist", "setBlacklist(address,bool)": "blacklist", "blockBot(address)": "blacklist", "addBots(address[])": "blacklist", "isBlacklisted(address)": "blacklist", "pause()": "pausable", "unpause()": "pausable", "setFee(uint256)": "fee_setter", "setTaxFee(uint256)": "fee_setter", "setFees(uint256,uint256)": "fee_setter", "setBuyFee(uint256)": "fee_setter", "setSellFee(uint256)": "fee_setter", "updateFees(uint256,uint256)": "fee_setter", "setMaxTxAmount(uint256)": "max_tx_limit", "setMaxWalletSize(uint256)": "max_tx_limit", "setMaxWallet(uint256)": "max_tx_limit", "enableTrading()": "trading_toggle", "openTrading()": "trading_toggle", "setTradingEnabled(bool)": "trading_toggle", "excludeFromFee(address)": "fee_whitelist", "setCooldownEnabled(bool)": "cooldown", "upgradeTo(address)": "upgradeable", "upgradeToAndCall(address,bytes)": "upgradeable", "transferOwnership(address)": "ownable", "renounceOwnership()": "ownable", "owner()": "ownable", "withdraw()": "owner_withdraw", "rescueTokens(address,uint256)": "owner_withdraw", "permit(address,address,uint256,uint256,uint8,bytes32,bytes32)": "eip2612", "transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)": "eip3009", "multicall(bytes[])": "multicall", "setApprovalForAll(address,bool)": "erc721_or_1155", "transfer(address,uint256)": "erc20" };
const RS = Object.fromEntries(Object.entries(RISK_SIGS).map(([s, c]) => [sel(s).slice(2), { sig: s, cat: c }]));
export function scanBytecode(code) {
  const h = String(code || "").replace(/^0x/, "").toLowerCase(); const b = h.length / 2; const ops = { selfdestruct: 0, delegatecall: 0, create2: 0, create: 0, callcode: 0 }; const sels = new Set();
  for (let i = 0; i < b; i++) { const op = parseInt(h.substr(i * 2, 2), 16);
    if (op >= 0x60 && op <= 0x7f) { const n = op - 0x5f; if (n === 4) sels.add(h.substr((i + 1) * 2, 8)); i += n; continue; }
    if (op === 0xff) ops.selfdestruct++; else if (op === 0xf4) ops.delegatecall++; else if (op === 0xf5) ops.create2++; else if (op === 0xf0) ops.create++; else if (op === 0xf2) ops.callcode++; }
  const found = []; for (const s of sels) if (RS[s]) found.push({ selector: "0x" + s, signature: RS[s].sig, category: RS[s].cat });
  return { size_bytes: b, opcodes: ops, selector_count: sels.size, matched: found };
}
const ZOS = "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"; const IMPL = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", ADMIN = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103", BEACON = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
export async function contractrisk(a) {
  const ad = String(a.address ?? a.contract ?? "").trim(); const ch = chainOf(a.chain); if (!ch) return bad("chain must be base, ethereum, optimism, arbitrum, polygon, base-sepolia");
  let code = a.bytecode; const out = { address: isA(ad) ? checksum(ad) : null, chain: ch, label: label(ad), live: false };
  if (!code) { if (!isA(ad)) return bad("address (contract) or bytecode required");
    try { const r = (await rpcBatch(ch, [["eth_getCode", [ad, "latest"]], ["eth_getStorageAt", [ad, IMPL, "latest"]], ["eth_getStorageAt", [ad, ADMIN, "latest"]], ["eth_getStorageAt", [ad, BEACON, "latest"]], call(ad, sel("owner()")), call(ad, sel("paused()")), call(ad, sel("totalSupply()")), ["eth_getStorageAt", [ad, ZOS, "latest"]]])).results;
      code = r[0] || "0x"; out.live = true; out.proxy = { implementation: decAddr(r[1]) || decAddr(r[7]), admin: decAddr(r[2]), beacon: decAddr(r[3]) }; out.owner = decAddr(r[4]); out.owner_renounced = r[4] != null && r[4].length >= 66 && /^0x0*$/.test(r[4]); out.paused = r[5] && r[5].length >= 66 ? big(r[5]) === 1n : null;
      if (out.proxy.implementation) { const r2 = (await rpcBatch(ch, [["eth_getCode", [out.proxy.implementation, "latest"]]])).results; out.implementation_scan = scanBytecode(r2[0]); }
    } catch (e) { return { status: 200, body: { ...out, error: String(e.message || e) } }; } }
  const h = String(code).toLowerCase(); if (h === "0x" || h === "") return { status: 200, body: { ...out, is_contract: false, verdict: "not_a_contract", flags: ["NO_CODE_EOA_OR_UNDEPLOYED"] } };
  const flags = [], s = scanBytecode(h); out.is_contract = true; out.scan = s;
  if (h.startsWith("0xef0100")) { out.eip7702_delegate = checksum("0x" + h.slice(8, 48)); flags.push("EIP7702_DELEGATED_EOA"); }
  const m1167 = h.match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/); if (m1167) { out.minimal_proxy_target = checksum("0x" + m1167[1]); flags.push("EIP1167_MINIMAL_PROXY"); }
  const all = [...s.matched, ...((out.implementation_scan && out.implementation_scan.matched) || [])]; const cats = new Set(all.map((x) => x.category));
  if (out.proxy && (out.proxy.implementation || out.proxy.beacon)) flags.push("UPGRADEABLE_PROXY"); else if (cats.has("upgradeable")) flags.push("UPGRADEABLE_UUPS");
  if (s.opcodes.selfdestruct) flags.push("SELFDESTRUCT_OPCODE"); if (s.opcodes.delegatecall && !flags.includes("EIP1167_MINIMAL_PROXY") && !(out.proxy && out.proxy.implementation)) flags.push("DELEGATECALL_PRESENT");
  for (const [c, f] of [["mint", "OWNER_MINT"], ["blacklist", "BLACKLIST"], ["pausable", "PAUSABLE"], ["fee_setter", "MUTABLE_FEES"], ["max_tx_limit", "MAX_TX_LIMITS"], ["trading_toggle", "TRADING_TOGGLE"], ["cooldown", "COOLDOWN"], ["owner_withdraw", "OWNER_WITHDRAW"]]) if (cats.has(c)) flags.push(f);
  if (out.paused) flags.push("CURRENTLY_PAUSED"); if (out.owner && !out.owner_renounced) flags.push("ACTIVE_OWNER"); 
  const W = { BLACKLIST: 25, MUTABLE_FEES: 25, TRADING_TOGGLE: 20, OWNER_MINT: 15, SELFDESTRUCT_OPCODE: 20, UPGRADEABLE_PROXY: 15, UPGRADEABLE_UUPS: 15, CURRENTLY_PAUSED: 20, MAX_TX_LIMITS: 10, COOLDOWN: 10, PAUSABLE: 8, OWNER_WITHDRAW: 8, DELEGATECALL_PRESENT: 10, ACTIVE_OWNER: 5 };
  const score = Math.min(100, flags.reduce((n, f) => n + (W[f] || 0), 0)); const known = !!out.label;
  out.flags = flags; out.risk_score = score; out.verdict = known ? "known_contract" : score >= 50 ? "high_risk" : score >= 20 ? "medium_risk" : "low_risk";
  out.note = "Heuristic bytecode scan (PUSH4 selector + opcode) — not an audit; known stablecoins (USDC) are upgradeable/pausable/blacklistable by design.";
  return { status: 200, body: out };
}

// ---- 4. /v1/txstatus ----
export async function txstatus(a) {
  const ch = chainOf(a.chain); if (!ch) return bad("chain must be base, ethereum, optimism, arbitrum, polygon, base-sepolia");
  const th = String(a.tx_hash ?? a.hash ?? "").trim(), addr = String(a.address ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(th) && !isA(addr)) return bad("tx_hash (0x 32 bytes) or address required");
  try {
    if (!/^0x[0-9a-fA-F]{64}$/.test(th)) { const r = (await rpcBatch(ch, [["eth_getTransactionCount", [addr, "latest"]], ["eth_getTransactionCount", [addr, "pending"]], ["eth_getBalance", [addr, "latest"]], ["eth_blockNumber", []]])).results;
      const l = Number(big(r[0])), p = Number(big(r[1])); return { status: 200, body: { chain: ch, address: checksum(addr), nonce_latest: l, nonce_pending: p, pending_count: Math.max(0, p - l), next_nonce: p, native_balance: fmtUnits(big(r[2]), 18), block: Number(big(r[3])), stuck_suspected: p > l, hint: p > l ? `${p - l} tx pending; to replace, resend nonce ${l} with ≥10% higher maxFeePerGas + priority fee` : "no pending txs", live: true } }; }
    const r = (await rpcBatch(ch, [["eth_getTransactionByHash", [th]], ["eth_getTransactionReceipt", [th]], ["eth_blockNumber", []]])).results; const tx = r[0], rc = r[1], head = Number(big(r[2]));
    const out = { chain: ch, tx_hash: th, head_block: head, live: true };
    if (!tx && !rc) return { status: 200, body: { ...out, status: "not_found", hint: "not in mempool or chain: never broadcast, dropped, or wrong chain — try another chain=" } };
    if (tx) Object.assign(out, { from: checksum(tx.from), to: tx.to ? checksum(tx.to) : null, nonce: Number(big(tx.nonce)), value_native: fmtUnits(big(tx.value), 18), to_label: label(tx.to), selector: tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null });
    if (!rc) { out.status = "pending"; if (tx) { const n = (await rpcBatch(ch, [["eth_getTransactionCount", [tx.from, "latest"]]])).results[0]; const ln = Number(big(n)); out.sender_nonce_latest = ln; if (ln > out.nonce) { out.status = "replaced_or_dropped"; out.hint = "sender nonce moved past this tx: it was replaced (speed-up/cancel) or dropped"; } else if (ln < out.nonce) { out.status = "pending_nonce_gap"; out.hint = `blocked: nonces ${ln}..${out.nonce - 1} must confirm first`; } else out.hint = "next in line; if slow, resend same nonce with ≥10% higher fees"; out.max_fee_gwei = tx.maxFeePerGas ? Number(big(tx.maxFeePerGas)) / 1e9 : tx.gasPrice ? Number(big(tx.gasPrice)) / 1e9 : null; } return { status: 200, body: out }; }
    const bn = Number(big(rc.blockNumber)), conf = head >= bn ? head - bn + 1 : 1, ok = rc.status === "0x1";
    const fin = { ethereum: 64, polygon: 128 }[ch] || 1; // L2: soft-final at inclusion by sequencer; L1 ~2 epochs
    Object.assign(out, { status: ok ? "success" : "reverted", block: bn, confirmations: conf, gas_used: Number(big(rc.gasUsed)), effective_gas_price_gwei: Number(big(rc.effectiveGasPrice)) / 1e9, fee_native: fmtUnits(big(rc.gasUsed) * big(rc.effectiveGasPrice) + big(rc.l1Fee), 18), logs: (rc.logs || []).length, contract_created: rc.contractAddress ? checksum(rc.contractAddress) : null, safe_to_ship: ok && conf >= fin, finality_note: ch === "ethereum" ? "≈64 blocks (2 epochs) for finality" : ch === "polygon" ? "≈128 blocks suggested" : "OP/Arbitrum L2: sequencer-confirmed at inclusion; L1-final after batch posting (~minutes) / 7-day challenge for withdrawals" });
    return { status: 200, body: out };
  } catch (e) { return { status: 200, body: { chain: ch, live: false, error: String(e.message || e) } }; }
}

// ---- 5. /v1/paycheck ----
const USDC_BY = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
export async function paycheck(a) {
  const ad = String(a.address ?? "").trim(); if (!isA(ad)) return bad("address required");
  let amt = 0n; const am = String(a.amount ?? "0").replace(/^\$/, ""); if (!/^\d*(\.\d{0,6})?$/.test(am)) return bad("amount = USDC decimal, ≤6 dp");
  { const [i, f = ""] = am.split("."); amt = BigInt(i || "0") * 1000000n + BigInt((f + "000000").slice(0, 6)); }
  const chains = (a.chains ? String(a.chains).split(",") : ["base", "ethereum", "optimism", "arbitrum", "polygon"]).map((c) => chainOf(c.trim())); if (chains.some((c) => !c) || chains.length > 6) return bad("chains: comma list of base, ethereum, optimism, arbitrum, polygon, base-sepolia");
  const res = await Promise.all(chains.map(async (ch) => { try { const r = (await rpcBatch(ch, [call(USDC_BY[ch], sel("balanceOf(address)") + aw(ad)), ["eth_getBalance", [ad, "latest"]], ["eth_getCode", [ad, "latest"]]])).results;
    const u = big(r[0]), n = big(r[1]), code = r[2] || "0x"; const eoa = code === "0x" || code.startsWith("0xef0100");
    return { chain: ch, usdc: fmtUnits(u, 6), usdc_atomic: u.toString(), native: fmtUnits(n, 18), has_gas: n > 0n, account: code === "0x" ? "eoa" : code.startsWith("0xef0100") ? "eip7702" : "contract", can_pay_x402: u >= amt && eoa, can_pay_onchain: u >= amt && n > 0n, shortfall_usdc: u >= amt ? "0" : fmtUnits(amt - u, 6), live: true }; }
    catch (e) { return { chain: ch, live: false, error: String(e.message || e) }; } }));
  const ok = res.filter((x) => x.can_pay_x402).sort((x, y) => (BigInt(y.usdc_atomic) > BigInt(x.usdc_atomic) ? 1 : -1));
  const total = res.reduce((n, x) => n + (x.usdc_atomic ? BigInt(x.usdc_atomic) : 0n), 0n);
  return { status: 200, body: { address: checksum(ad), amount_usdc: fmtUnits(amt, 6), can_pay: ok.length > 0, best_chain: ok[0] ? ok[0].chain : null, total_usdc: fmtUnits(total, 6), chains: res, note: "x402 'exact' uses gasless EIP-3009 (facilitator pays gas) → only USDC balance + EOA/7702 signer needed; contract wallets need EIP-1271-aware facilitators" } };
}

// ---- 6. /v1/siwe ----
export function parseSiwe(msg) {
  const L = String(msg).replace(/\r\n/g, "\n").split("\n"); const e = [];
  const m0 = L[0] && L[0].match(/^(?:([a-z][a-z0-9+.-]*):\/\/)?(\S+) wants you to sign in with your Ethereum account:$/); if (!m0) throw new Error("line 1 must be '<domain> wants you to sign in with your Ethereum account:'");
  const o = { scheme: m0[1] || null, domain: m0[2], address: (L[1] || "").trim() }; let i = 2;
  if (L[i] === "") { i++; if (L[i] !== undefined && !/^[A-Z][A-Za-z ]+: /.test(L[i])) { o.statement = L[i]; i++; } if (L[i] === "") i++; }
  const F = { URI: "uri", Version: "version", "Chain ID": "chainId", Nonce: "nonce", "Issued At": "issuedAt", "Expiration Time": "expirationTime", "Not Before": "notBefore", "Request ID": "requestId" };
  for (; i < L.length; i++) { const l = L[i]; if (l === "Resources:") { o.resources = L.slice(i + 1).filter((x) => x.startsWith("- ")).map((x) => x.slice(2)); break; } const m = l.match(/^([A-Za-z ]+): (.*)$/); if (m && F[m[1]]) o[F[m[1]]] = m[2]; else if (l.trim()) e.push("unrecognized line: " + l.slice(0, 80)); }
  return { fields: o, parse_warnings: e };
}
export async function siwe(a) {
  const msg = a.message; if (!msg || typeof msg !== "string") return bad("message (EIP-4361 text) required; signature, domain, nonce, address optional");
  if (msg.length > 20000) return bad("message too long");
  let p; try { p = parseSiwe(msg); } catch (e) { return bad(e.message); }
  const f = p.fields, now = a.now != null ? Number(a.now) * 1000 : Date.now(), errs = [], warn = [...p.parse_warnings];
  if (!isA(f.address)) errs.push("ADDRESS_INVALID"); else if (f.address !== checksum(f.address)) errs.push("ADDRESS_NOT_EIP55_CHECKSUMMED");
  for (const k of ["uri", "version", "chainId", "nonce", "issuedAt"]) if (!f[k]) errs.push("MISSING_" + k.toUpperCase());
  if (f.version && f.version !== "1") errs.push("VERSION_NOT_1"); if (f.nonce && !/^[A-Za-z0-9]{8,}$/.test(f.nonce)) errs.push("NONCE_UNDER_8_ALNUM");
  const ts = (k) => { if (!f[k]) return null; const t = Date.parse(f[k]); if (isNaN(t)) { errs.push(k.toUpperCase() + "_NOT_RFC3339"); return null; } return t; };
  const ia = ts("issuedAt"), ex = ts("expirationTime"), nb = ts("notBefore");
  if (ex != null && ex < now) errs.push("EXPIRED"); if (nb != null && nb > now) errs.push("NOT_YET_VALID"); if (ia != null && ia > now + 300000) warn.push("ISSUED_IN_FUTURE");
  if (ia != null && ex == null && now - ia > 86400000) warn.push("NO_EXPIRY_AND_OLDER_THAN_24H");
  if (a.domain && f.domain !== String(a.domain)) errs.push("DOMAIN_MISMATCH_PHISHING_RISK"); if (a.nonce && f.nonce !== String(a.nonce)) errs.push("NONCE_MISMATCH_REPLAY_RISK");
  if (a.chain_id && String(f.chainId) !== String(a.chain_id)) errs.push("CHAIN_ID_MISMATCH"); if (f.uri && f.domain && !f.uri.includes(f.domain)) warn.push("URI_HOST_DIFFERS_FROM_DOMAIN");
  const out = { fields: f, message_hash: H(keccak(new TextEncoder().encode("\x19Ethereum Signed Message:\n" + new TextEncoder().encode(msg).length + msg))) };
  if (a.signature) { try { const r = recoverAddress(keccak(new TextEncoder().encode("\x19Ethereum Signed Message:\n" + new TextEncoder().encode(msg).length + msg)), a.signature); out.signer = r.address; out.signature_valid = isA(f.address) && r.address.toLowerCase() === f.address.toLowerCase(); if (!out.signature_valid) errs.push("SIGNER_NOT_MESSAGE_ADDRESS_OR_EIP1271_WALLET"); } catch (e) { errs.push("BAD_SIGNATURE"); out.signature_error = e.message; } }
  if (a.address && isA(f.address) && String(a.address).toLowerCase() !== f.address.toLowerCase()) errs.push("ADDRESS_MISMATCH");
  out.errors = errs; out.warnings = warn; out.valid = errs.length === 0 && (a.signature ? out.signature_valid === true : true); out.verified_signature = !!a.signature;
  return { status: 200, body: out };
}
