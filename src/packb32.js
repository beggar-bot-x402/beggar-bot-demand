// packb32 (builder B, 2026-11-02): payoutbatch, safeexec, morphobuild, pullbuild. $0 upstream (keyless public RPCs).
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
import { safehash } from "./packb24.js";
import { recoverAddress } from "./sig.js";
import { keccak } from "./evm.js";
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const tb = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const strDec = (h) => { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } };
// ---- payoutbatch ----
export async function payoutbatch(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const token = tok(ch, q.token); if (!token) return bad("token: address, USDC or WETH");
  if (!isA(q.from)) return bad("from address required");
  let ps = q.payouts; if (typeof ps === "string") { try { ps = JSON.parse(ps); } catch { return bad("payouts must be JSON [{to, amount}]"); } }
  if (!Array.isArray(ps) || !ps.length || ps.length > 20) return bad("payouts: 1-20 {to, amount}");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_getTransactionCount", [q.from, "pending"]], ["eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]], ...ps.map((p) => ["eth_call", [{ to: token, data: "0xfe575a87" + pad(isA(p?.to) ? p.to : "0x0") }, "latest"]])]);
    if (!r[0]) return bad("token has no decimals() on " + ch);
    const dec = Number(BigInt(r[0])); const bal = r[1] ? w(r[1], 0) : null; let nonce = q.nonce != null ? BigInt(q.nonce) : BigInt(r[2] || 0);
    const rows = []; let total = 0n; const seen = new Set();
    for (const [i, p] of ps.entries()) { if (!p || !isA(p.to)) return bad(`payouts[${i}].to invalid`); const u = toUnits(p.amount, dec); if (u == null || u === 0n) return bad(`payouts[${i}].amount invalid`); total += u; const warn = []; if (seen.has(p.to.toLowerCase())) warn.push("duplicate recipient"); seen.add(p.to.toLowerCase()); if (r[4 + i] && w(r[4 + i], 0) === 1n) warn.push("recipient blacklisted — will revert"); rows.push({ to: checksum(p.to), amount: String(p.amount), units: u, warn }); }
    const built = await Promise.all(rows.map((x, k) => txbuild({ chain: ch, from: q.from, to: token, data: "0xa9059cbb" + pad(x.to) + pad(x.units.toString(16)), nonce: (nonce + BigInt(k)).toString() })));
    let gas = 0; const out = rows.map((x, k) => { const t = built[k].body; gas += t.max_cost_eth || 0; return { index: k, to: x.to, amount: x.amount, nonce: (nonce + BigInt(k)).toString(), calldata: "0xa9059cbb" + pad(x.to) + pad(x.units.toString(16)), tx: t.tx || null, signing_hash: t.signing_hash || null, build_error: t.error || null, warnings: x.warn }; });
    const warn = []; if (bal != null && bal < total) warn.push("insufficient balance for total payout"); if (out.some((x) => x.warnings.length || x.build_error)) warn.push("some rows have warnings/build errors");
    return ok({ chain: ch, token: checksum(token), symbol: strDec(r[3]), decimals: dec, from: checksum(q.from), count: out.length, total: Number(total) / 10 ** dec, total_units: total.toString(), balance: bal == null ? null : Number(bal) / 10 ** dec, start_nonce: nonce.toString(), total_gas_max_eth: gas, txs: out, safe_to_send: !warn.length, warnings: warn, note: "Sequential-nonce txs; broadcast in order. Later txs' gas estimates assume earlier ones succeed. For a Safe, use /v1/multisend instead." });
  } catch (e) { return err(e); }
}
// ---- safeexec ----
const OWN = "0xa0e67e2b", THR = "0xe75235b8";
export async function safeexec(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.safe) || !isA(q.to)) return bad("safe and to addresses required");
  let sigs = q.signatures; if (typeof sigs === "string") sigs = sigs.includes(",") || sigs.startsWith("[") ? (sigs.startsWith("[") ? JSON.parse(sigs) : sigs.split(",")) : [sigs]; if (!Array.isArray(sigs) || !sigs.length) return bad("signatures: one or more 65-byte hex sigs (array, comma list, or concatenated)");
  const h = await safehash(q); if (h.status !== 200) return h; const H = h.body.safe_tx_hash;
  try {
    const flat = sigs.flatMap((s) => { const b = String(s).replace(/^0x/, ""); if (b.length % 130) throw new Error("each signature must be 65 bytes"); return b.match(/.{130}/g); });
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.safe, data: OWN }, "latest"]], ["eth_call", [{ to: q.safe, data: THR }, "latest"]]]);
    const owners = new Set(); if (r[0]) { const n = Number(w(r[0], 1)); for (let i = 0; i < n; i++) owners.add("0x" + r[0].slice(2 + 64 * (2 + i) + 24, 2 + 64 * (3 + i)).toLowerCase()); }
    const thr = r[1] ? Number(w(r[1], 0)) : null;
    const ethH = "0x" + hex(keccak(cat(new TextEncoder().encode("\x19Ethereum Signed Message:\n32"), unhex(H))));
    const parsed = flat.map((s) => { const v = parseInt(s.slice(128), 16); let signer = null, kind;
      if (v === 0) { kind = "contract (EIP-1271)"; signer = "0x" + s.slice(24, 64); } else if (v === 1) { kind = "approved hash"; signer = "0x" + s.slice(24, 64); } else if (v > 30) { kind = "eth_sign"; signer = recoverAddress(unhex(ethH), "0x" + s.slice(0, 128) + (v - 4).toString(16)).address; } else { kind = "EIP-712"; signer = recoverAddress(unhex(H), "0x" + s).address; }
      return { signer: checksum(signer), kind, is_owner: owners.size ? owners.has(signer.toLowerCase()) : null, sig: "0x" + s }; });
    parsed.sort((a, b) => (a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1));
    const dup = new Set(parsed.map((x) => x.signer.toLowerCase())).size !== parsed.length; const valid = parsed.filter((x) => x.is_owner !== false).length;
    const packed = parsed.map((x) => x.sig.slice(2)).join(""); const Z = "0x" + "0".repeat(40);
    let d; try { d = unhex(q.data || "0x"); } catch { return bad("data must be hex"); }
    const big = (x) => BigInt(x || 0);
    const head = [pad(q.to), pad(big(q.value).toString(16)), pad("140"), pad(Number(q.operation || 0).toString(16)), pad(big(q.safe_tx_gas).toString(16)), pad(big(q.base_gas).toString(16)), pad(big(q.gas_price).toString(16)), pad(q.gas_token || Z), pad(q.refund_receiver || Z)];
    const dlen = Math.ceil(d.length / 32) * 32; const sigOff = 0x140 + 32 + dlen; head.push(pad(sigOff.toString(16)));
    const db = new Uint8Array(dlen); db.set(d); const sb = unhex(packed); const slen = Math.ceil(sb.length / 32) * 32; const sp = new Uint8Array(slen); sp.set(sb);
    const calldata = sel("execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)") + head.join("") + pad(d.length.toString(16)) + hex(db) + pad(sb.length.toString(16)) + hex(sp);
    const warn = []; if (dup) warn.push("duplicate signer"); if (parsed.some((x) => x.is_owner === false)) warn.push("signature from non-owner"); if (thr != null && valid < thr) warn.push(`only ${valid} owner signatures, threshold ${thr}`); if (h.body.nonce_status !== "next executable") warn.push("nonce is " + h.body.nonce_status);
    const t = isA(q.executor) ? await txbuild({ chain: ch, from: q.executor, to: q.safe, data: calldata }) : { body: {} };
    if (t.body.error) warn.push("gas estimate failed — execTransaction would revert (GS0xx)");
    return ok({ chain: ch, safe: checksum(q.safe), safe_tx_hash: H, nonce: h.body.nonce, nonce_status: h.body.nonce_status, threshold: thr, owners: [...owners].map(checksum), signatures: parsed.map(({ sig, ...x }) => x), packed_signatures: "0x" + packed, ready: !warn.length, exec_calldata: calldata, executor: isA(q.executor) ? checksum(q.executor) : null, ...tb(t), warnings: warn, note: "Signatures sorted ascending by signer as Safe requires. Pass executor to get a signed-ready tx." });
  } catch (e) { return bad(String(e.message || e)); }
}
// ---- morphobuild (Morpho Blue) ----
const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
export async function morphobuild(q) {
  const ch = ck(q.chain); if (!ch || !["base", "ethereum"].includes(ch)) return bad("chain: base|ethereum");
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(q.market_id))) return bad("market_id (bytes32) required — find ids via /v1/morphomarkets");
  if (!isA(q.from)) return bad("from address required");
  const A = ["supply", "withdraw", "supplycollateral", "withdrawcollateral", "borrow", "repay"]; const action = String(q.action || "supply").toLowerCase(); if (!A.includes(action)) return bad("action: " + A.join("|"));
  try {
    const id = pad(q.market_id);
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: MORPHO, data: sel("idToMarketParams(bytes32)") + id }, "latest"]], ["eth_call", [{ to: MORPHO, data: sel("position(bytes32,address)") + id + pad(q.from) }, "latest"]], ["eth_call", [{ to: MORPHO, data: sel("market(bytes32)") + id }, "latest"]]]);
    if (!r[0] || w(r[0], 0) === 0n) return bad("unknown Morpho market id on " + ch);
    const mp = [0, 1, 2, 3].map((i) => "0x" + r[0].slice(2 + 64 * i + 24, 2 + 64 * (i + 1))); const lltv = w(r[0], 4);
    const coll = action.includes("collateral"); const asset = coll ? mp[1] : mp[0];
    const { results: t } = await rpcBatch(ch, [["eth_call", [{ to: asset, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: asset, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: asset, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: asset, data: "0xdd62ed3e" + pad(q.from) + pad(MORPHO) }, "latest"]]]);
    const dec = t[0] ? Number(BigInt(t[0])) : 18;
    const pos = r[1] ? { supply_shares: w(r[1], 0), borrow_shares: w(r[1], 1), collateral: w(r[1], 2) } : null; const mk = r[2] ? [0, 1, 2, 3].map((i) => w(r[2], i)) : null;
    const max = String(q.amount).toLowerCase() === "max"; let assets = 0n, shares = 0n;
    if (max) { if (!pos) return bad("position unavailable"); if (action === "withdraw") shares = pos.supply_shares; else if (action === "repay") shares = pos.borrow_shares; else if (action === "withdrawcollateral") assets = pos.collateral; else return bad("max only for withdraw|repay|withdrawcollateral"); if (assets === 0n && shares === 0n) return bad("nothing to " + action); }
    else { assets = toUnits(q.amount, dec); if (assets == null || assets === 0n) return bad(`amount (<= ${dec} decimals) or max required`); }
    const MP = mp.map(pad).join("") + pad(lltv.toString(16)); const of = pad(q.from);
    const S = { supply: ["supply((address,address,address,address,uint256),uint256,uint256,address,bytes)", MP + pad(assets.toString(16)) + pad(shares.toString(16)) + of + pad("120") + pad("0")], withdraw: ["withdraw((address,address,address,address,uint256),uint256,uint256,address,address)", MP + pad(assets.toString(16)) + pad(shares.toString(16)) + of + of], supplycollateral: ["supplyCollateral((address,address,address,address,uint256),uint256,address,bytes)", MP + pad(assets.toString(16)) + of + pad("100") + pad("0")], withdrawcollateral: ["withdrawCollateral((address,address,address,address,uint256),uint256,address,address)", MP + pad(assets.toString(16)) + of + of], borrow: ["borrow((address,address,address,address,uint256),uint256,uint256,address,address)", MP + pad(assets.toString(16)) + pad(shares.toString(16)) + of + of], repay: ["repay((address,address,address,address,uint256),uint256,uint256,address,bytes)", MP + pad(assets.toString(16)) + pad(shares.toString(16)) + of + pad("120") + pad("0")] }[action];
    const data = sel(S[0]) + S[1];
    const warn = []; let approval = null; const bal = t[2] ? w(t[2], 0) : null, alw = t[3] ? w(t[3], 0) : null;
    if (["supply", "supplycollateral", "repay"].includes(action)) { const need = max && mk && mk[3] > 0n ? pos.borrow_shares * mk[2] / mk[3] + 1n : assets; if (bal != null && bal < need) warn.push("insufficient wallet balance"); if (alw != null && alw < need) { approval = { to: checksum(asset), data: "0x095ea7b3" + pad(MORPHO) + pad((need * 1001n / 1000n).toString(16)) }; warn.push("allowance to Morpho insufficient — send approval_tx first"); } }
    const b = approval ? { body: {} } : await txbuild({ chain: ch, from: q.from, to: MORPHO, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    if (b.body.error) warn.push("gas estimate failed — likely revert (insufficient liquidity/collateral/position)");
    const toA = (sh, ta, ts) => (ts > 0n ? Number(sh * ta / ts) / 10 ** dec : 0);
    return ok({ chain: ch, morpho: MORPHO, market_id: q.market_id, market_params: { loan_token: checksum(mp[0]), collateral_token: checksum(mp[1]), oracle: checksum(mp[2]), irm: checksum(mp[3]), lltv_pct: Number(lltv) / 1e16 }, market: mk ? { total_supply_assets: mk[0].toString(), total_borrow_assets: mk[2].toString(), utilization_pct: mk[0] > 0n ? Number(mk[2] * 10000n / mk[0]) / 100 : 0 } : null, position: pos && mk ? { supplied: coll ? null : toA(pos.supply_shares, mk[0], mk[1]), borrowed: coll ? null : toA(pos.borrow_shares, mk[2], mk[3]), collateral_units: pos.collateral.toString() } : null, action, asset: checksum(asset), symbol: t[1] ? strDec(t[1]) : null, assets: assets.toString(), shares: shares.toString(), approval_tx: approval, calldata: data, ...tb(b), safe_to_send: !warn.length, warnings: warn, note: "max uses shares (exact full exit)." });
  } catch (e) { return err(e); }
}
// ---- pullbuild (transferFrom) ----
export async function pullbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const token = tok(ch, q.token); if (!token) return bad("token: address, USDC or WETH");
  if (!isA(q.spender) || !isA(q.owner) || !isA(q.to)) return bad("spender (tx sender), owner, to addresses required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0x70a08231" + pad(q.owner) }, "latest"]], ["eth_call", [{ to: token, data: "0xdd62ed3e" + pad(q.owner) + pad(q.spender) }, "latest"]], ["eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]]]);
    if (!r[0]) return bad("token has no decimals() on " + ch);
    const dec = Number(BigInt(r[0])); const bal = r[1] ? w(r[1], 0) : null, alw = r[2] ? w(r[2], 0) : null;
    const max = String(q.amount).toLowerCase() === "max"; const units = max ? [bal, alw].filter((x) => x != null).reduce((a, b) => (a < b ? a : b), (1n << 256n) - 1n) : toUnits(q.amount, dec); if (units == null || units === 0n) return bad("amount (> 0) or max required");
    const warn = []; if (bal != null && bal < units) warn.push("owner balance insufficient"); if (alw != null && alw < units) warn.push("allowance insufficient — owner must approve spender first (/v1/approvebuild)");
    const data = "0x23b872dd" + pad(q.owner) + pad(q.to) + pad(units.toString(16));
    const t = await txbuild({ chain: ch, from: q.spender, to: token, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, token: checksum(token), symbol: strDec(r[3]), decimals: dec, spender: checksum(q.spender), owner: checksum(q.owner), to: checksum(q.to), amount: Number(units) / 10 ** dec, amount_units: units.toString(), owner_balance: bal == null ? null : Number(bal) / 10 ** dec, allowance: alw == null ? null : alw.toString(), allowance_unlimited: alw === (1n << 256n) - 1n, calldata: data, ...tb(t), safe_to_send: !warn.length && !t.body.error, warnings: warn });
  } catch (e) { return err(e); }
}
