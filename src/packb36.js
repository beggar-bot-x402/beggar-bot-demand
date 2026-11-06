// packb36 (builder B, 2026-11-02): l2deposit, l2withdraw, sendcalls, safecreate. $0 upstream (keyless public RPCs).
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
const kh = (b) => "0x" + hex(keccak(b));
const L1B = { base: "0x3154Cf16ccdb4C6d922629664174b904d80F2C35", optimism: "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1" };
const ARB_INBOX = "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f";
// ---- l2deposit: Ethereum → Base/Optimism/Arbitrum native bridge (ETH) ----
export async function l2deposit(q) {
  if (!isA(q.from)) return bad("from address required"); const dst = ck(q.destination); if (!["base", "optimism", "arbitrum"].includes(dst)) return bad("destination: base|optimism|arbitrum");
  const units = toUnits(q.amount, 18); if (units == null || units === 0n) return bad("amount (ETH, human units) required");
  const to = isA(q.recipient) ? q.recipient : q.from; let target, data;
  if (dst === "arbitrum") { target = ARB_INBOX; if (to.toLowerCase() !== q.from.toLowerCase()) return bad("arbitrum depositEth credits the sender (aliased if contract); recipient≠from not supported"); data = "0x439370b1"; }
  else { target = L1B[dst]; data = "0xe11013dd" + pad(to) + pad((Number(q.min_gas_limit ?? 200000)).toString(16)) + pad("60") + pad("0"); }
  try {
    const { results: r } = await rpcBatch("ethereum", [["eth_getBalance", [q.from, "latest"]], ["eth_getCode", [q.from, "latest"]]]);
    const bal = r[0] ? BigInt(r[0]) : null, isC = r[1] && r[1] !== "0x"; const warn = [];
    if (bal != null && bal < units) warn.push("insufficient ETH on Ethereum"); if (isC && dst === "arbitrum") warn.push("sender is a contract — funds land at the ALIASED address on Arbitrum (+0x1111…1111)");
    const t = await txbuild({ chain: "ethereum", from: q.from, to: target, data, value: units.toString(), ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ source: "ethereum", destination: dst, amount_eth: fmt(units, 18), recipient: checksum(to), bridge_contract: checksum(target), method: dst === "arbitrum" ? "Inbox.depositEth()" : "L1StandardBridge.bridgeETHTo(to, minGasLimit, 0x)", eta: dst === "arbitrum" ? "~10-15 min" : "~1-3 min", l1_balance_eth: bal == null ? null : fmt(bal, 18), calldata: data, ...pick(t), warnings: warn, note: "Canonical bridge — no third-party trust; L1 gas is the main cost. For speed/cost compare /v1/bridgequote." });
  } catch (e) { return err(e); }
}
// ---- l2withdraw: Base/Optimism/Arbitrum → Ethereum native withdrawal (ETH) ----
export async function l2withdraw(q) {
  const ch = ck(q.chain); if (!["base", "optimism", "arbitrum"].includes(ch)) return bad("chain: base|optimism|arbitrum"); if (!isA(q.from)) return bad("from address required");
  const units = toUnits(q.amount, 18); if (units == null || units === 0n) return bad("amount (ETH, human units) required");
  const to = isA(q.recipient) ? q.recipient : q.from; let target, data;
  if (ch === "arbitrum") { target = "0x0000000000000000000000000000000000000064"; data = "0x25e16063" + pad(to); }
  else { target = "0x4200000000000000000000000000000000000016"; data = "0xc2b3e5ac" + pad(to) + pad((Number(q.min_gas_limit ?? 100000)).toString(16)) + pad("60") + pad("0"); }
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getBalance", [q.from, "latest"]]]); const bal = r[0] ? BigInt(r[0]) : null;
    const warn = ["Native withdrawals take ~7 days (challenge period) and need extra L1 txs: " + (ch === "arbitrum" ? "executeTransaction on the Outbox after ~1 week." : "prove (after the output/dispute game is posted, ~1-4h) then finalize after 7 days on Ethereum.") + " For instant exits use a third-party bridge (/v1/bridgequote)."];
    if (bal != null && bal < units) warn.push("insufficient ETH");
    const t = await txbuild({ chain: ch, from: q.from, to: target, data, value: units.toString(), ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ source: ch, destination: "ethereum", amount_eth: fmt(units, 18), recipient: checksum(to), contract: checksum(target), method: ch === "arbitrum" ? "ArbSys.withdrawEth(to)" : "L2ToL1MessagePasser.initiateWithdrawal(to, gasLimit, 0x)", balance_eth: bal == null ? null : fmt(bal, 18), calldata: data, ...pick(t), warnings: warn, steps: ch === "arbitrum" ? ["initiate (this tx)", "wait ~6.4 days", "Outbox.executeTransaction on L1"] : ["initiate (this tx)", "wait for dispute game covering the block", "OptimismPortal.proveWithdrawalTransaction on L1", "wait 7 days", "OptimismPortal.finalizeWithdrawalTransaction on L1"] });
  } catch (e) { return err(e); }
}
// ---- sendcalls: EIP-5792 wallet_sendCalls payload + per-call simulation ----
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137 };
export async function sendcalls(q) {
  const ch = ck(q.chain); if (!ch || !CID[ch]) return bad("chain: " + Object.keys(CID).join(", ")); if (!isA(q.from)) return bad("from address required");
  let calls = q.calls; if (typeof calls === "string") { try { calls = JSON.parse(calls); } catch { return bad("calls: JSON array of {to,data?,value?}"); } }
  if (!Array.isArray(calls) || !calls.length || calls.length > 20) return bad("calls: 1-20 entries {to,data?,value?}");
  const norm = []; for (const c of calls) { if (!c || !isA(c.to)) return bad("each call needs to"); let d; try { d = "0x" + hex(unhex(c.data || "0x")); } catch { return bad("call data must be hex"); } let v; try { v = BigInt(c.value || 0); } catch { return bad("value must be wei integer"); } norm.push({ to: checksum(c.to), data: d, value: "0x" + v.toString(16) }); }
  try {
    const { results: r } = await rpcBatch(ch, norm.map((c) => ["eth_call", [{ from: q.from, ...c }, "latest"]]));
    const sim = norm.map((c, i) => ({ index: i, to: c.to, selector: c.data.slice(0, 10), standalone_ok: r[i] != null }));
    const payload = { method: "wallet_sendCalls", params: [{ version: "2.0.0", chainId: "0x" + CID[ch].toString(16), from: checksum(q.from), atomicRequired: String(q.atomic ?? "true") !== "false", calls: norm, ...(q.paymaster_url ? { capabilities: { paymasterService: { url: String(q.paymaster_url) } } } : {}) }] };
    const warn = []; if (sim.some((s, i) => i > 0 && !s.standalone_ok)) warn.push("some later calls fail standalone — expected if they depend on earlier calls (e.g. approve→swap); atomic batch handles that");
    if (!sim[0].standalone_ok) warn.push("first call reverts on its own — the batch will revert");
    return ok({ chain: ch, payload, capabilities_check: { method: "wallet_getCapabilities", params: [checksum(q.from), ["0x" + CID[ch].toString(16)]] }, status_poll: { method: "wallet_getCallsStatus", params: ["<id returned by wallet_sendCalls>"] }, simulation: sim, warnings: warn, note: "Works with EIP-7702/smart wallets (Coinbase Smart Wallet, MetaMask, Safe via WalletConnect). If the wallet lacks atomic support, set atomic=false or fall back to sequential txs (/v1/txbatch)." });
  } catch (e) { return err(e); }
}
// ---- safecreate: deploy a new Safe 1.4.1 with predicted address ----
const SPF = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", SINGLETON_L2 = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", SINGLETON = "0x41675C099F32341bf84BFc5382aF534df5C7461a", FBH = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
export async function safecreate(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  const owners = [...new Set(String(q.owners || q.from).split(/[\s,]+/).filter(Boolean).map((x) => x.toLowerCase()))]; if (!owners.length || owners.length > 20 || !owners.every(isA)) return bad("owners: 1-20 comma-separated addresses");
  const thr = Number(q.threshold ?? 1); if (!(Number.isInteger(thr) && thr >= 1 && thr <= owners.length)) return bad("threshold: 1.." + owners.length);
  const sn = BigInt(/^\d+$/.test(String(q.salt_nonce ?? "")) ? q.salt_nonce : Date.now());
  const single = ch === "ethereum" ? SINGLETON : SINGLETON_L2;
  const ownersEnc = pad(owners.length.toString(16)) + owners.map(pad).join("");
  const init = "0xb63e800d" + pad("100") + pad(thr.toString(16)) + pad("0") + pad((0x100 + 32 + 32 * owners.length).toString(16)) + pad(FBH) + pad("0") + pad("0") + pad("0") + ownersEnc + pad("0");
  const data = "0x1688f0b9" + pad(single) + pad("60") + pad(sn.toString(16)) + pad(((init.length - 2) / 2).toString(16)) + init.slice(2).padEnd(Math.ceil((init.length - 2) / 64) * 64, "0");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: SPF, data: "0x53e5d935" }, "latest"]], ["eth_getCode", [single, "latest"]]]);
    if (!r[0] || r[0].length < 130) return bad("SafeProxyFactory 1.4.1 not found on " + ch); if (!r[1] || r[1] === "0x") return bad("Safe 1.4.1 singleton not deployed on " + ch);
    const n = Number(w(r[0], 1)); const code = r[0].slice(130, 130 + n * 2);
    const salt = kh(unhex(kh(unhex(init.slice(2))).slice(2) + pad(sn.toString(16))));
    const ih = kh(unhex(code + pad(single)));
    const addr = "0x" + kh(cat(Uint8Array.of(0xff), unhex(SPF), unhex(salt), unhex(ih))).slice(26);
    const { results: c } = await rpcBatch(ch, [["eth_getCode", [addr, "latest"]]]); const exists = c[0] && c[0] !== "0x";
    const t = exists ? { body: { error: "Safe already deployed at predicted address — change salt_nonce" } } : await txbuild({ chain: ch, from: q.from, to: SPF, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    const warn = []; if (thr === 1 && owners.length > 1) warn.push("threshold 1 — any single owner controls the Safe"); if (owners.length === 1) warn.push("single-owner Safe — no multisig protection");
    return ok({ chain: ch, version: "1.4.1", predicted_safe: checksum(addr), already_deployed: !!exists, owners: owners.map(checksum), threshold: thr, salt_nonce: sn.toString(), factory: checksum(SPF), singleton: checksum(single), fallback_handler: checksum(FBH), initializer: init, ...pick(t), warnings: warn, note: "Same owners+threshold+salt_nonce yields the same Safe address on every chain with the canonical 1.4.1 deployment (L2 singleton off-mainnet). You can fund the predicted address before deploying." });
  } catch (e) { return err(e); }
}
