// packb29 (builder B, 2026-11-02): approvebuild, nftsendbuild, ethsendbuild, cometbuild. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
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
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const kindOf = (code) => code == null ? null : code === "0x" ? "EOA" : code.startsWith("0xef0100") ? "EIP-7702 delegated EOA" : "contract";
const tb = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
// ---- approvebuild ----
export async function approvebuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const token = isA(q.token) ? q.token : String(q.token || "USDC").toUpperCase() === "USDC" ? USDC[ch] : null; if (!token) return bad("token: address or USDC");
  if (!isA(q.owner) || !isA(q.spender)) return bad("owner and spender addresses required");
  const inf = String(q.amount).toLowerCase() === "unlimited";
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0xdd62ed3e" + pad(q.owner) + pad(q.spender) }, "latest"]], ["eth_getCode", [q.spender, "latest"]], ["eth_call", [{ to: token, data: "0x70a08231" + pad(q.owner) }, "latest"]]]);
    if (!r[0]) return bad("token has no decimals() on " + ch);
    const dec = Number(BigInt(r[0])); const units = inf ? (1n << 256n) - 1n : toUnits(q.amount, dec); if (units == null) return bad(`amount: human units (<= ${dec} decimals) or unlimited`);
    const cur = r[1] ? w(r[1], 0) : null; const sk = kindOf(r[2]); const warn = [];
    if (inf) warn.push("unlimited approval — spender can move the full balance at any time");
    if (sk === "EOA") warn.push("spender is an EOA, not a contract — common in approval phishing");
    if (cur != null && cur !== 0n && units !== 0n && cur !== units) warn.push("non-zero existing allowance; some tokens (USDT) require setting 0 first");
    const data = "0x095ea7b3" + pad(q.spender) + pad(units.toString(16));
    const t = await txbuild({ chain: ch, from: q.owner, to: token, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, token: checksum(token), decimals: dec, owner: checksum(q.owner), spender: checksum(q.spender), spender_kind: sk, current_allowance: cur == null ? null : cur.toString(), new_allowance: units.toString(), owner_balance: r[3] ? Number(w(r[3], 0)) / 10 ** dec : null, calldata: data, ...tb(t), warnings: warn, note: "For gasless approvals see /v1/permitdata (EIP-2612) or /v1/permit2data." });
  } catch (e) { return err(e); }
}
// ---- nftsendbuild ----
export async function nftsendbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.contract) || !isA(q.from) || !isA(q.to)) return bad("contract, from, to addresses required");
  if (!/^\d+$/.test(String(q.token_id ?? ""))) return bad("token_id (decimal) required");
  const id = pad(BigInt(q.token_id).toString(16));
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.contract, data: "0x01ffc9a7" + "80ac58cd".padEnd(64, "0") }, "latest"]], ["eth_call", [{ to: q.contract, data: "0x01ffc9a7" + "d9b67a26".padEnd(64, "0") }, "latest"]], ["eth_call", [{ to: q.contract, data: "0x6352211e" + id }, "latest"]], ["eth_call", [{ to: q.contract, data: "0x00fdd58e" + pad(q.from) + id }, "latest"]], ["eth_getCode", [q.to, "latest"]]]);
    const is721 = r[0] && w(r[0], 0) === 1n, is1155 = r[1] && w(r[1], 0) === 1n;
    const std = q.standard ? String(q.standard).toLowerCase().replace(/^erc-?/, "") : is721 ? "721" : is1155 ? "1155" : null;
    if (!["721", "1155"].includes(std)) return bad("contract does not report ERC-721 or ERC-1155 via ERC-165; pass standard=721|1155 to force");
    const warn = []; let owner = null, bal = null; const amt = BigInt(q.amount || 1);
    if (std === "721") { owner = r[2] && r[2].length >= 66 ? checksum("0x" + r[2].slice(26, 66)) : null; if (!owner) warn.push("ownerOf reverted — token may not exist"); else if (owner.toLowerCase() !== q.from.toLowerCase()) warn.push(`from is not the owner (owner ${owner}) — needs operator approval or will revert`); }
    else { bal = r[3] ? w(r[3], 0) : null; if (bal != null && bal < amt) warn.push("insufficient ERC-1155 balance"); }
    const tk = kindOf(r[4]); if (tk === "contract") warn.push("recipient is a contract — safeTransfer requires it to implement onERC721Received/onERC1155Received");
    const data = std === "721" ? "0x42842e0e" + pad(q.from) + pad(q.to) + id : "0xf242432a" + pad(q.from) + pad(q.to) + id + pad(amt.toString(16)) + pad("a0") + pad("0");
    const t = await txbuild({ chain: ch, from: q.from, to: q.contract, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    if (t.body.error) warn.push("gas estimate failed — transfer would likely revert");
    return ok({ chain: ch, contract: checksum(q.contract), standard: "ERC-" + std, token_id: String(q.token_id), amount: std === "1155" ? amt.toString() : "1", from: checksum(q.from), to: checksum(q.to), recipient_kind: tk, current_owner: owner, from_balance: bal == null ? null : bal.toString(), calldata: data, ...tb(t), safe_to_send: !warn.length, warnings: warn });
  } catch (e) { return err(e); }
}
// ---- ethsendbuild ----
export async function ethsendbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from) || !isA(q.to)) return bad("from and to addresses required");
  const max = String(q.amount).toLowerCase() === "max"; const units = max ? null : toUnits(q.amount, 18); if (!max && (units == null || units === 0n)) return bad("amount (ETH, > 0) or max required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getBalance", [q.from, "latest"]], ["eth_getCode", [q.to, "latest"]], ["eth_getTransactionCount", [q.to, "latest"]], ["eth_getCode", [q.from, "latest"]]]);
    const bal = r[0] ? BigInt(r[0]) : 0n; const tk = kindOf(r[1]); const warn = [];
    let value = units;
    if (max) { const probe = await txbuild({ chain: ch, from: q.from, to: q.to, value: "0" }); const c = probe.body.max_cost_eth != null ? BigInt(Math.ceil(Number(probe.body.max_cost_eth) * 1e18)) : null; if (c == null) return bad("could not estimate gas for max send"); value = bal - c - c / 10n; if (value <= 0n) return bad("balance does not cover gas"); }
    if (bal < value) warn.push("insufficient balance");
    if (tk === "contract") warn.push("recipient is a contract — ensure it accepts ETH (receive/fallback)");
    if (tk === "EOA" && r[2] === "0x0") warn.push("recipient has never sent a tx (fresh address) — double-check it");
    if (q.to.toLowerCase() === q.from.toLowerCase()) warn.push("sending to self");
    const t = await txbuild({ chain: ch, from: q.from, to: q.to, value: value.toString(), ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    if (t.body.error) warn.push("gas estimate failed — recipient may reject ETH");
    return ok({ chain: ch, from: checksum(q.from), from_kind: kindOf(r[3]), to: checksum(q.to), recipient_kind: tk, amount_eth: Number(value) / 1e18, amount_wei: value.toString(), balance_eth: Number(bal) / 1e18, ...tb(t), safe_to_send: !warn.length, warnings: warn, note: max ? "max = balance minus 110% of max gas cost" : undefined });
  } catch (e) { return err(e); }
}
// ---- cometbuild (Compound v3) ----
const COMETS = { base: { USDC: "0xb125E6687d4313864e53df431d5425969c15Eb2F", WETH: "0x46e6b214b524310239732D51387075E0e70970bf" }, ethereum: { USDC: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", WETH: "0xA17581A9E3356d9A858b789D68B4d866e593aE94", USDT: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840" }, arbitrum: { USDC: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" }, optimism: { USDC: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB" }, polygon: { USDC: "0xF25212E676D1F7F89Cd72fFEe66158f541246445" } };
export async function cometbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required");
  const comet = isA(q.market) ? q.market : COMETS[ch][String(q.market || "USDC").toUpperCase()]; if (!comet) return bad("market: " + Object.keys(COMETS[ch]).join("|") + " or comet address");
  const action = String(q.action || "supply").toLowerCase(); if (!["supply", "withdraw"].includes(action)) return bad("action: supply|withdraw (withdraw of base beyond supply = borrow)");
  try {
    const { results: b } = await rpcBatch(ch, [["eth_call", [{ to: comet, data: sel("baseToken()") }, "latest"]]]);
    if (!b[0] || b[0].length < 66) return bad("not a Comet market");
    const base = "0x" + b[0].slice(26, 66); const asset = isA(q.asset) ? q.asset : base;
    const max = String(q.amount).toLowerCase() === "max";
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: asset, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: asset, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: asset, data: "0xdd62ed3e" + pad(q.from) + pad(comet) }, "latest"]], ["eth_call", [{ to: comet, data: sel("balanceOf(address)") + pad(q.from) }, "latest"]], ["eth_call", [{ to: comet, data: sel("borrowBalanceOf(address)") + pad(q.from) }, "latest"]], ["eth_call", [{ to: comet, data: sel("isSupplyPaused()") }, "latest"]], ["eth_call", [{ to: comet, data: sel("isWithdrawPaused()") }, "latest"]], ["eth_call", [{ to: comet, data: sel("userCollateral(address,address)") + pad(q.from) + pad(asset) }, "latest"]]]);
    if (!r[0]) return bad("asset has no decimals()");
    const dec = Number(BigInt(r[0])); const units = max ? (1n << 256n) - 1n : toUnits(q.amount, dec); if (units == null || units === 0n) return bad(`amount (<= ${dec} decimals) or max required`);
    const isBase = asset.toLowerCase() === base.toLowerCase(); const warn = []; let approval = null;
    const bal = r[1] ? w(r[1], 0) : null, alw = r[2] ? w(r[2], 0) : null;
    if (action === "supply") { if (r[5] && w(r[5], 0) === 1n) warn.push("supply paused"); if (!max && bal != null && bal < units) warn.push("insufficient wallet balance"); const need = max ? bal ?? 0n : units; if (alw != null && alw < need) { approval = { to: checksum(asset), data: "0x095ea7b3" + pad(comet) + pad(need.toString(16)) }; warn.push("allowance to Comet insufficient — send approval_tx first"); } }
    else { if (r[6] && w(r[6], 0) === 1n) warn.push("withdraw paused"); if (isBase && r[3] && !max && w(r[3], 0) < units) warn.push("amount exceeds supplied base — the excess will be BORROWED"); }
    const data = (action === "supply" ? sel("supply(address,uint256)") : sel("withdraw(address,uint256)")) + pad(asset) + pad(units.toString(16));
    const t = approval ? { body: {} } : await txbuild({ chain: ch, from: q.from, to: comet, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, comet: checksum(comet), base_token: checksum(base), asset: checksum(asset), asset_is_base: isBase, action, amount: max ? "max" : String(q.amount), amount_units: units.toString(), decimals: dec, wallet_balance: bal == null ? null : Number(bal) / 10 ** dec, supplied_base: r[3] ? w(r[3], 0).toString() : null, borrowed_base: r[4] ? w(r[4], 0).toString() : null, collateral_balance: !isBase && r[7] ? w(r[7], 0).toString() : null, approval_tx: approval, calldata: data, ...tb(t), safe_to_send: !warn.length && !t.body.error, warnings: warn, note: "Check position health with /v1/cometpos." });
  } catch (e) { return err(e); }
}
