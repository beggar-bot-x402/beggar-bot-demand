// packb35 (builder B, 2026-11-02): tokenairdrop, safeownerbuild, nonceclear, cctpburn. $0 upstream (keyless public RPCs + Circle Iris fees API).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
import { txbuild, safehash } from "./packb24.js";
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
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const arr = (xs) => pad(xs.length.toString(16)) + xs.join("");
// ---- tokenairdrop: one-tx ERC-20 airdrop via Disperse ----
const DISPERSE = "0xD152f549545093347A162Dce210e7293f1452150";
export async function tokenairdrop(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  const token = tok(ch, q.token); if (!token) return bad("token: address, USDC or WETH");
  const items = String(q.payouts || "").split(/[\s,;]+/).filter(Boolean).map((x) => x.split(/[:=]/)); if (!items.length || items.length > 200) return bad("payouts: 1-200 entries address:amount (human units)");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getCode", [DISPERSE, "latest"]], ["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: token, data: "0xdd62ed3e" + pad(q.from) + pad(DISPERSE) }, "latest"]]]);
    if (!r[0] || r[0] === "0x") return bad("Disperse contract not deployed on " + ch);
    if (!r[1] || r[1].length < 66) return bad("token decimals() failed — not an ERC-20?");
    const dec = Number(w(r[1], 0)); const rows = [];
    for (const [a, v] of items) { const u = toUnits(v, dec); if (!isA(a) || u == null || u === 0n) return bad("bad payout entry " + a + ":" + v); rows.push([a, u]); }
    const total = rows.reduce((s, x) => s + x[1], 0n), bal = r[2] ? w(r[2], 0) : null, al = r[3] ? w(r[3], 0) : null;
    const data = "0xc73a2d60" + pad(token) + pad("60") + pad((96 + 32 + 32 * rows.length).toString(16)) + arr(rows.map((x) => pad(x[0]))) + arr(rows.map((x) => pad(x[1].toString(16))));
    const warn = []; if (bal != null && bal < total) warn.push("insufficient token balance for total"); let approval = null;
    if (al != null && al < total) { const ad = "0x095ea7b3" + pad(DISPERSE) + pad(total.toString(16)); const at = await txbuild({ chain: ch, from: q.from, to: token, data: ad, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) }); approval = { to: checksum(token), calldata: ad, ...pick(at) }; warn.push("approve Disperse for the total first (disperse gas estimate fails until then)"); }
    const t = await txbuild({ chain: ch, from: q.from, to: DISPERSE, data, value: "0", ...(approval && approval.tx ? { nonce: String(approval.tx.nonce + 1) } : q.nonce != null ? { nonce: q.nonce } : {}), ...(approval ? { gas: String(60000 + 35000 * rows.length) } : {}) });
    return ok({ chain: ch, token: checksum(token), decimals: dec, disperse: checksum(DISPERSE), from: checksum(q.from), recipient_count: rows.length, total: fmt(total, dec), total_raw: total.toString(), balance: bal == null ? null : fmt(bal, dec), allowance: al == null ? null : fmt(al, dec), approval_tx: approval, calldata_bytes: (data.length - 2) / 2, ...pick(t), warnings: warn, note: "disperseToken pulls the total then transfers to each recipient; one revert reverts all." + (approval ? " Disperse tx gas set manually since allowance isn't in place yet; nonce is approval+1." : "") });
  } catch (e) { return err(e); }
}
// ---- safeownerbuild: Safe owner/threshold changes → calldata + safeTxHash ----
export async function safeownerbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.safe)) return bad("safe address required");
  const act = String(q.action || "").toLowerCase(); if (!["add", "remove", "swap", "threshold"].includes(act)) return bad("action: add|remove|swap|threshold");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: q.safe, data: "0xa0e67e2b" }, "latest"]], ["eth_call", [{ to: q.safe, data: "0xe75235b8" }, "latest"]]]);
    if (!r[0] || r[0].length < 130) return bad("not a Safe (getOwners() failed)");
    const n = Number(w(r[0], 1)), owners = Array.from({ length: n }, (_, i) => "0x" + r[0].slice(2 + 64 * (2 + i) + 24, 2 + 64 * (3 + i))), thr = Number(w(r[1], 0));
    const idx = (a) => owners.findIndex((o) => o.toLowerCase() === String(a).toLowerCase()); const prev = (i) => i === 0 ? "0x0000000000000000000000000000000000000001" : owners[i - 1];
    let nt = q.threshold != null ? Number(q.threshold) : null, data, newOwners = owners.slice();
    if (act === "add") { if (!isA(q.owner)) return bad("owner (new owner address) required"); if (idx(q.owner) >= 0) return bad("already an owner"); nt = nt ?? thr; newOwners = [q.owner, ...owners]; data = "0x0d582f13" + pad(q.owner) + pad(nt.toString(16)); }
    else if (act === "remove") { const i = idx(q.owner); if (i < 0) return bad("owner is not a current owner"); nt = nt ?? Math.min(thr, n - 1); newOwners = owners.filter((_, j) => j !== i); data = "0xf8dc5dd9" + pad(prev(i)) + pad(owners[i]) + pad(nt.toString(16)); }
    else if (act === "swap") { const i = idx(q.owner); if (i < 0) return bad("owner (the one being replaced) is not a current owner"); if (!isA(q.new_owner)) return bad("new_owner required"); if (idx(q.new_owner) >= 0) return bad("new_owner already an owner"); nt = thr; newOwners[i] = q.new_owner; data = "0xe318b52b" + pad(prev(i)) + pad(owners[i]) + pad(q.new_owner); }
    else { if (nt == null) return bad("threshold required"); data = "0x694e80c3" + pad(nt.toString(16)); }
    if (!(nt >= 1 && nt <= newOwners.length)) return bad("threshold must be 1.." + newOwners.length + " after the change");
    const h = await safehash({ chain: ch, safe: q.safe, to: q.safe, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    const warn = []; if (nt === 1 && newOwners.length > 1) warn.push("threshold 1 on a multi-owner Safe — any single owner can move funds"); if (act === "remove" && nt === newOwners.length) warn.push("threshold equals owner count — losing one key bricks the Safe");
    return ok({ chain: ch, safe: checksum(q.safe), action: act, owners_before: owners.map(checksum), threshold_before: thr, owners_after: newOwners.map(checksum), threshold_after: nt, safe_tx: { to: checksum(q.safe), value: "0", data, operation: 0 }, safe_tx_hash: h.body.safe_tx_hash || null, nonce: h.body.nonce ?? null, nonce_status: h.body.nonce_status ?? null, warnings: warn, note: "Collect owner signatures over safe_tx_hash, then build execution with /v1/safeexec." });
  } catch (e) { return err(e); }
}
// ---- nonceclear: zero-value self-txs to clear stuck/pending nonces ----
export async function nonceclear(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_getTransactionCount", [q.from, "latest"]], ["eth_getTransactionCount", [q.from, "pending"]], ["eth_maxPriorityFeePerGas", []], ["eth_getBlockByNumber", ["latest", false]]]);
    const lat = BigInt(r[0] || "0x0"), pen = BigInt(r[1] || "0x0"), tip0 = r[2] ? BigInt(r[2]) : 1000000n, bf = r[3] && r[3].baseFeePerGas ? BigInt(r[3].baseFeePerGas) : 0n;
    const from = q.from_nonce != null ? BigInt(q.from_nonce) : lat, to = q.to_nonce != null ? BigInt(q.to_nonce) : (pen > lat ? pen - 1n : lat);
    if (to < from) return bad("nothing to clear: no pending nonces above confirmed (pass from_nonce/to_nonce to force)"); if (to - from > 19n) return bad("max 20 nonces per call");
    const bump = BigInt(Math.round(Number(q.bump ?? 3) * 100)); const tip = (tip0 * bump) / 100n + 1n; const maxFee = bf * 3n + tip;
    const txs = []; for (let n = from; n <= to; n++) { const t = await txbuild({ chain: ch, from: q.from, to: q.from, data: "0x", value: "0", nonce: n.toString(), gas: "21000", max_priority_fee: tip.toString(), max_fee: maxFee.toString() }); txs.push({ nonce: Number(n), ...pick(t) }); }
    return ok({ chain: ch, from: checksum(q.from), confirmed_nonce: Number(lat), pending_nonce: Number(pen), clearing: { from: Number(from), to: Number(to), count: txs.length }, priority_fee: tip.toString(), max_fee: maxFee.toString(), txs, warnings: pen === lat && q.from_nonce == null ? ["node sees no pending txs — stuck tx may be only in another mempool; still safe to send"] : [], note: "Each replaces whatever sits at that nonce (needs >=10% higher fees than the stuck tx). Broadcast in nonce order." });
  } catch (e) { return err(e); }
}
// ---- cctpburn: Circle CCTP v2 depositForBurn with live fast-transfer fee ----
const TMV2 = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", DOM = { ethereum: 0, optimism: 2, arbitrum: 3, base: 6, polygon: 7 };
export async function cctpburn(q) {
  const ch = ck(q.chain); if (!ch || DOM[ch] == null) return bad("chain: " + Object.keys(DOM).join(", ")); if (!isA(q.from)) return bad("from address required");
  const dst = ck(q.destination); if (!dst || DOM[dst] == null || dst === ch) return bad("destination: another of " + Object.keys(DOM).join(", "));
  const units = toUnits(q.amount, 6); if (units == null || units === 0n) return bad("amount (USDC, human units) required");
  const rec = isA(q.recipient) ? q.recipient : q.from; const speed = String(q.speed || "fast").toLowerCase(); if (!["fast", "standard"].includes(speed)) return bad("speed: fast|standard");
  try {
    let fees = null; try { const f = await fetch(`https://iris-api.circle.com/v2/burn/USDC/fees/${DOM[ch]}/${DOM[dst]}`); if (f.ok) fees = await f.json(); } catch {}
    const thr = speed === "fast" ? 1000 : 2000; const fe = Array.isArray(fees) ? fees.find((x) => x.finalityThreshold === thr) : null; const bps = fe ? Number(fe.minimumFee) : speed === "fast" ? 1.5 : 0;
    const maxFee = (units * BigInt(Math.ceil(bps * 100)) + 999999n) / 1000000n + (speed === "fast" ? 1n : 0n);
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: USDC[ch], data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: USDC[ch], data: "0xdd62ed3e" + pad(q.from) + pad(TMV2) }, "latest"]]]);
    const bal = r[0] ? w(r[0], 0) : null, al = r[1] ? w(r[1], 0) : null;
    const data = "0x8e0250ee" + pad(units.toString(16)) + pad(DOM[dst].toString(16)) + pad(rec) + pad(USDC[ch]) + pad("0") + pad(maxFee.toString(16)) + pad(thr.toString(16));
    const warn = []; let approval = null; if (bal != null && bal < units) warn.push("insufficient USDC");
    if (al != null && al < units) { const ad = "0x095ea7b3" + pad(TMV2) + pad(units.toString(16)); const at = await txbuild({ chain: ch, from: q.from, to: USDC[ch], data: ad, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) }); approval = { to: checksum(USDC[ch]), calldata: ad, ...pick(at) }; warn.push("approve TokenMessengerV2 first"); }
    const t = await txbuild({ chain: ch, from: q.from, to: TMV2, data, value: "0", ...(approval ? { gas: "180000" } : {}), ...(approval && approval.tx ? { nonce: String(approval.tx.nonce + 1) } : q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ source: ch, destination: dst, source_domain: DOM[ch], destination_domain: DOM[dst], amount: String(q.amount), recipient: checksum(rec), speed, min_finality_threshold: thr, fee_bps: bps, max_fee_usdc: fmt(maxFee, 6), receive_min_usdc: fmt(units - maxFee, 6), fees_live: !!fe, token_messenger_v2: checksum(TMV2), usdc_balance: bal == null ? null : fmt(bal, 6), allowance: al == null ? null : fmt(al, 6), approval_tx: approval, calldata: data, ...pick(t), warnings: warn, next: "After the burn confirms, poll /v1/cctpstatus with the tx hash for the attestation, then call receiveMessage on the destination MessageTransmitterV2.", note: speed === "fast" ? "Fast transfer: ~seconds attestation, fee deducted on destination." : "Standard: waits for hard finality (~13-19 min on L2s from Ethereum finality)." });
  } catch (e) { return err(e); }
}
