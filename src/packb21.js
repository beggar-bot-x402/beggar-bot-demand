// packb21 (builder B, 2026-11-02): authpayload, multicall, erc1155bal, eventtopic. $0 upstream (keyless public RPCs / pure compute).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
import { typedDigest } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon", "84532": "base-sepolia" };
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137, "base-sepolia": 84532 };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : AL[s] || null; };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const unhex = (h) => Uint8Array.from(String(h).replace(/^0x/, "").match(/../g) || [], (x) => parseInt(x, 16));
function str(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
export async function authpayload(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from) || !isA(q.to)) return bad("from (payer) and to (pay_to) 0x required");
  const amt = String(q.amount ?? ""); if (!/^\d+(\.\d{1,6})?$/.test(amt)) return bad("amount: USDC decimal, max 6 dp");
  const secs = Math.min(Math.max(Number(q.valid_seconds || 300), 30), 86400 * 7);
  const tok = q.token && q.token !== "usdc" ? q.token : USDC[ch]; if (!isA(tok)) return bad("token must be 0x");
  try {
    const { results: [nm, ver, dec] } = await rpcBatch(ch, [["eth_call", [{ to: tok, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: tok, data: "0x54fd4d50" }, "latest"]], ["eth_call", [{ to: tok, data: "0x313ce567" }, "latest"]]]);
    const name = nm ? str(nm) : null, version = ver ? str(ver) : "1", d = dec ? Number(BigInt(dec.slice(0, 66))) : 6;
    if (!name) return bad("token has no name() — not an EIP-3009 token?");
    const [w, f = ""] = amt.split("."); const value = (BigInt(w) * 10n ** BigInt(d) + BigInt((f + "0".repeat(d)).slice(0, d) || "0")).toString();
    const now = Math.floor(Date.now() / 1000); const n = new Uint8Array(32); crypto.getRandomValues(n);
    const nonce = q.nonce && /^0x[0-9a-fA-F]{64}$/.test(q.nonce) ? q.nonce : "0x" + [...n].map((b) => b.toString(16).padStart(2, "0")).join("");
    const message = { from: checksum(q.from.toLowerCase()), to: checksum(q.to.toLowerCase()), value, validAfter: String(now - 60), validBefore: String(now + secs), nonce };
    const typed_data = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], TransferWithAuthorization: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] }, primaryType: "TransferWithAuthorization", domain: { name, version, chainId: CID[ch], verifyingContract: checksum(tok.toLowerCase()) }, message };
    const dg = typedDigest(typed_data); const digest = "0x" + [...dg.digest].map((b) => b.toString(16).padStart(2, "0")).join("");
    return ok({ chain: ch, network: "eip155:" + CID[ch], typed_data, digest, x402_authorization: message, expires_iso: new Date((now + secs) * 1000).toISOString(), sign_with: "eth_signTypedData_v4(from, typed_data)", note: "Unsigned. Sign client-side, then put {signature, authorization} in the X-PAYMENT payload." });
  } catch (e) { return err(e); }
}
export async function multicall(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  let calls = q.calls; if (typeof calls === "string") { try { calls = JSON.parse(calls); } catch { return bad("calls must be JSON array of {to,data}"); } }
  if (!Array.isArray(calls) || !calls.length || calls.length > 25 || !calls.every((c) => c && isA(c.to) && /^0x([0-9a-fA-F]{2})*$/.test(c.data || "0x"))) return bad("calls: array (max 25) of {to:0x, data:0x}");
  const blk = q.block == null ? "latest" : /^\d+$/.test(String(q.block)) ? "0x" + BigInt(q.block).toString(16) : String(q.block);
  try {
    const { results: r, rpc } = await rpcBatch(ch, [["eth_blockNumber", []], ...calls.map((c) => ["eth_call", [{ to: c.to, data: c.data || "0x", ...(isA(c.from) ? { from: c.from } : {}) }, blk]])]);
    return ok({ chain: ch, block: blk === "latest" ? Number(BigInt(r[0])) : blk, results: calls.map((c, i) => ({ to: c.to, success: r[i + 1] != null, return_data: r[i + 1] ?? null, as_uint: r[i + 1] && r[i + 1].length === 66 ? BigInt(r[i + 1]).toString() : undefined, as_address: r[i + 1] && r[i + 1].length === 66 && r[i + 1].startsWith("0x000000000000000000000000") ? checksum("0x" + r[i + 1].slice(26)) : undefined })), });
  } catch (e) { return err(e); }
}
export async function erc1155bal(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.contract) || !isA(q.owner)) return bad("contract and owner 0x required");
  const ids = String(q.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean); if (!ids.length || ids.length > 25 || !ids.every((x) => /^(\d+|0x[0-9a-fA-F]+)$/.test(x))) return bad("ids: csv of token ids (max 25)");
  try {
    const calls = [["eth_call", [{ to: q.contract, data: "0x01ffc9a7" + "d9b67a26".padEnd(64, "0") }, "latest"]]]; for (const id of ids) { const h = pad(BigInt(id).toString(16)); calls.push(["eth_call", [{ to: q.contract, data: "0x00fdd58e" + pad(q.owner) + h }, "latest"]], ["eth_call", [{ to: q.contract, data: "0x0e89341c" + h }, "latest"]]); }
    const { results: r } = await rpcBatch(ch, calls);
    const tokens = ids.map((id, i) => { const b = r[1 + 2 * i]; let u = r[2 + 2 * i] ? str(r[2 + 2 * i]) : null; const hexid = BigInt(id).toString(16).padStart(64, "0"); if (u && u.includes("{id}")) u = u.replace("{id}", hexid); return { id: BigInt(id).toString(), balance: b && b.length >= 66 ? BigInt(b.slice(0, 66)).toString() : null, uri: u }; });
    return ok({ chain: ch, contract: checksum(q.contract.toLowerCase()), owner: checksum(q.owner.toLowerCase()), is_erc1155: r[0] ? BigInt(r[0].slice(0, 66)) === 1n : false, held: tokens.filter((t) => t.balance && t.balance !== "0").length, tokens });
  } catch (e) { return err(e); }
}
const EVENTS = ["Transfer(address,address,uint256)", "Approval(address,address,uint256)", "ApprovalForAll(address,address,bool)", "TransferSingle(address,address,address,uint256,uint256)", "TransferBatch(address,address,address,uint256[],uint256[])", "AuthorizationUsed(address,bytes32)", "AuthorizationCanceled(address,bytes32)", "Swap(address,uint256,uint256,uint256,uint256,address)", "Swap(address,address,int256,int256,uint160,uint128,int24)", "Sync(uint112,uint112)", "Mint(address,uint256,uint256)", "Burn(address,uint256,uint256,address)", "Deposit(address,uint256)", "Withdrawal(address,uint256)", "Deposit(address,address,uint256,uint256)", "Withdraw(address,address,address,uint256,uint256)", "OwnershipTransferred(address,address)", "Upgraded(address)", "AdminChanged(address,address)", "BeaconUpgraded(address)", "Paused(address)", "Unpaused(address)", "RoleGranted(bytes32,address,address)", "RoleRevoked(bytes32,address,address)", "Blacklisted(address)", "UnBlacklisted(address)", "UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)", "AccountDeployed(bytes32,address,address,address)", "ExecutionSuccess(bytes32,uint256)", "ExecutionFailure(bytes32,uint256)", "SafeSetup(address,address[],uint256,address,address)", "PoolCreated(address,address,uint24,int24,address)", "PairCreated(address,address,address,uint256)", "MessageSent(bytes)", "DepositForBurn(uint64,address,uint256,address,bytes32,uint32,bytes32,bytes32)", "AnswerUpdated(int256,uint256,uint256)", "Initialized(uint8)", "Initialized(uint64)", "NameRegistered(string,bytes32,address,uint256,uint256)", "Supply(address,address,address,uint256,uint16)", "Borrow(address,address,address,uint256,uint8,uint256,uint16)", "LiquidationCall(address,address,address,uint256,uint256,address,bool)"];
let IDX = null;
export async function eventtopic(q) {
  if (!IDX) IDX = Object.fromEntries(EVENTS.map((e) => [keccakHex(e), e]));
  const sigs = String(q.signature || q.signatures || "").split(";").map((s) => s.trim()).filter(Boolean);
  const topics = String(q.topic || q.topics || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!sigs.length && !topics.length) return bad("signature (e.g. Transfer(address,address,uint256); separate many with ;) or topic (0x 32-byte csv) required");
  if (sigs.length + topics.length > 30) return bad("max 30 items");
  if (!topics.every((t) => /^0x[0-9a-f]{64}$/.test(t))) return bad("topic must be 0x 32-byte hex");
  const enc = sigs.map((s) => { const c = s.replace(/^event\s+/, "").replace(/\s+indexed\s*/g, " ").replace(/\s+\w+(?=[,)])/g, "").replace(/\s+/g, ""); if (!/^\w+\(.*\)$/.test(c)) return { signature: s, error: "bad signature" }; const t = keccakHex(c); return { signature: c, topic0: t, selector_if_function: t.slice(0, 10), known: !!IDX[t] }; });
  const dec = topics.map((t) => ({ topic0: t, event: IDX[t] || null, found: !!IDX[t] }));
  return ok({ encoded: enc, decoded: dec, known_events: EVENTS.length, tip: "Use topic0 in eth_getLogs filters; /v1/evmlog for fetching." });
}
