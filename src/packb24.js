// packb24 (builder B, 2026-11-02): txbuild, safehash, userophash, revertdecode. $0 upstream (keyless public RPCs / pure compute).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak, keccakHex, decTuple, parseSig } from "./evm.js";
import { typedDigest } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137 };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h ?? "").replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const w = (v) => unhex(pad(BigInt(v ?? 0).toString(16)));
const big = (v, d = 0n) => (v == null || v === "" ? d : BigInt(v));
const kh = (b) => "0x" + hex(keccak(b));
// ---- RLP ----
const be = (v) => { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
function rlp(x) { const L = (n, off) => { if (n < 56) return Uint8Array.of(off + n); const b = be(n); return cat(Uint8Array.of(off + 55 + b.length), b); }; if (Array.isArray(x)) { const body = cat(...x.map(rlp)); return cat(L(body.length, 0xc0), body); } if (x.length === 1 && x[0] < 0x80) return x; return cat(L(x.length, 0x80), x); }
export async function txbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required"); if (q.to && !isA(q.to)) return bad("to must be an address");
  let data; try { data = unhex(q.data || "0x"); } catch { return bad("data must be hex"); }
  let value; try { value = q.value_eth != null ? BigInt(Math.round(Number(q.value_eth) * 1e9)) * 10n ** 9n : big(q.value); } catch { return bad("value (wei) invalid"); }
  try {
    const call = { from: q.from, ...(q.to ? { to: q.to } : {}), data: "0x" + hex(data), value: "0x" + value.toString(16) };
    const { results: r } = await rpcBatch(ch, [["eth_getTransactionCount", [q.from, "pending"]], ["eth_maxPriorityFeePerGas", []], ["eth_getBlockByNumber", ["latest", false]], ["eth_estimateGas", [call]], ["eth_getBalance", [q.from, "latest"]]]);
    const nonce = q.nonce != null ? BigInt(q.nonce) : big(r[0]);
    const tip = q.max_priority_fee != null ? BigInt(q.max_priority_fee) : big(r[1], 1000000n);
    const baseFee = big(r[2] && r[2].baseFeePerGas);
    const maxFee = q.max_fee != null ? BigInt(q.max_fee) : baseFee * 2n + tip;
    const est = r[3] ? big(r[3]) : null;
    const gas = q.gas != null ? BigInt(q.gas) : est != null ? (est * 12n) / 10n : null;
    if (gas == null) return ok({ chain: ch, error: "eth_estimateGas failed — the call would likely revert; pass gas= to force", call, hint: "Use /v1/simcall or /v1/revertdecode to see why." });
    const cid = BigInt(CID[ch]);
    const fields = [be(cid), be(nonce), be(tip), be(maxFee), be(gas), q.to ? unhex(q.to) : new Uint8Array(0), be(value), data, []];
    const unsigned = cat(Uint8Array.of(2), rlp(fields));
    const bal = big(r[4]), worst = gas * maxFee + value;
    return ok({ chain: ch, type: "0x2 (EIP-1559)", tx: { chainId: Number(cid), nonce: Number(nonce), from: checksum(q.from), to: q.to ? checksum(q.to) : null, value: value.toString(), data: "0x" + hex(data), gas: gas.toString(), maxPriorityFeePerGas: tip.toString(), maxFeePerGas: maxFee.toString() }, estimate_gas: est?.toString() ?? null, base_fee: baseFee.toString(), unsigned_serialized: "0x" + hex(unsigned), signing_hash: kh(unsigned), max_cost_wei: worst.toString(), max_cost_eth: Number(worst) / 1e18, sender_balance_eth: Number(bal) / 1e18, sufficient_balance: bal >= worst, note: "Sign signing_hash (secp256k1, no prefix), then RLP-append yParity,r,s. Decode/verify with /v1/rawtx." });
  } catch (e) { return err(e); }
}
// ---- safehash ----
const SAFE_T = [["to", "address"], ["value", "uint256"], ["data", "bytes"], ["operation", "uint8"], ["safeTxGas", "uint256"], ["baseGas", "uint256"], ["gasPrice", "uint256"], ["gasToken", "address"], ["refundReceiver", "address"], ["nonce", "uint256"]];
export async function safehash(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.safe)) return bad("safe address required"); if (!isA(q.to)) return bad("to address required");
  try { unhex(q.data || "0x"); } catch { return bad("data must be hex"); }
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.safe, data: "0xaffed0e0" }, "latest"]], ["eth_call", [{ to: q.safe, data: "0xffa1ad74" }, "latest"]], ["eth_call", [{ to: q.safe, data: "0xe75235b8" }, "latest"]], ["eth_call", [{ to: q.safe, data: "0xf698da25" }, "latest"]]]);
    const onNonce = r[0] && r[0].length >= 66 ? BigInt(r[0].slice(0, 66)) : null;
    let ver = null; try { const b = unhex(r[1]); const len = Number(BigInt("0x" + hex(b.slice(32, 64)))); ver = new TextDecoder().decode(b.slice(64, 64 + len)); } catch {}
    if (onNonce == null && q.nonce == null) return bad("not a Safe (nonce() failed) — pass nonce to compute offline");
    const nonce = q.nonce != null ? BigInt(q.nonce) : onNonce;
    const Z = "0x0000000000000000000000000000000000000000";
    const msg = { to: q.to, value: String(big(q.value)), data: q.data || "0x", operation: Number(q.operation || 0), safeTxGas: String(big(q.safe_tx_gas)), baseGas: String(big(q.base_gas)), gasPrice: String(big(q.gas_price)), gasToken: q.gas_token || Z, refundReceiver: q.refund_receiver || Z, nonce: nonce.toString() };
    const legacy = ver && /^1\.[0-2]\./.test(ver);
    const domain = legacy ? { verifyingContract: q.safe } : { chainId: CID[ch], verifyingContract: q.safe };
    const td = { types: { EIP712Domain: legacy ? [{ name: "verifyingContract", type: "address" }] : [{ name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], SafeTx: SAFE_T.map(([name, type]) => ({ name, type })) }, primaryType: "SafeTx", domain, message: msg };
    const d = typedDigest(td);
    const onDs = r[3] && r[3].length >= 66 ? r[3].slice(0, 66) : null;
    return ok({ chain: ch, safe: checksum(q.safe), version: ver, threshold: r[2] ? Number(BigInt(r[2].slice(0, 66))) : null, current_nonce: onNonce?.toString() ?? null, nonce: nonce.toString(), nonce_status: onNonce == null ? "unknown" : nonce < onNonce ? "already used" : nonce === onNonce ? "next executable" : "queued (future)", safe_tx_hash: "0x" + hex(d.digest), domain_separator: d.domain_separator, domain_separator_onchain: onDs, domain_matches: onDs ? onDs.toLowerCase() === d.domain_separator.toLowerCase() : null, typed_data: td, note: "Owners sign safe_tx_hash (eth_signTypedData_v4 with typed_data). Check a signature with /v1/sigrecover." });
  } catch (e) { return err(e); }
}
// ---- userophash ----
const EP = { "0.6": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "0.7": "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "0.8": "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" };
export async function userophash(q) {
  let op = q.userop ?? q.user_op ?? q; if (typeof op === "string") { try { op = JSON.parse(op); } catch { return bad("userop must be JSON"); } }
  if (!isA(op.sender)) return bad("userop.sender required (JSON userop or flat params)");
  const ch = ck(q.chain); const cid = q.chain_id != null ? BigInt(q.chain_id) : ch ? BigInt(CID[ch]) : null; if (cid == null) return bad("unknown chain");
  const v = String(q.version || (op.accountGasLimits || op.callGasLimit == null ? "" : "") || (op.initCode != null || op.paymasterAndData != null && op.accountGasLimits == null && op.factory == null ? "0.6" : "0.7"));
  if (!EP[v] && !isA(q.entrypoint)) return bad("version 0.6|0.7|0.8");
  const ep = isA(q.entrypoint) ? q.entrypoint : EP[v];
  try {
    const u16 = (x) => pad(big(x).toString(16)).slice(32);
    let inner;
    if (v === "0.6") inner = cat(unhex(pad(op.sender)), w(op.nonce), keccak(unhex(op.initCode || "0x")), keccak(unhex(op.callData || "0x")), w(op.callGasLimit), w(op.verificationGasLimit), w(op.preVerificationGas), w(op.maxFeePerGas), w(op.maxPriorityFeePerGas), keccak(unhex(op.paymasterAndData || "0x")));
    else {
      const initCode = op.initCode ?? (op.factory && !/^0x0*$/.test(op.factory) ? op.factory + String(op.factoryData || "0x").slice(2) : "0x");
      const agl = op.accountGasLimits ?? "0x" + u16(op.verificationGasLimit) + u16(op.callGasLimit);
      const gf = op.gasFees ?? "0x" + u16(op.maxPriorityFeePerGas) + u16(op.maxFeePerGas);
      const pmd = op.paymasterAndData ?? (op.paymaster && !/^0x0*$/.test(op.paymaster) ? op.paymaster + u16(op.paymasterVerificationGasLimit) + u16(op.paymasterPostOpGasLimit) + String(op.paymasterData || "0x").slice(2) : "0x");
      if (v === "0.8") return bad("v0.8 uses EIP-712 hashing incl. 7702 initCode; use version 0.7 or eth_call EntryPoint.getUserOpHash via /v1/readcontract");
      inner = cat(unhex(pad(op.sender)), w(op.nonce), keccak(unhex(initCode)), keccak(unhex(op.callData || "0x")), unhex(pad(agl)), w(op.preVerificationGas), unhex(pad(gf)), keccak(unhex(pmd)));
    }
    const h = kh(cat(keccak(inner), unhex(pad(ep)), w(cid)));
    const nonce = big(op.nonce);
    const out = { version: v, entrypoint: checksum(ep), chain_id: Number(cid), user_op_hash: h, nonce_key: (nonce >> 64n).toString(), nonce_seq: (nonce & ((1n << 64n) - 1n)).toString() };
    if (ch && q.verify !== "false") { try { const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: ep, data: "0x35567e1a" + pad(op.sender) + pad((nonce >> 64n).toString(16)) }, "latest"]]]); if (r[0]) { const cur = BigInt(r[0].slice(0, 66)); out.onchain_next_nonce = cur.toString(); out.nonce_status = cur === nonce ? "next" : cur > nonce ? "already used" : "future (gap)"; } } catch {} }
    return ok({ ...out, note: "Sign user_op_hash as the account expects (most: personal_sign/EIP-191). Look up the op on-chain with /v1/userop." });
  } catch (e) { return bad(String(e.message || e)); }
}
// ---- revertdecode ----
const PANIC = { 0x00: "generic compiler panic", 0x01: "assert(false)", 0x11: "arithmetic overflow/underflow", 0x12: "division or modulo by zero", 0x21: "invalid enum value", 0x22: "bad storage byte array", 0x31: "pop() on empty array", 0x32: "array index out of bounds", 0x41: "out of memory / too large allocation", 0x51: "call to uninitialized internal function" };
const ERRS = ["ERC20InsufficientBalance(address,uint256,uint256)", "ERC20InsufficientAllowance(address,uint256,uint256)", "ERC20InvalidSender(address)", "ERC20InvalidReceiver(address)", "ERC20InvalidApprover(address)", "ERC20InvalidSpender(address)", "ERC721NonexistentToken(uint256)", "ERC721IncorrectOwner(address,uint256,address)", "ERC721InsufficientApproval(address,uint256)", "ERC1155InsufficientBalance(address,uint256,uint256,uint256)", "OwnableUnauthorizedAccount(address)", "OwnableInvalidOwner(address)", "AccessControlUnauthorizedAccount(address,bytes32)", "EnforcedPause()", "ExpectedPause()", "ReentrancyGuardReentrantCall()", "SafeERC20FailedOperation(address)", "FailedInnerCall()", "FailedCall()", "AddressEmptyCode(address)", "AddressInsufficientBalance(address)", "InsufficientBalance(uint256,uint256)", "ECDSAInvalidSignature()", "ECDSAInvalidSignatureLength(uint256)", "ECDSAInvalidSignatureS(bytes32)", "InvalidAccountNonce(address,uint256)", "ERC2612ExpiredSignature(uint256)", "ERC2612InvalidSigner(address,address)", "ERC1967InvalidImplementation(address)", "UUPSUnauthorizedCallContext()", "InvalidInitialization()", "NotInitializing()", "Unauthorized()", "NotOwner()", "InvalidSignature()", "TransferFailed()", "ZeroAddress()", "Expired()", "DeadlineExpired()", "SlippageExceeded()", "InsufficientOutputAmount()", "TooLittleReceived()", "TooMuchRequested()", "InvalidNonce()", "InvalidAmount()", "AllowanceExpired(uint256)", "InsufficientAllowance(uint256)", "SignatureExpired(uint256)", "InvalidSigner()", "FailedOp(uint256,string)", "FailedOpWithRevert(uint256,string,bytes)", "SignatureValidationFailed(address)", "ExecutionFailed()", "V3TooLittleReceived()", "V3TooMuchRequested()", "V2TooLittleReceived()", "TransactionDeadlinePassed()", "ExecutionFailed(uint256,bytes)"];
const EMAP = Object.fromEntries(ERRS.map((s) => [keccakHex(s).slice(0, 10), s]));
const STR_HINT = [[/transfer amount exceeds balance|insufficient balance/i, "sender lacks tokens"], [/allowance/i, "approve the spender first (see /v1/allowance)"], [/authorization is used|authorization is expired|not yet valid|invalid signature/i, "EIP-3009 auth problem — check with /v1/authverify"], [/blacklisted/i, "address is blocklisted by the token (see /v1/usdcblacklist)"], [/STF|TF\b/, "Uniswap safeTransfer failed — approval/balance"], [/Too little received|SPL/i, "slippage / price limit hit"], [/paused/i, "contract is paused (see /v1/paused)"]];
function decodeData(d) {
  const b = unhex(d); if (!b.length) return { kind: "empty", reason: "reverted without data (require without message, out-of-gas, or call to non-contract)" };
  const sel = "0x" + hex(b.slice(0, 4)), body = b.slice(4);
  if (sel === "0x08c379a0") { const [m] = decTuple(["string"], body, 0); const hint = STR_HINT.find(([re]) => re.test(m)); return { kind: "Error(string)", selector: sel, message: m, hint: hint ? hint[1] : null }; }
  if (sel === "0x4e487b71") { const c = Number(BigInt("0x" + hex(body.slice(0, 32)))); return { kind: "Panic(uint256)", selector: sel, code: "0x" + c.toString(16), reason: PANIC[c] || "unknown panic" }; }
  const s = EMAP[sel]; if (s) { const p = parseSig(s); let args = null; try { args = decTuple(p.params.map((x) => x.type), body, 0); } catch {} return { kind: "custom error", selector: sel, error: s, args: args && JSON.parse(JSON.stringify(args, (k, v) => (typeof v === "bigint" ? v.toString() : v))) }; }
  return { kind: "unknown custom error", selector: sel, raw: "0x" + hex(b), hint: "Look up the selector with /v1/fnsig" };
}
export async function revertdecode(q) {
  if (q.data) { try { return ok({ ...decodeData(q.data) }); } catch (e) { return bad(String(e.message || e)); } }
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(q.tx || ""))) return bad("data (revert hex) or tx (hash) required");
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getTransactionByHash", [q.tx]], ["eth_getTransactionReceipt", [q.tx]]]);
    const t = r[0], rc = r[1]; if (!t) return ok({ chain: ch, tx: q.tx, found: false });
    if (rc && rc.status === "0x1") return ok({ chain: ch, tx: q.tx, status: "success", note: "transaction did not revert" });
    const bn = t.blockNumber ? "0x" + (BigInt(t.blockNumber) - 1n).toString(16) : "latest";
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: t.from, to: t.to, data: t.input, value: t.value, gas: t.gas }, bn] });
    const { rpc } = await rpcBatch(ch, [["eth_blockNumber", []]]);
    const j = await fetch(rpc, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(6000) }).then((x) => x.json());
    const ed = j.error ? (typeof j.error.data === "string" ? j.error.data : j.error.data?.data) : null;
    const dec = ed ? decodeData(ed) : j.error ? { kind: "rpc message", message: j.error.message } : { kind: "no revert on replay", note: "replay at parent block succeeded — revert depended on intra-block state or gas" };
    return ok({ chain: ch, tx: q.tx, status: rc ? (rc.status === "0x0" ? "reverted" : rc.status) : "pending", gas_used: rc ? Number(BigInt(rc.gasUsed)) : null, gas_limit: Number(BigInt(t.gas)), out_of_gas_likely: rc ? BigInt(rc.gasUsed) * 100n >= BigInt(t.gas) * 99n : null, replay_block: bn, decoded: dec });
  } catch (e) { return err(e); }
}
