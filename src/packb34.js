// packb34 (builder B, 2026-11-02): create2deploy, ethairdrop, lpcollect, permitsubmit. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex, keccak } from "./evm.js";
import { recoverAddress } from "./sig.js";
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
const encBytes = (h) => { h = String(h).replace(/^0x/, ""); return pad((h.length / 2).toString(16)) + h.padEnd(Math.ceil(h.length / 64) * 64, "0"); };
const encBytesArr = (arr) => { let head = "", tail = "", off = arr.length * 32; for (const a of arr) { head += pad(off.toString(16)); const e = encBytes(a); tail += e; off += e.length / 2; } return pad(arr.length.toString(16)) + head + tail; };
const NOW = () => Math.floor(Date.now() / 1000);
// ---- create2deploy: deploy via Arachnid deterministic deployer ----
const DDP = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
export async function create2deploy(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  let init; try { init = unhex(q.initcode || q.bytecode || ""); } catch { return bad("initcode must be hex"); } if (!init.length) return bad("initcode (creation bytecode + abi-encoded constructor args) required");
  if (init.length > 49152) return bad("initcode exceeds 48KB EIP-3860 limit");
  let salt = String(q.salt ?? "0"); if (/^\d+$/.test(salt)) salt = BigInt(salt).toString(16); salt = salt.replace(/^0x/, ""); if (!/^[0-9a-fA-F]{0,64}$/.test(salt)) return bad("salt: uint or 32-byte hex"); salt = salt.padStart(64, "0");
  const ih = kh(init); const addr = "0x" + kh(cat(Uint8Array.of(0xff), unhex(DDP), unhex(salt), unhex(ih))).slice(26);
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getCode", [DDP, "latest"]], ["eth_getCode", [addr, "latest"]]]);
    const hasDep = r[0] && r[0] !== "0x", exists = r[1] && r[1] !== "0x";
    if (!hasDep) return ok({ chain: ch, predicted_address: checksum(addr), error: "deterministic deployer 0x4e59…956C not present on this chain" });
    const data = "0x" + salt + hex(init);
    const t = exists ? { body: { error: "already deployed at predicted address — nothing to do" } } : await txbuild({ chain: ch, from: q.from, to: DDP, data, value: String(q.value || "0"), ...(q.nonce != null ? { nonce: q.nonce } : {}), ...(q.gas != null ? { gas: q.gas } : {}) });
    return ok({ chain: ch, deployer: checksum(DDP), salt: "0x" + salt, init_code_hash: ih, predicted_address: checksum(addr), already_deployed: !!exists, initcode_bytes: init.length, calldata_bytes: init.length + 32, ...pick(t), note: "Same salt + initcode gives the same address on every chain that has the deployer. Constructor msg.sender is the deployer, not you — don't rely on it for Ownable." });
  } catch (e) { return err(e); }
}
// ---- ethairdrop: many native payouts in ONE tx via Multicall3.aggregate3Value ----
const MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
export async function ethairdrop(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  const items = String(q.payouts || "").split(/[\s,;]+/).filter(Boolean).map((x) => x.split(/[:=]/));
  if (!items.length || items.length > 100) return bad("payouts: 1-100 entries address:amount_eth, comma-separated");
  const rows = []; for (const [a, v] of items) { const u = toUnits(v, 18); if (!isA(a) || u == null || u === 0n) return bad("bad payout entry " + a + ":" + v); rows.push([a, u]); }
  const allow = String(q.allow_failure || "false") === "true";
  let head = "", tail = "", off = rows.length * 32;
  for (const [a, u] of rows) { head += pad(off.toString(16)); const t = pad(a) + pad(allow ? "1" : "0") + pad(u.toString(16)) + pad("80") + pad("0"); tail += t; off += t.length / 2; }
  const data = "0x174dea71" + pad("20") + pad(rows.length.toString(16)) + head + tail;
  const total = rows.reduce((s, r) => s + r[1], 0n);
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getCode", [MC3, "latest"]], ["eth_getBalance", [q.from, "latest"]], ...rows.map(([a]) => ["eth_getCode", [a, "latest"]])]);
    if (!r[0] || r[0] === "0x") return bad("Multicall3 not deployed on this chain");
    const bal = r[1] ? BigInt(r[1]) : null; const contracts = rows.filter((_, i) => r[2 + i] && r[2 + i] !== "0x").map(([a]) => checksum(a));
    const warn = []; if (bal != null && bal < total) warn.push("insufficient native balance for total"); if (contracts.length) warn.push("some recipients are contracts — they may reject ETH" + (allow ? " (allow_failure=true: their value stays in Multicall3, recoverable by anyone!)" : " (whole tx reverts)"));
    if (allow) warn.push("allow_failure=true leaves failed payouts' ETH stuck in Multicall3 where anyone can take it — prefer false");
    const t = await txbuild({ chain: ch, from: q.from, to: MC3, data, value: total.toString(), ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, from: checksum(q.from), multicall3: checksum(MC3), payout_count: rows.length, total_eth: fmt(total, 18), total_wei: total.toString(), balance_eth: bal == null ? null : fmt(bal, 18), contract_recipients: contracts, payouts: rows.map(([a, u]) => ({ to: checksum(a), amount_eth: fmt(u, 18) })), calldata_bytes: (data.length - 2) / 2, ...pick(t), warnings: warn, note: "One signature, one nonce; ~9k gas per recipient on top of base." });
  } catch (e) { return err(e); }
}
// ---- lpcollect: Uniswap v3 position collect fees / full exit ----
const NPM = { ethereum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", arbitrum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", optimism: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", polygon: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", base: "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" };
const MAX128 = (1n << 128n) - 1n;
export async function lpcollect(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); const npm = NPM[ch]; if (!npm) return bad("chains: " + Object.keys(NPM).join(", "));
  if (!/^\d+$/.test(String(q.token_id ?? ""))) return bad("token_id (Uniswap v3 position NFT id) required");
  const act = String(q.action || "collect").toLowerCase(); if (!["collect", "exit"].includes(act)) return bad("action: collect|exit");
  const id = BigInt(q.token_id);
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: npm, data: "0x99fbab88" + pad(id.toString(16)) }, "latest"]], ["eth_call", [{ to: npm, data: "0x6352211e" + pad(id.toString(16)) }, "latest"]]]);
    if (!r[0] || r[0].length < 2 + 64 * 12) return bad("position not found (burned or wrong chain)");
    const owner = "0x" + r[1].slice(26, 66), from = isA(q.from) ? q.from : owner, rec = isA(q.recipient) ? q.recipient : from;
    const t0 = "0x" + r[0].slice(2 + 64 * 2 + 24, 2 + 64 * 3), t1 = "0x" + r[0].slice(2 + 64 * 3 + 24, 2 + 64 * 4), fee = Number(w(r[0], 4)), liq = w(r[0], 7);
    const coll = "0xfc6f7865" + pad(id.toString(16)) + pad(rec) + pad(MAX128.toString(16)) + pad(MAX128.toString(16));
    let data = coll;
    if (act === "exit") { if (liq === 0n) return bad("position has zero liquidity — use action=collect"); const dl = BigInt(NOW() + Number(q.deadline_s ?? 1200)); const dec = "0x0c49ccbe" + pad(id.toString(16)) + pad(liq.toString(16)) + pad("0") + pad("0") + pad(dl.toString(16)); data = "0xac9650d8" + pad("20") + encBytesArr([dec, coll]); }
    const calls = [["eth_call", [{ from: owner, to: npm, data: coll }, "latest"]], ["eth_call", [{ to: t0, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t0, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t1, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t1, data: "0x313ce567" }, "latest"]]];
    if (act === "exit") calls.push(["eth_call", [{ from: owner, to: npm, data }, "latest"]]);
    const { results: s } = await rpcBatch(ch, calls);
    const sym = (x) => { try { const h = x.slice(2); const n = Number(BigInt("0x" + h.slice(64, 128))); return new TextDecoder().decode(unhex(h.slice(128, 128 + n * 2))); } catch { return null; } };
    const d0 = s[2] ? Number(w(s[2], 0)) : 18, d1 = s[4] ? Number(w(s[4], 0)) : 18;
    const f0 = s[0] ? w(s[0], 0) : null, f1 = s[0] ? w(s[0], 1) : null;
    let out = null; if (act === "exit" && s[5]) { const h = s[5].slice(2); const o2 = Number(BigInt("0x" + h.slice(64 * 2 + 64 * 0, 64 * 3))) * 2; /* results[1] offset */ try { const off1 = Number(BigInt("0x" + h.slice(128, 192))) * 2 + 128; out = { amount0: fmt(BigInt("0x" + h.slice(off1 + 64, off1 + 128)), d0), amount1: fmt(BigInt("0x" + h.slice(off1 + 128, off1 + 192)), d1) }; } catch {} }
    const warn = []; if (from.toLowerCase() !== owner.toLowerCase()) warn.push("from is not the position owner/approved — tx will revert unless approved");
    const t = await txbuild({ chain: ch, from, to: npm, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, position_manager: checksum(npm), token_id: id.toString(), owner: checksum(owner), token0: { address: checksum(t0), symbol: sym(s[1] || "0x"), decimals: d0 }, token1: { address: checksum(t1), symbol: sym(s[3] || "0x"), decimals: d1 }, fee_tier: fee, liquidity: liq.toString(), action: act, uncollected_fees: f0 == null ? null : { amount0: fmt(f0, d0), amount1: fmt(f1, d1) }, exit_expected_out: out, recipient: checksum(rec), calldata: data, ...pick(t), warnings: warn, note: act === "exit" ? "exit = decreaseLiquidity(all, min 0) + collect in one multicall; set slippage mins yourself if MEV matters. NFT is left empty (burn separately)." : "collect pulls all accrued fees (and any tokens owed from prior decreases)." });
  } catch (e) { return err(e); }
}
// ---- permitsubmit: verify an EIP-2612 permit signature and build permit() tx ----
const PT = kh(new TextEncoder().encode("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"));
export async function permitsubmit(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  for (const k of ["token", "owner", "spender"]) if (!isA(q[k])) return bad(k + " address required");
  if (!/^\d+$/.test(String(q.value ?? ""))) return bad("value (raw uint) required"); if (!/^\d+$/.test(String(q.deadline ?? ""))) return bad("deadline (unix seconds) required");
  const sg = String(q.signature || "").replace(/^0x/, ""); if (!/^[0-9a-fA-F]{130}$/.test(sg)) return bad("signature: 65-byte hex r||s||v");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.token, data: "0x3644e515" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x7ecebe00" + pad(q.owner) }, "latest"]], ["eth_call", [{ to: q.token, data: "0xdd62ed3e" + pad(q.owner) + pad(q.spender) }, "latest"]]]);
    if (!r[0] || r[0].length < 66 || !r[1]) return bad("token has no DOMAIN_SEPARATOR()/nonces() — not EIP-2612");
    const ds = r[0].slice(0, 66), nonce = q.nonce != null ? BigInt(q.nonce) : w(r[1], 0);
    const sh = kh(unhex(PT.slice(2) + pad(q.owner) + pad(q.spender) + pad(BigInt(q.value).toString(16)) + pad(nonce.toString(16)) + pad(BigInt(q.deadline).toString(16))));
    const dg = kh(unhex("1901" + ds.slice(2) + sh.slice(2)));
    let signer = null; try { signer = recoverAddress(unhex(dg), "0x" + sg).address; } catch {}
    let v = parseInt(sg.slice(128), 16); if (v < 27) v += 27;
    const valid = !!signer && signer.toLowerCase() === q.owner.toLowerCase(); const warn = [];
    if (!valid) warn.push("signature does not recover to owner for current nonce/domain — permit will revert"); if (Number(q.deadline) < NOW()) warn.push("deadline has passed");
    const data = "0xd505accf" + pad(q.owner) + pad(q.spender) + pad(BigInt(q.value).toString(16)) + pad(BigInt(q.deadline).toString(16)) + pad(v.toString(16)) + sg.slice(0, 64) + sg.slice(64, 128);
    const from = isA(q.from) ? q.from : q.spender;
    const t = await txbuild({ chain: ch, from, to: q.token, data, value: "0", ...(q.tx_nonce != null ? { nonce: q.tx_nonce } : {}) });
    return ok({ chain: ch, token: checksum(q.token), domain_separator: ds, permit_nonce: nonce.toString(), digest: dg, recovered_signer: signer, signature_valid: valid, current_allowance: r[2] ? w(r[2], 0).toString() : null, calldata: data, submitter: checksum(from), ...pick(t), warnings: warn, note: "Anyone can submit a permit; gas is paid by the submitter (default spender)." });
  } catch (e) { return err(e); }
}
