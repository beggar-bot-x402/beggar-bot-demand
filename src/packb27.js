// packb27 (builder B, 2026-11-02): createaddr, revokebuild, transferbuild, cometpos. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak } from "./evm.js";
import { txbuild } from "./packb24.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => Uint8Array.from(String(h).replace(/^0x/, "").match(/../g) || [], (x) => parseInt(x, 16));
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const be = (v) => { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
function rlp(x) { const L = (n, off) => { if (n < 56) return Uint8Array.of(off + n); const b = be(n); return cat(Uint8Array.of(off + 55 + b.length), b); }; if (Array.isArray(x)) { const body = cat(...x.map(rlp)); return cat(L(body.length, 0xc0), body); } if (x.length === 1 && x[0] < 0x80) return x; return cat(L(x.length, 0x80), x); }
const w = (x, i) => BigInt("0x" + (x || "0x").slice(2 + 64 * i, 66 + 64 * i) || "0");
function strDec(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
// ---- createaddr ----
export async function createaddr(q) {
  if (!isA(q.deployer)) return bad("deployer address required");
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const n = Math.min(Math.max(Number(q.count || 5), 1), 20);
  let start = q.nonce != null ? Number(q.nonce) : null, codeNow = null;
  try { const { results: r } = await rpcBatch(ch, [["eth_getTransactionCount", [q.deployer, "latest"]], ["eth_getCode", [q.deployer, "latest"]]]); codeNow = r[1]; if (start == null) start = r[0] ? Number(BigInt(r[0])) : 0; } catch (e) { if (start == null) return err(e); }
  if (!Number.isInteger(start) || start < 0) return bad("nonce must be a non-negative integer");
  const isC = codeNow && codeNow !== "0x" && !codeNow.startsWith("0xef0100");
  const addrs = []; for (let k = 0; k < n; k++) addrs.push({ nonce: start + k, address: checksum("0x" + hex(keccak(rlp([unhex(q.deployer), be(start + k)]))).slice(24)) });
  let deployed = []; try { const { results: r } = await rpcBatch(ch, addrs.map((a) => ["eth_getCode", [a.address, "latest"]])); deployed = r; } catch {}
  addrs.forEach((a, i) => { a.has_code = deployed[i] == null ? null : deployed[i] !== "0x"; });
  return ok({ chain: ch, deployer: checksum(q.deployer), deployer_kind: isC ? "contract (nonce = contracts created + 1)" : "EOA", next_nonce: start, next_address: addrs[0].address, addresses: addrs, note: "CREATE address = keccak(rlp([deployer, nonce]))[12:]. Use /v1/create2 for salted deployments." });
}
// ---- revokebuild ----
export async function revokebuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.owner) || !isA(q.token) || !isA(q.spender)) return bad("owner, token, spender addresses required");
  const kind = String(q.kind || "auto").toLowerCase();
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.token, data: "0xdd62ed3e" + pad(q.owner) + pad(q.spender) }, "latest"]], ["eth_call", [{ to: q.token, data: "0xe985e9c5" + pad(q.owner) + pad(q.spender) }, "latest"]], ["eth_call", [{ to: q.token, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x313ce567" }, "latest"]]]);
    const allowance = r[0] && r[0].length >= 66 ? w(r[0], 0) : null, forAll = r[1] && r[1].length === 66 ? w(r[1], 0) === 1n : null;
    const nft = kind === "nft" || (kind === "auto" && allowance == null && forAll != null) || (kind === "auto" && forAll === true && !allowance);
    const data = nft ? "0xa22cb465" + pad(q.spender) + pad("0") : "0x095ea7b3" + pad(q.spender) + pad("0");
    const active = nft ? forAll === true : allowance != null && allowance > 0n;
    const t = await txbuild({ chain: ch, from: q.owner, to: q.token, data });
    const dec = r[3] ? Number(BigInt(r[3])) : null;
    return ok({ chain: ch, token: checksum(q.token), symbol: strDec(r[2]), spender: checksum(q.spender), kind: nft ? "setApprovalForAll(spender,false)" : "approve(spender,0)", current: nft ? { approved_for_all: forAll } : { allowance: allowance?.toString() ?? null, allowance_human: allowance == null ? null : allowance >= (1n << 255n) ? "unlimited" : dec != null ? Number(allowance) / 10 ** dec : null }, revoke_needed: active, calldata: data, tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, max_cost_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null, note: active ? "Sign and send tx to revoke. Audit all approvals with /v1/approvals." : "Nothing to revoke — allowance already zero." });
  } catch (e) { return err(e); }
}
// ---- transferbuild ----
const SYM = { base: { USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42" }, ethereum: { USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }, arbitrum: { USDC: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" }, optimism: { USDC: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85" }, polygon: { USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" } };
export async function transferbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const token = isA(q.token) ? q.token : SYM[ch][String(q.token || "USDC").toUpperCase()]; if (!token) return bad("token: address or USDC/EURC/USDT");
  if (!isA(q.from) || !isA(q.to)) return bad("from and to addresses required");
  const a = String(q.amount ?? ""); if (!/^\d+(\.\d+)?$/.test(a)) return bad("amount (human units, e.g. 1.5) required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: token, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: token, data: "0xfe575a87" + pad(q.from) }, "latest"]], ["eth_call", [{ to: token, data: "0xfe575a87" + pad(q.to) }, "latest"]], ["eth_getCode", [q.to, "latest"]], ["eth_call", [{ to: token, data: "0x5c975abb" }, "latest"]]]);
    if (!r[0]) return bad("token has no decimals() — not an ERC-20 on " + ch);
    const dec = Number(BigInt(r[0])); const [i, f = ""] = a.split("."); if (f.length > dec) return bad(`amount has more than ${dec} decimals`);
    const units = BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0");
    if (units === 0n) return bad("amount must be > 0");
    const bal = r[2] ? w(r[2], 0) : null; const data = "0xa9059cbb" + pad(q.to) + pad(units.toString(16));
    const warn = []; if (bal != null && bal < units) warn.push("insufficient token balance"); if (r[3] && w(r[3], 0) === 1n) warn.push("sender is blacklisted by token"); if (r[4] && w(r[4], 0) === 1n) warn.push("recipient is blacklisted — transfer will revert"); if (r[6] && r[6].length === 66 && w(r[6], 0) === 1n) warn.push("token is paused"); if (r[5] && r[5] !== "0x" && !r[5].startsWith("0xef0100")) warn.push("recipient is a contract — confirm it can handle tokens"); if (q.to.toLowerCase() === token.toLowerCase()) warn.push("sending tokens to the token contract itself — likely lost");
    const t = await txbuild({ chain: ch, from: q.from, to: token, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, token: checksum(token), symbol: strDec(r[1]), decimals: dec, amount: a, amount_units: units.toString(), from: checksum(q.from), to: checksum(q.to), sender_balance: bal == null ? null : Number(bal) / 10 ** dec, calldata: data, tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, gas_eth_sufficient: t.body.sufficient_balance ?? null, build_error: t.body.error || null, safe_to_send: warn.length === 0 && !t.body.error, warnings: warn, note: "Gasless alternative for USDC: sign EIP-3009 via /v1/authpayload." });
  } catch (e) { return err(e); }
}
// ---- cometpos (Compound v3) ----
const COMETS = { base: { USDC: "0xb125E6687d4313864e53df431d5425969c15Eb2F", WETH: "0x46e6b214b524310239732D51387075E0e70970bf", USDBC: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf".replace("9c4ec768c28520B50860ea7a15bd7213a9fF58bf", "9c4ec768c28520B50860ea7a15bd7213a9fF58bf") }, ethereum: { USDC: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", WETH: "0xA17581A9E3356d9A858b789D68B4d866e593aE94", USDT: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840" }, arbitrum: { USDC: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", "USDC.E": "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA" }, optimism: { USDC: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB" }, polygon: { USDC: "0xF25212E676D1F7F89Cd72fFEe66158f541246445" } };
delete COMETS.base.USDBC;
export async function cometpos(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.user)) return bad("user address required");
  const markets = q.market ? (isA(q.market) ? { custom: q.market } : COMETS[ch][String(q.market).toUpperCase()] ? { [String(q.market).toUpperCase()]: COMETS[ch][String(q.market).toUpperCase()] } : null) : COMETS[ch];
  if (!markets) return bad("market: " + Object.keys(COMETS[ch]).join(",") + " or comet address");
  try {
    const ents = Object.entries(markets); const calls = [];
    for (const [, c] of ents) calls.push(["eth_call", [{ to: c, data: "0x70a08231" + pad(q.user) }, "latest"]], ["eth_call", [{ to: c, data: "0x374c49b4" + pad(q.user) }, "latest"]], ["eth_call", [{ to: c, data: "0xa46fe83b" }, "latest"]], ["eth_call", [{ to: c, data: "0x042e02cf" + pad(q.user) }, "latest"]], ["eth_call", [{ to: c, data: "0xc55dae63" }, "latest"]], ["eth_call", [{ to: c, data: "0xe7dad6bd" }, "latest"]], ["eth_call", [{ to: c, data: "0x44c1e5eb" }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    const out = [];
    for (let m = 0; m < ents.length; m++) {
      const [name, c] = ents[m]; const R = r.slice(7 * m, 7 * m + 7); if (!R[2]) { out.push({ market: name, comet: c, error: "not a Comet" }); continue; }
      const nA = Number(w(R[2], 0)), baseTok = "0x" + R[4].slice(26, 66), baseFeed = "0x" + R[5].slice(26, 66), baseScale = R[6] ? w(R[6], 0) : 10n ** 6n;
      const c2 = []; for (let i = 0; i < nA; i++) c2.push(["eth_call", [{ to: c, data: "0xc8c7fe6b" + pad(i.toString(16)) }, "latest"]]); c2.push(["eth_call", [{ to: c, data: "0x41976e09" + pad(baseFeed) }, "latest"]], ["eth_call", [{ to: baseTok, data: "0x95d89b41" }, "latest"]]);
      const { results: ai } = await rpcBatch(ch, c2);
      const infos = ai.slice(0, nA).map((x) => (x ? { asset: "0x" + x.slice(2 + 64 + 24, 2 + 128), feed: "0x" + x.slice(2 + 128 + 24, 2 + 192), scale: w(x, 3), bcf: Number(w(x, 4)) / 1e18, lcf: Number(w(x, 5)) / 1e18 } : null)).filter(Boolean);
      const c3 = []; for (const a of infos) c3.push(["eth_call", [{ to: c, data: "0x2b92a07d" + pad(q.user) + pad(a.asset) }, "latest"]], ["eth_call", [{ to: c, data: "0x41976e09" + pad(a.feed) }, "latest"]], ["eth_call", [{ to: a.asset, data: "0x95d89b41" }, "latest"]]);
      const { results: cr } = await rpcBatch(ch, c3);
      const basePx = ai[nA] ? Number(w(ai[nA], 0)) / 1e8 : null; const sup = Number(w(R[0], 0)) / Number(baseScale), bor = Number(w(R[1], 0)) / Number(baseScale);
      let borrowCap = 0, liqCap = 0; const coll = [];
      infos.forEach((a, i) => { const bal = cr[3 * i] ? w(cr[3 * i], 0) : 0n; if (bal === 0n) return; const amt = Number(bal) / Number(a.scale), px = cr[3 * i + 1] ? Number(w(cr[3 * i + 1], 0)) / 1e8 : 0, usd = amt * px; borrowCap += usd * a.bcf; liqCap += usd * a.lcf; coll.push({ symbol: strDec(cr[3 * i + 2]), asset: checksum(a.asset), amount: amt, price_usd: px, value_usd: usd, borrow_cf: a.bcf, liquidate_cf: a.lcf }); });
      const debtUsd = bor * (basePx || 0);
      out.push({ market: name, comet: checksum(c), base: strDec(ai[nA + 1]), base_price_usd: basePx, supplied: sup, borrowed: bor, debt_usd: debtUsd, collateral: coll, collateral_usd: coll.reduce((s, x) => s + x.value_usd, 0), borrow_capacity_usd: borrowCap, liquidation_threshold_usd: liqCap, health_factor: debtUsd > 0 ? liqCap / debtUsd : null, utilization_of_capacity: borrowCap > 0 ? debtUsd / borrowCap : null, is_liquidatable: R[3] ? w(R[3], 0) === 1n : null, has_position: sup > 0 || bor > 0 || coll.length > 0 });
    }
    return ok({ chain: ch, user: checksum(q.user), positions: out.filter((x) => q.market || x.has_position || x.error), markets_checked: ents.length, note: "Compound v3 (Comet) on-chain reads. Rates via /v1/compound." });
  } catch (e) { return err(e); }
}
