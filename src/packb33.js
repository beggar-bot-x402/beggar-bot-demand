// packb33 (builder B, 2026-11-02): nativesweep, tokensweep, delegatebuild, wstethbuild. $0 upstream (keyless public RPCs).
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
const OPS = ["base", "optimism"];
const eth = (x) => x == null ? null : Number(x) / 1e18;
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const f = s.slice(s.length - d).replace(/0+$/, ""); return s.slice(0, s.length - d) + (f ? "." + f : ""); };
const strRes = (r) => { try { const s = String(r || "0x").slice(2); if (s.length >= 192) { const n = Number(BigInt("0x" + s.slice(64, 128))); return new TextDecoder().decode(unhex(s.slice(128, 128 + n * 2))); } return new TextDecoder().decode(unhex(s.slice(0, 64))).replace(/\0+$/, ""); } catch { return null; } };
const pick = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, max_cost_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
// ---- nativesweep: send entire native balance minus max gas (+ OP-stack L1 fee) ----
export async function nativesweep(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required"); if (!isA(q.to)) return bad("to address required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getBalance", [q.from, "latest"]], ["eth_getCode", [q.to, "latest"]]]);
    const bal = BigInt(r[0] || "0x0"), toIsContract = r[1] && r[1] !== "0x";
    const base = { chain: ch, from: checksum(q.from), to: checksum(q.to), ...(q.nonce != null ? { nonce: q.nonce } : {}), ...(q.max_fee != null ? { max_fee: q.max_fee } : {}), ...(q.max_priority_fee != null ? { max_priority_fee: q.max_priority_fee } : {}) };
    const gas = q.gas != null ? String(q.gas) : toIsContract ? "60000" : "21000";
    const t0 = await txbuild({ ...base, value: "0", gas }); if (t0.status !== 200 || !t0.body.tx) return t0.status !== 200 ? t0 : ok({ chain: ch, error: t0.body.error });
    const maxFee = BigInt(t0.body.tx.maxFeePerGas); let l1 = 0n;
    if (OPS.includes(ch)) { try { const enc = String(t0.body.unsigned_serialized).slice(2); const len = enc.length / 2; const data = "0x49948e0e" + pad("20") + pad(len.toString(16)) + enc.padEnd(Math.ceil(enc.length / 64) * 64, "0"); const { results: o } = await rpcBatch(ch, [["eth_call", [{ to: "0x420000000000000000000000000000000000000F", data }, "latest"]]]); l1 = o[0] ? w(o[0], 0) : 0n; } catch {} }
    const reserve = BigInt(gas) * maxFee + (l1 * 3n) / 2n; const value = bal - reserve;
    const warn = []; if (toIsContract) warn.push("recipient is a contract — gas set to 60000; leftover gas refunds stay in sender"); warn.push("maxFee reserve means a small dust remainder (unused fee headroom) stays in the sender");
    if (value <= 0n) return ok({ chain: ch, from: checksum(q.from), balance_eth: eth(bal), reserve_eth: eth(reserve), sweepable: false, warnings: ["balance does not cover gas"] });
    const t = await txbuild({ ...base, value: value.toString(), gas });
    return ok({ chain: ch, from: checksum(q.from), to: checksum(q.to), balance_eth: eth(bal), sweep_value_wei: value.toString(), sweep_value_eth: eth(value), gas_reserve_eth: eth(BigInt(gas) * maxFee), l1_fee_reserve_eth: eth((l1 * 3n) / 2n), max_fee_per_gas: maxFee.toString(), sweepable: true, ...pick(t), warnings: warn, note: "Sign the tx as-is; changing maxFeePerGas upward makes it fail for insufficient funds." });
  } catch (e) { return err(e); }
}
// ---- tokensweep: transfer every non-zero ERC-20 balance to one address, sequential nonces ----
export async function tokensweep(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required"); if (!isA(q.to)) return bad("to address required");
  const toks = [...new Set(String(q.tokens || "").split(/[\s,]+/).filter(Boolean).map((x) => x.toLowerCase()))];
  if (!toks.length || toks.length > 15 || !toks.every(isA)) return bad("tokens: 1-15 comma-separated ERC-20 addresses");
  try {
    const calls = [["eth_getTransactionCount", [q.from, "pending"]]]; for (const t of toks) calls.push(["eth_call", [{ to: t, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    let nonce = q.nonce != null ? BigInt(q.nonce) : BigInt(r[0] || "0x0"); const out = [], skipped = [];
    for (let i = 0; i < toks.length; i++) {
      const b = r[1 + 3 * i], d = r[2 + 3 * i], s = r[3 + 3 * i]; const bal = b && b.length >= 66 ? w(b, 0) : null; const dec = d && d.length >= 66 ? Number(w(d, 0)) : null; const sym = strRes(s);
      if (bal == null) { skipped.push({ token: checksum(toks[i]), reason: "balanceOf failed — not an ERC-20?" }); continue; }
      if (bal === 0n) { skipped.push({ token: checksum(toks[i]), symbol: sym, reason: "zero balance" }); continue; }
      const data = "0xa9059cbb" + pad(q.to) + pad(bal.toString(16));
      const t = await txbuild({ chain: ch, from: q.from, to: toks[i], data, value: "0", nonce: nonce.toString(), ...(q.max_fee != null ? { max_fee: q.max_fee } : {}) });
      out.push({ token: checksum(toks[i]), symbol: sym, decimals: dec, amount_raw: bal.toString(), amount: dec != null ? fmt(bal, dec) : null, nonce: Number(nonce), calldata: data, ...pick(t) }); nonce++;
    }
    const totalGas = out.reduce((s, x) => s + (x.max_cost_eth || 0), 0);
    return ok({ chain: ch, from: checksum(q.from), to: checksum(q.to), transfers: out, skipped, tx_count: out.length, total_max_gas_eth: totalGas, warnings: out.some((x) => x.build_error) ? ["some transfers failed gas estimation (paused/blacklisted/fee-on-transfer token?)"] : [], note: "Broadcast in nonce order. Fee-on-transfer/rebasing tokens may leave dust." });
  } catch (e) { return err(e); }
}
// ---- delegatebuild: ERC20Votes / Comp-style delegate(address) ----
export async function delegatebuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required"); if (!isA(q.token)) return bad("token (governance token address) required");
  const to = q.delegatee == null || q.delegatee === "" || q.delegatee === "self" ? q.from : q.delegatee; if (!isA(to)) return bad("delegatee must be an address or 'self'");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.token, data: "0x587cde1e" + pad(q.from) }, "latest"]], ["eth_call", [{ to: q.token, data: "0x9ab24eb0" + pad(q.from) }, "latest"]], ["eth_call", [{ to: q.token, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: q.token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: q.token, data: "0x9ab24eb0" + pad(to) }, "latest"]]]);
    if (!r[0] || r[0].length < 66) return bad("token does not implement delegates(address) — not an ERC20Votes/Comp-style token");
    const dec = r[3] && r[3].length >= 66 ? Number(w(r[3], 0)) : 18, cur = "0x" + r[0].slice(26, 66);
    const v = (x) => x && x.length >= 66 ? fmt(w(x, 0), dec) : null;
    const data = "0x5c19a95c" + pad(to); const already = cur.toLowerCase() === to.toLowerCase();
    const t = await txbuild({ chain: ch, from: q.from, to: q.token, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, token: checksum(q.token), symbol: strRes(r[4]), from: checksum(q.from), balance: v(r[2]), current_delegate: /^0x0{40}$/.test(cur) ? null : checksum(cur), current_votes: v(r[1]), new_delegatee: checksum(to), delegatee_votes_before: v(r[5]), already_delegated: already, calldata: data, ...pick(t), warnings: [...(/^0x0{40}$/.test(cur) ? ["not delegated yet — balance carries no voting power until you delegate (self-delegate to vote yourself)"] : []), ...(already ? ["already delegated to this address — tx is a no-op"] : [])] });
  } catch (e) { return err(e); }
}
// ---- wstethbuild: Lido stake / wrap / unwrap (ethereum) ----
const STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84", WSTETH = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0";
export async function wstethbuild(q) {
  if (q.chain && ck(q.chain) !== "ethereum") return bad("Lido stake/wrap is on ethereum only (wstETH on L2s is bridged)");
  if (!isA(q.from)) return bad("from address required");
  const act = String(q.action || "stakewrap").toLowerCase(); if (!["stake", "stakewrap", "wrap", "unwrap"].includes(act)) return bad("action: stake|stakewrap|wrap|unwrap");
  const units = toUnits(q.amount, 18); if (units == null || units === 0n) return bad("amount (human units, 18 decimals, > 0) required");
  try {
    const { results: r } = await rpcBatch("ethereum", [["eth_getBalance", [q.from, "latest"]], ["eth_call", [{ to: STETH, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: WSTETH, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: STETH, data: "0xdd62ed3e" + pad(q.from) + pad(WSTETH) }, "latest"]], ["eth_call", [{ to: WSTETH, data: "0x035faf82" }, "latest"]], ["eth_call", [{ to: STETH, data: "0x1ea7ca89" }, "latest"]]]);
    const nb = r[0] ? BigInt(r[0]) : null, sb = r[1] ? w(r[1], 0) : null, wb = r[2] ? w(r[2], 0) : null, al = r[3] ? w(r[3], 0) : null, rate = r[4] ? w(r[4], 0) : null, paused = r[5] ? w(r[5], 0) === 1n : null;
    let to, data, value = "0", expect = null; const warn = []; let approval = null;
    if (act === "stake") { to = STETH; data = "0xa1903eab" + pad(q.referral && isA(q.referral) ? q.referral : "0"); value = units.toString(); expect = { steth: fmt(units, 18) }; if (nb != null && nb < units) warn.push("insufficient ETH"); }
    else if (act === "stakewrap") { to = WSTETH; data = "0x"; value = units.toString(); if (rate) expect = { wsteth: fmt((units * 10n ** 18n) / rate, 18) }; if (nb != null && nb < units) warn.push("insufficient ETH"); }
    else if (act === "wrap") { to = WSTETH; data = "0xea598cb0" + pad(units.toString(16)); if (rate) expect = { wsteth: fmt((units * 10n ** 18n) / rate, 18) }; if (sb != null && sb < units) warn.push("insufficient stETH"); if (al != null && al < units) { approval = { to: STETH, calldata: "0x095ea7b3" + pad(WSTETH) + pad(units.toString(16)), note: "approve wstETH to pull stETH first" }; warn.push("stETH allowance to wstETH too low — send approval first (gas estimate for wrap will fail until then)"); } }
    else { to = WSTETH; data = "0xde0e9a3e" + pad(units.toString(16)); if (rate) expect = { steth: fmt((units * rate) / 10n ** 18n, 18) }; if (wb != null && wb < units) warn.push("insufficient wstETH"); }
    if (paused) warn.push("Lido staking is paused");
    const t = await txbuild({ chain: "ethereum", from: q.from, to, data, value, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    let at = null; if (approval) { const a = await txbuild({ chain: "ethereum", from: q.from, to: STETH, data: approval.calldata, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) }); at = { ...approval, ...pick(a) }; }
    return ok({ chain: "ethereum", action: act, amount: String(q.amount), from: checksum(q.from), balances: { eth: eth(nb), steth: sb == null ? null : fmt(sb, 18), wsteth: wb == null ? null : fmt(wb, 18) }, steth_per_wsteth: rate == null ? null : fmt(rate, 18), expected_out: expect, target: checksum(to), calldata: data, value_wei: value, approval_tx: at, ...pick(t), warnings: warn, note: "stETH transfers round down 1-2 wei; stakewrap sends ETH straight to wstETH (stakes + wraps in one tx)." });
  } catch (e) { return err(e); }
}
