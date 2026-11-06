// packb31 (builder B, 2026-11-02): aeroswap, cometrewards, authhash, canceltx. $0 upstream (keyless public RPCs).
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
import { recoverAddress } from "./sig.js";
import { keccak } from "./evm.js";
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" };
const tb = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const strDec = (h) => { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } };
function rlp(x) { const L = (n, off) => { if (n < 56) return Uint8Array.of(off + n); const b = be(n); return cat(Uint8Array.of(off + 55 + b.length), b); }; if (Array.isArray(x)) { const b = cat(...x.map(rlp)); return cat(L(b.length, 0xc0), b); } if (x.length === 1 && x[0] < 0x80) return x; return cat(L(x.length, 0x80), x); }
// ---- aeroswap (Aerodrome v2 Router, Base) ----
const AR = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", AF = "0x420DD381b31aEf6683db6B902084cB0FFECe40Da";
const aTok = (t) => isA(t) ? t : ({ USDC: USDC.base, WETH: WETH.base, ETH: WETH.base, AERO: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", EURC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42", CBBTC: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf", USDBC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA" })[String(t || "").toUpperCase()] || null;
const routesEnc = (rs) => pad(rs.length.toString(16)) + rs.map((r) => pad(r[0]) + pad(r[1]) + pad(r[2] ? "1" : "0") + pad(AF)).join("");
export async function aeroswap(q) {
  if (!isA(q.from)) return bad("from address required");
  const tin = aTok(q.token_in), tout = aTok(q.token_out); if (!tin || !tout) return bad("token_in/token_out: address or USDC|WETH|AERO|EURC|CBBTC|USDBC"); if (tin.toLowerCase() === tout.toLowerCase()) return bad("token_in == token_out");
  const slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 1000);
  try {
    const { results: d } = await rpcBatch("base", [["eth_call", [{ to: tin, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: tout, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: tin, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: tin, data: "0xdd62ed3e" + pad(q.from) + pad(AR) }, "latest"]], ["eth_call", [{ to: tin, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: tout, data: "0x95d89b41" }, "latest"]], ["eth_getBlockByNumber", ["latest", false]]]);
    if (!d[0] || !d[1]) return bad("token has no decimals() on base");
    const di = Number(BigInt(d[0])), dout = Number(BigInt(d[1])); const amt = toUnits(q.amount, di); if (amt == null || amt === 0n) return bad(`amount (<= ${di} decimals, > 0) required`);
    const gs = sel("getAmountsOut(uint256,(address,address,bool,address)[])");
    const cands = [[[tin, tout, false]], [[tin, tout, true]]]; const W = WETH.base, U = USDC.base;
    for (const mid of [W, U]) if (mid.toLowerCase() !== tin.toLowerCase() && mid.toLowerCase() !== tout.toLowerCase()) cands.push([[tin, mid, false], [mid, tout, false]]);
    const { results: r } = await rpcBatch("base", cands.map((rs) => ["eth_call", [{ to: AR, data: gs + pad(amt.toString(16)) + pad("40") + routesEnc(rs) }, "latest"]]));
    const quotes = cands.map((rs, i) => { const x = r[i]; if (!x || x.length < 2 + 64 * 3) return null; const n = Number(w(x, 1)); const out = w(x, 1 + n); return out > 0n ? { routes: rs, out } : null; }).filter(Boolean);
    if (!quotes.length) return bad("no Aerodrome route with liquidity");
    quotes.sort((a, b) => (b.out > a.out ? 1 : -1)); const best = quotes[0];
    const minOut = best.out * BigInt(10000 - slip) / 10000n; const rcpt = isA(q.recipient) ? q.recipient : q.from;
    const now = d[6] ? Number(BigInt(d[6].timestamp)) : Math.floor(Date.now() / 1000); const deadline = now + Math.min(Math.max(Number(q.deadline_s ?? 1200), 60), 86400);
    const data = sel("swapExactTokensForTokens(uint256,uint256,(address,address,bool,address)[],address,uint256)") + pad(amt.toString(16)) + pad(minOut.toString(16)) + pad("a0") + pad(rcpt) + pad(deadline.toString(16)) + routesEnc(best.routes);
    const bal = d[2] ? w(d[2], 0) : null, alw = d[3] ? w(d[3], 0) : null; const warn = []; let approval = null;
    if (bal != null && bal < amt) warn.push("insufficient token_in balance");
    if (alw != null && alw < amt) { approval = { to: checksum(tin), data: "0x095ea7b3" + pad(AR) + pad(amt.toString(16)) }; warn.push("router allowance insufficient — send approval_tx first"); }
    const t = approval || warn.length ? { body: {} } : await txbuild({ chain: "base", from: q.from, to: AR, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    const f = (v, dc) => Number(v) / 10 ** dc; const lbl = (rs) => rs.map((x) => `${checksum(x[0]).slice(0, 8)}→${checksum(x[1]).slice(0, 8)} ${x[2] ? "stable" : "volatile"}`).join(" | ");
    return ok({ chain: "base", router: AR, token_in: { address: checksum(tin), symbol: strDec(d[4]), decimals: di }, token_out: { address: checksum(tout), symbol: strDec(d[5]), decimals: dout }, amount_in: String(q.amount), expected_out: f(best.out, dout), min_out: f(minOut, dout), slippage_bps: slip, best_route: best.routes.map((x) => ({ from: checksum(x[0]), to: checksum(x[1]), stable: x[2], factory: AF })), quotes: quotes.map((x) => ({ route: lbl(x.routes), out: f(x.out, dout) })), deadline, recipient: checksum(rcpt), approval_tx: approval, calldata: data, ...tb(t), safe_to_send: !warn.length && !t.body.error, warnings: warn, note: "Aerodrome v2 (basic pools) only; compare with /v1/swapbuild (Uniswap v3)." });
  } catch (e) { return err(e); }
}
// ---- cometrewards ----
const CR = { base: "0x123964802e6ABabBE1Bc9547D72Ef1B69B00A6b1", ethereum: "0x1B0e765F6224C21223AeA2af16c1C46E38885a40", arbitrum: "0x88730d254A2f7e6AC8388c3198aFd694bA9f7fae", optimism: "0x443EA0340cb75a160F31A440722dec7b5bc3C2E9", polygon: "0x45939657d1CA34A8FA39A924B71D28Fe8431e581" };
const COMETS = { base: { USDC: "0xb125E6687d4313864e53df431d5425969c15Eb2F", WETH: "0x46e6b214b524310239732D51387075E0e70970bf" }, ethereum: { USDC: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", WETH: "0xA17581A9E3356d9A858b789D68B4d866e593aE94", USDT: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840" }, arbitrum: { USDC: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" }, optimism: { USDC: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB" }, polygon: { USDC: "0xF25212E676D1F7F89Cd72fFEe66158f541246445" } };
export async function cometrewards(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.user)) return bad("user address required");
  const markets = isA(q.market) ? { custom: q.market } : q.market ? { [String(q.market).toUpperCase()]: COMETS[ch][String(q.market).toUpperCase()] } : COMETS[ch]; if (Object.values(markets).some((x) => !x)) return bad("market: " + Object.keys(COMETS[ch]).join("|") + " or comet address");
  try {
    const ents = Object.entries(markets); const go = sel("getRewardOwed(address,address)");
    const { results: r } = await rpcBatch(ch, ents.map(([, c]) => ["eth_call", [{ from: q.user, to: CR[ch], data: go + pad(c) + pad(q.user) }, "latest"]]));
    const toks = [...new Set(r.filter((x) => x && x.length >= 130).map((x) => "0x" + x.slice(26, 66)))];
    const { results: m } = toks.length ? await rpcBatch(ch, toks.flatMap((t) => [["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]]])) : { results: [] };
    const meta = Object.fromEntries(toks.map((t, i) => [t, { symbol: strDec(m[2 * i] || "0x"), decimals: m[2 * i + 1] ? Number(BigInt(m[2 * i + 1])) : 18 }]));
    const out = []; for (const [i, [name, c]] of ents.entries()) { const x = r[i]; if (!x || x.length < 130) { out.push({ market: name, comet: checksum(c), error: "getRewardOwed reverted (no reward config?)" }); continue; } const t = "0x" + x.slice(26, 66), owed = w(x, 1); const mm = meta[t];
      const data = sel("claim(address,address,bool)") + pad(c) + pad(q.user) + pad("1");
      out.push({ market: name, comet: checksum(c), reward_token: checksum(t), symbol: mm.symbol, owed: Number(owed) / 10 ** mm.decimals, owed_units: owed.toString(), claim_tx: owed > 0n ? { to: checksum(CR[ch]), data } : null }); }
    const total = out.reduce((s, x) => s + (x.owed || 0), 0);
    let built = null; const first = out.find((x) => x.claim_tx); if (first && q.build !== "false") { const t = await txbuild({ chain: ch, from: q.user, to: CR[ch], data: first.claim_tx.data }); built = { market: first.market, ...tb(t) }; }
    return ok({ chain: ch, rewards_contract: checksum(CR[ch]), user: checksum(q.user), markets: out, total_owed: total, claimable: !!first, built_claim: built, note: "Owed includes accrual to the latest block (getRewardOwed simulated via eth_call). Anyone may call claim for the user; rewards go to the user." });
  } catch (e) { return err(e); }
}
// ---- authhash (EIP-7702 authorization) ----
export async function authhash(q) {
  if (!isA(q.address)) return bad("address (delegate contract) required");
  const cidRaw = q.chain_id ?? q.chain ?? "8453"; const names = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137 };
  const cid = /^\d+$/.test(String(cidRaw)) ? BigInt(cidRaw) : names[ck(cidRaw)] != null ? BigInt(names[ck(cidRaw)]) : null; if (cid == null) return bad("chain_id: integer (0 = any chain) or chain name");
  let nonce = q.nonce != null ? BigInt(q.nonce) : null, cur = null, ch = null;
  if (isA(q.authority)) { ch = Object.entries(names).find(([, v]) => BigInt(v) === cid)?.[0] || null; if (ch) { try { const { results: r } = await rpcBatch(ch, [["eth_getTransactionCount", [q.authority, "latest"]], ["eth_getCode", [q.authority, "latest"]]]); if (nonce == null && r[0]) nonce = BigInt(r[0]) + (q.self_sponsored === "true" ? 1n : 0n); cur = r[1] == null ? null : r[1].startsWith("0xef0100") ? checksum("0x" + r[1].slice(8, 48)) : r[1] === "0x" ? "none" : "not an EOA (has code)"; } catch {} } }
  if (nonce == null) return bad("nonce required (or pass authority + a known chain to fetch it)");
  const payload = cat(Uint8Array.of(5), rlp([be(cid), unhex(q.address), be(nonce)])); const digest = "0x" + hex(keccak(payload));
  let signer = null, match = null; if (q.signature) { try { signer = checksum(recoverAddress(unhex(digest), q.signature).address); if (isA(q.authority)) match = signer.toLowerCase() === q.authority.toLowerCase(); } catch (e) { return bad("signature invalid: " + e.message); } }
  const warn = []; if (cid === 0n) warn.push("chain_id 0 — authorization is valid on EVERY chain (replayable)"); if (q.address.toLowerCase() === "0x" + "0".repeat(40)) warn.push("delegating to address(0) clears delegation");
  return ok({ chain_id: cid.toString(), address: checksum(q.address), nonce: nonce.toString(), authority: isA(q.authority) ? checksum(q.authority) : null, current_delegation: cur, preimage: "0x" + hex(payload), digest, recovered_signer: signer, signer_matches_authority: match, warnings: warn, note: "digest = keccak256(0x05 || rlp([chain_id, address, nonce])). If the authority also sends the type-4 tx, use nonce+1 (self_sponsored=true)." });
}
// ---- canceltx ----
export async function canceltx(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const mode = String(q.mode || "cancel").toLowerCase(); if (!["cancel", "speedup"].includes(mode)) return bad("mode: cancel|speedup");
  try {
    let from = q.from, nonce = q.nonce != null ? BigInt(q.nonce) : null, orig = null;
    if (q.hash) { if (!/^0x[0-9a-fA-F]{64}$/.test(q.hash)) return bad("hash must be 32-byte hex"); const { results: r } = await rpcBatch(ch, [["eth_getTransactionByHash", [q.hash]]]); orig = r[0]; if (!orig) return bad("tx not found on " + ch + " (dropped or never broadcast)"); if (orig.blockNumber) return bad("tx already mined in block " + Number(BigInt(orig.blockNumber)) + " — cannot cancel"); from = orig.from; nonce = BigInt(orig.nonce); }
    if (!isA(from) || nonce == null) return bad("hash, or from + nonce, required");
    if (mode === "speedup" && !orig) return bad("speedup needs hash");
    const { results: s } = await rpcBatch(ch, [["eth_getTransactionCount", [from, "latest"]], ["eth_getTransactionCount", [from, "pending"]], ["eth_maxPriorityFeePerGas", []], ["eth_getBlockByNumber", ["latest", false]]]);
    const mined = BigInt(s[0] || 0), pend = BigInt(s[1] || 0); if (nonce < mined) return bad(`nonce ${nonce} already used (latest nonce ${mined})`);
    const baseFee = BigInt(s[3]?.baseFeePerGas || 0); const netTip = BigInt(s[2] || 1000000);
    const oTip = orig ? BigInt(orig.maxPriorityFeePerGas || orig.gasPrice || 0) : 0n, oMax = orig ? BigInt(orig.maxFeePerGas || orig.gasPrice || 0) : 0n;
    const bump = (x) => x * 1125n / 1000n + 1n;
    const tip = [bump(oTip), netTip].reduce((a, b) => (a > b ? a : b)); const maxFee = [bump(oMax), baseFee * 2n + tip].reduce((a, b) => (a > b ? a : b));
    const t = mode === "cancel" ? await txbuild({ chain: ch, from, to: from, value: "0", nonce: nonce.toString(), max_fee: maxFee.toString(), max_priority_fee: tip.toString() }) : await txbuild({ chain: ch, from, to: orig.to, data: orig.input, value: BigInt(orig.value).toString(), nonce: nonce.toString(), max_fee: maxFee.toString(), max_priority_fee: tip.toString() });
    return ok({ chain: ch, mode, from: checksum(from), nonce: nonce.toString(), latest_nonce: mined.toString(), pending_nonce: pend.toString(), has_pending_at_nonce: pend > nonce, warnings: pend > nonce ? [] : ["no pending tx seen at this nonce on this RPC — replacement would just be a new tx"], original: orig ? { hash: orig.hash, to: orig.to, max_fee: oMax.toString(), max_priority_fee: oTip.toString() } : null, replacement_fees: { max_fee: maxFee.toString(), max_priority_fee: tip.toString(), rule: ">= 112.5% of original (geth requires +10%)" }, ...tb(t), note: mode === "cancel" ? "0-value self-transfer at the same nonce; once mined the original can never execute." : "same call re-priced at the same nonce." });
  } catch (e) { return err(e); }
}
