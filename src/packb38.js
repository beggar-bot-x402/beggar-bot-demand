// packb38 (builder B, 2026-11-02): acrossdeposit, lidowithdraw, lidoclaim, permit2nonce. $0 upstream (keyless public RPCs + Across public API).
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
const pick = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, max_cost_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); const f = s.slice(s.length - d).replace(/0+$/, ""); return s.slice(0, s.length - d) + (f ? "." + f : ""); };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const arr = (xs) => pad(xs.length.toString(16)) + xs.join("");
const P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const CID = { ethereum: 1, base: 8453, optimism: 10, arbitrum: 42161, polygon: 137 };
const big = (v) => { try { const b = BigInt(String(v)); return b >= 0n ? b : null; } catch { return null; } };
// ---- acrossdeposit: Across SpokePool depositV3 with live suggested-fees quote ----
export async function acrossdeposit(q) {
  const ch = ck(q.chain), dst = ck(q.destination); if (!ch || !dst) return bad("chain and destination: base|ethereum|optimism|arbitrum|polygon"); if (ch === dst) return bad("chain == destination");
  if (!isA(q.from)) return bad("from address required"); const rcpt = isA(q.recipient) ? q.recipient : q.from;
  const tin = tok(ch, q.token), tout = isA(q.output_token) ? q.output_token : tok(dst, isA(q.token) ? null : q.token); if (!tin || !tout) return bad("token: USDC or WETH (or address + output_token)");
  try {
    const { results: d } = await rpcBatch(ch, [["eth_call", [{ to: tin, data: "0x313ce567" }, "latest"]]]); if (!d[0] || d[0].length < 66) return bad("token decimals() failed");
    const dec = Number(w(d[0], 0)), amt = toUnits(q.amount, dec); if (!amt) return bad("amount (human units) required");
    const u = "https://app.across.to/api/suggested-fees?inputToken=" + tin + "&outputToken=" + tout + "&originChainId=" + CID[ch] + "&destinationChainId=" + CID[dst] + "&amount=" + amt + "&recipient=" + rcpt;
    const res = await fetch(u, { headers: { accept: "application/json" } }); const f = await res.json().catch(() => ({}));
    if (!res.ok || !f.spokePoolAddress) return bad("Across quote failed: " + (f.message || f.error || res.status));
    if (f.isAmountTooLow) return bad("amount below Across minimum " + fmt(BigInt(f.limits.minDeposit), dec));
    const spoke = f.spokePoolAddress, out = BigInt(f.outputAmount);
    const data = sel("depositV3(address,address,address,address,uint256,uint256,uint256,address,uint32,uint32,uint32,bytes)") + [q.from, rcpt, tin, tout].map(pad).join("") + pad(amt.toString(16)) + pad(out.toString(16)) + pad(CID[dst].toString(16)) + pad(f.exclusiveRelayer || "0") + pad(BigInt(f.timestamp).toString(16)) + pad(BigInt(f.fillDeadline).toString(16)) + pad(BigInt(f.exclusivityDeadline || 0).toString(16)) + pad("180") + pad("0");
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: tin, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: tin, data: "0xdd62ed3e" + pad(q.from) + pad(spoke) }, "latest"]]]);
    const bal = r[0] ? w(r[0], 0) : null, al = r[1] ? w(r[1], 0) : null, warn = []; if (bal != null && bal < amt) warn.push("insufficient token balance"); let approval = null;
    if (al != null && al < amt) { const ad = "0x095ea7b3" + pad(spoke) + pad(amt.toString(16)); const at = await txbuild({ chain: ch, from: q.from, to: tin, data: ad, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) }); approval = { to: checksum(tin), calldata: ad, ...pick(at) }; warn.push("approve the SpokePool first"); }
    const t = await txbuild({ chain: ch, from: q.from, to: spoke, data, value: "0", ...(approval && approval.tx ? { nonce: String(approval.tx.nonce + 1), gas: "250000" } : q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, destination: dst, spoke_pool: checksum(spoke), input_token: checksum(tin), output_token: checksum(tout), input_amount: fmt(amt, dec), output_amount_raw: out.toString(), total_fee_raw: (f.totalRelayFee && f.totalRelayFee.total) || null, estimated_fill_sec: f.estimatedFillTimeSec ?? null, quote_timestamp: Number(f.timestamp), fill_deadline: Number(f.fillDeadline), exclusive_relayer: f.exclusiveRelayer, recipient: checksum(rcpt), balance: bal == null ? null : fmt(bal, dec), approval_tx: approval, calldata: data, ...pick(t), warnings: warn, note: "Quote is time-bound: submit within a few minutes or rebuild. Unfilled deposits refund on origin after fill_deadline.", source: "app.across.to/api/suggested-fees" });
  } catch (e) { return err(e); }
}
// ---- lidowithdraw: Lido WithdrawalQueue requestWithdrawals (stETH → ETH) ----
const WQ = "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1", STETH = "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84";
export async function lidowithdraw(q) {
  if (!isA(q.from)) return bad("from address required"); const amt = toUnits(q.amount, 18); if (!amt || amt < 100n) return bad("amount (stETH, human units) required");
  const owner = isA(q.owner) ? q.owner : q.from, MAX = 1000n * 10n ** 18n, parts = []; let left = amt; while (left > 0n) { const p = left > MAX ? MAX : left; parts.push(p); left -= p; }
  if (parts.length > 50) return bad("max 50,000 stETH per call"); if (parts[parts.length - 1] < 100n) return bad("remainder below 100 wei minimum — adjust amount");
  try {
    const { results: r } = await rpcBatch("ethereum", [["eth_call", [{ to: STETH, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: STETH, data: "0xdd62ed3e" + pad(q.from) + pad(WQ) }, "latest"]], ["eth_call", [{ to: WQ, data: sel("isPaused()") }, "latest"]], ["eth_call", [{ to: WQ, data: sel("unfinalizedStETH()") }, "latest"]]]);
    const bal = w(r[0], 0), al = w(r[1], 0), paused = r[2] ? w(r[2], 0) === 1n : null, warn = []; if (bal < amt) warn.push("stETH balance " + fmt(bal, 18) + " < amount"); if (paused) warn.push("WithdrawalQueue is paused"); let approval = null;
    if (al < amt) { const ad = "0x095ea7b3" + pad(WQ) + pad(amt.toString(16)); const at = await txbuild({ chain: "ethereum", from: q.from, to: STETH, data: ad, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) }); approval = { to: STETH, calldata: ad, ...pick(at) }; warn.push("approve stETH to the WithdrawalQueue first"); }
    const data = sel("requestWithdrawals(uint256[],address)") + pad("40") + pad(owner) + arr(parts.map((p) => pad(p.toString(16))));
    const t = await txbuild({ chain: "ethereum", from: q.from, to: WQ, data, value: "0", ...(approval && approval.tx ? { nonce: String(approval.tx.nonce + 1), gas: String(120000 + 90000 * parts.length) } : q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: "ethereum", withdrawal_queue: WQ, steth: STETH, from: checksum(q.from), nft_owner: checksum(owner), amount_steth: fmt(amt, 18), request_count: parts.length, request_amounts: parts.map((p) => fmt(p, 18)), steth_balance: fmt(bal, 18), queue_unfinalized_steth: r[3] ? fmt(w(r[3], 0), 18) : null, paused, approval_tx: approval, calldata: data, ...pick(t), warnings: warn, next: "Each request mints an unstETH NFT. Finalization usually takes 1-5 days; then claim with /v1/lidoclaim." });
  } catch (e) { return err(e); }
}
// ---- lidoclaim: find finalized Lido withdrawal requests + build claimWithdrawals with hints ----
export async function lidoclaim(q) {
  if (!isA(q.from)) return bad("from address required");
  try {
    const { results: a } = await rpcBatch("ethereum", [["eth_call", [{ to: WQ, data: sel("getWithdrawalRequests(address)") + pad(q.from) }, "latest"]], ["eth_call", [{ to: WQ, data: sel("getLastCheckpointIndex()") }, "latest"]]]);
    const n = Number(w(a[0], 1)), ids = Array.from({ length: n }, (_, i) => w(a[0], 2 + i)).sort((x, y) => (x < y ? -1 : 1)); const last = w(a[1], 0);
    if (!n) return ok({ chain: "ethereum", owner: checksum(q.from), requests: [], claimable: [], tx: null, note: "no unstETH withdrawal requests owned by this address" });
    const idw = arr(ids.map((x) => pad(x.toString(16))));
    const { results: s } = await rpcBatch("ethereum", [["eth_call", [{ to: WQ, data: sel("getWithdrawalStatus(uint256[])") + pad("20") + idw }, "latest"]]]);
    const rows = ids.map((id, i) => { const o = 2 + 6 * i; return { request_id: id.toString(), steth: fmt(w(s[0], o), 18), requested_at: new Date(Number(w(s[0], o + 3)) * 1000).toISOString(), finalized: w(s[0], o + 4) === 1n, claimed: w(s[0], o + 5) === 1n }; });
    const cl = rows.filter((x) => x.finalized && !x.claimed).slice(0, 100);
    if (!cl.length) return ok({ chain: "ethereum", owner: checksum(q.from), requests: rows, claimable: [], tx: null, note: "nothing finalized and unclaimed yet" });
    const cw = arr(cl.map((x) => pad(BigInt(x.request_id).toString(16))));
    const { results: h } = await rpcBatch("ethereum", [["eth_call", [{ to: WQ, data: sel("findCheckpointHints(uint256[],uint256,uint256)") + pad("60") + pad("1") + pad(last.toString(16)) + cw }, "latest"]]]);
    const hn = Number(w(h[0], 1)), hints = Array.from({ length: hn }, (_, i) => pad(w(h[0], 2 + i).toString(16)));
    const { results: c } = await rpcBatch("ethereum", [["eth_call", [{ to: WQ, data: sel("getClaimableEther(uint256[],uint256[])") + pad("40") + pad((64 + 32 + 32 * cl.length).toString(16)) + cw + arr(hints) }, "latest"]]]);
    const eth = c[0] ? Array.from({ length: cl.length }, (_, i) => w(c[0], 2 + i)).reduce((x, y) => x + y, 0n) : null;
    const data = sel("claimWithdrawals(uint256[],uint256[])") + pad("40") + pad((64 + 32 + 32 * cl.length).toString(16)) + cw + arr(hints);
    const t = await txbuild({ chain: "ethereum", from: q.from, to: WQ, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: "ethereum", withdrawal_queue: WQ, owner: checksum(q.from), requests: rows, claimable: cl.map((x) => x.request_id), claimable_eth: eth == null ? null : fmt(eth, 18), hints: hints.map((x) => BigInt("0x" + x).toString()), calldata: data, ...pick(t), warnings: [] });
  } catch (e) { return err(e); }
}
// ---- permit2nonce: invalidate Permit2 SignatureTransfer unordered nonces (cancel signed permits) ----
export async function permit2nonce(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain"); if (!isA(q.from)) return bad("from address required");
  const ns = String(q.nonces || "").split(/[\s,;]+/).filter(Boolean).map(big); if (!ns.length || ns.length > 256 || ns.some((x) => x == null)) return bad("nonces: 1-256 Permit2 signature nonces (uint256)");
  const words = new Map(); for (const n of ns) { const k = n >> 8n; words.set(k, (words.get(k) || 0n) | (1n << (n & 255n))); }
  if (words.size > 8) return bad("nonces span more than 8 bitmap words — split the request");
  try {
    const ks = [...words.keys()]; const { results: r } = await rpcBatch(ch, [...ks.map((k) => ["eth_call", [{ to: P2, data: sel("nonceBitmap(address,uint256)") + pad(q.from) + pad(k.toString(16)) }, "latest"]]), ["eth_getTransactionCount", [q.from, "pending"]]]);
    let nonce = q.nonce != null ? Number(q.nonce) : Number(BigInt(r[ks.length])); const txs = [];
    for (let i = 0; i < ks.length; i++) { const cur = r[i] ? w(r[i], 0) : 0n, mask = words.get(ks[i]), fresh = mask & ~cur;
      const used = ns.filter((n) => n >> 8n === ks[i] && (cur >> (n & 255n)) & 1n).map(String);
      if (!fresh) { txs.push({ word_pos: ks[i].toString(), already_invalidated: used, tx: null }); continue; }
      const data = sel("invalidateUnorderedNonces(uint256,uint256)") + pad(ks[i].toString(16)) + pad(fresh.toString(16));
      const t = await txbuild({ chain: ch, from: q.from, to: P2, data, value: "0", nonce: String(nonce++) }); txs.push({ word_pos: ks[i].toString(), mask: "0x" + fresh.toString(16), already_invalidated: used, calldata: data, ...pick(t) }); }
    return ok({ chain: ch, permit2: P2, owner: checksum(q.from), nonces: ns.map(String), tx_count: txs.filter((x) => x.tx).length, txs, note: "Invalidating a nonce cancels any signed Permit2 SignatureTransfer permit using it. For AllowanceTransfer permits use invalidateNonces(token,spender,newNonce) or /v1/permit2lockdown." });
  } catch (e) { return err(e); }
}
