// packb39 (builder B, 2026-11-02): cowquote, cowstatus, cowcancel, cowpresign. $0 upstream (keyless public RPCs + CoW Protocol public API).
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
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch] })[String(t || "USDC").toUpperCase()] || null;
const arr = (xs) => pad(xs.length.toString(16)) + xs.join("");
const SETTLE = "0x9008D19f58AAbD9eD0D60971565AA8510560ab41", RELAYER = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
const API = { ethereum: "mainnet", base: "base", arbitrum: "arbitrum_one", polygon: "polygon" }, CID = { ethereum: 1, base: 8453, arbitrum: 42161, polygon: 137 };
const cch = (c) => { const s = ck(c); return s && API[s] ? s : null; };
const kh = (s) => keccakHex(s).slice(2), h = (x) => hex(keccak(unhex(x)));
const domSep = (ch) => h(kh("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") + kh("Gnosis Protocol") + kh("v2") + pad(CID[ch].toString(16)) + pad(SETTLE));
const OT = "Order(address sellToken,address buyToken,address receiver,uint256 sellAmount,uint256 buyAmount,uint32 validTo,bytes32 appData,uint256 feeAmount,string kind,bool partiallyFillable,string sellTokenBalance,string buyTokenBalance)";
const isUid = (u) => /^0x[0-9a-fA-F]{112}$/.test(String(u || ""));
const cow = async (ch, path, init) => { const r = await fetch("https://api.cow.fi/" + API[ch] + "/api/v1" + path, { ...init, headers: { "content-type": "application/json", accept: "application/json" } }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; };
// ---- cowquote: CoW Protocol order quote → EIP-712 order + digest + uid + approval ----
export async function cowquote(q) {
  const ch = cch(q.chain); if (!ch) return bad("chain: base|ethereum|arbitrum|polygon"); if (!isA(q.from)) return bad("from address required");
  const sT = tok(ch, q.sell_token), bT = tok(ch, q.buy_token); if (!sT || !bT || sT.toLowerCase() === bT.toLowerCase()) return bad("sell_token/buy_token: distinct addresses, USDC or WETH");
  const kind = String(q.kind || "sell").toLowerCase(); if (!["sell", "buy"].includes(kind)) return bad("kind: sell|buy");
  try {
    const { results: d } = await rpcBatch(ch, [["eth_call", [{ to: kind === "sell" ? sT : bT, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: sT, data: "0xdd62ed3e" + pad(q.from) + pad(RELAYER) }, "latest"]], ["eth_call", [{ to: sT, data: "0x70a08231" + pad(q.from) }, "latest"]]]);
    if (!d[0] || d[0].length < 66) return bad("token decimals() failed"); const amt = toUnits(q.amount, Number(w(d[0], 0))); if (!amt) return bad("amount (human units of " + (kind === "sell" ? "sell" : "buy") + " token) required");
    const rcv = isA(q.receiver) ? q.receiver : q.from, slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 0), 2000);
    const body = { sellToken: sT, buyToken: bT, from: q.from, receiver: rcv, kind, signingScheme: "eip712", onchainOrder: false, appData: "{}", partiallyFillable: false, ...(kind === "sell" ? { sellAmountBeforeFee: amt.toString() } : { buyAmountAfterFee: amt.toString() }) };
    const r = await cow(ch, "/quote", { method: "POST", body: JSON.stringify(body) }); if (!r.ok || !r.j || !r.j.quote) return bad("CoW quote failed: " + ((r.j && (r.j.description || r.j.errorType)) || r.status));
    const Q = r.j.quote; let sell = BigInt(Q.sellAmount) + BigInt(Q.feeAmount), buy = BigInt(Q.buyAmount);
    if (kind === "sell") buy = buy * BigInt(10000 - slip) / 10000n; else sell = sell * BigInt(10000 + slip) / 10000n;
    const validTo = Math.floor(Date.now() / 1000) + Math.min(Math.max(Number(q.valid_secs ?? 1800), 60), 86400);
    const order = { sellToken: checksum(sT), buyToken: checksum(bT), receiver: checksum(rcv), sellAmount: sell.toString(), buyAmount: buy.toString(), validTo, appData: Q.appDataHash, feeAmount: "0", kind, partiallyFillable: false, sellTokenBalance: "erc20", buyTokenBalance: "erc20" };
    const sh = h(kh(OT) + pad(sT) + pad(bT) + pad(rcv) + pad(sell.toString(16)) + pad(buy.toString(16)) + pad(validTo.toString(16)) + pad(Q.appDataHash) + pad("0") + kh(kind) + pad("0") + kh("erc20") + kh("erc20"));
    const digest = h("1901" + domSep(ch) + sh), uid = "0x" + digest + q.from.slice(2).toLowerCase() + validTo.toString(16).padStart(8, "0");
    const al = d[1] ? w(d[1], 0) : null, bal = d[2] ? w(d[2], 0) : null, warn = []; let approval = null;
    if (bal != null && bal < sell) warn.push("insufficient sell-token balance");
    if (al != null && al < sell) { const ad = "0x095ea7b3" + pad(RELAYER) + pad(sell.toString(16)); const at = await txbuild({ chain: ch, from: q.from, to: sT, data: ad, value: "0" }); approval = { to: checksum(sT), spender: RELAYER, calldata: ad, ...pick(at) }; warn.push("approve the CoW VaultRelayer before submitting (order will not fill otherwise)"); }
    const typed = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], Order: OT.slice(6, -1).split(",").map((x) => { const [type, name] = x.split(" "); return { name, type }; }) }, primaryType: "Order", domain: { name: "Gnosis Protocol", version: "v2", chainId: CID[ch], verifyingContract: SETTLE }, message: order };
    return ok({ chain: ch, quote_id: r.j.id, quoted_sell: Q.sellAmount, quoted_fee: Q.feeAmount, quoted_buy: Q.buyAmount, slippage_bps: slip, order, typed_data: typed, digest: "0x" + digest, order_uid: uid, approval_tx: approval, submit: { method: "POST", url: "https://api.cow.fi/" + API[ch] + "/api/v1/orders", body: { ...order, signingScheme: "eip712", signature: "<0x r||s||v of digest>", from: checksum(q.from), quoteId: r.j.id, appData: "{}" } }, warnings: warn, note: "Gasless: sign the digest (eth_signTypedData_v4) and POST. Track with /v1/cowstatus; cancel with /v1/cowcancel." });
  } catch (e) { return err(e); }
}
// ---- cowstatus: CoW order status + fills ----
export async function cowstatus(q) {
  const ch = cch(q.chain); if (!ch) return bad("chain: base|ethereum|arbitrum|polygon"); if (!isUid(q.uid)) return bad("uid: 56-byte CoW order UID");
  try {
    const [o, t] = await Promise.all([cow(ch, "/orders/" + q.uid), cow(ch, "/trades?orderUid=" + q.uid)]);
    if (o.status === 404) return ok({ chain: ch, uid: q.uid, found: false, note: "order not found on this chain's orderbook" }); if (!o.ok) return err("CoW API " + o.status);
    const x = o.j, trades = (t.j || []).map((y) => ({ block: y.blockNumber, tx: y.txHash, sell: y.sellAmount, buy: y.buyAmount }));
    return ok({ chain: ch, uid: q.uid, found: true, status: x.status, owner: x.owner, kind: x.kind, sell_token: x.sellToken, buy_token: x.buyToken, sell_amount: x.sellAmount, buy_amount: x.buyAmount, executed_sell: x.executedSellAmount, executed_buy: x.executedBuyAmount, valid_to: x.validTo, expired: x.validTo * 1000 < Date.now(), invalidated: x.invalidated, signing_scheme: x.signingScheme, created: x.creationDate, trades, explorer: "https://explorer.cow.fi/orders/" + q.uid });
  } catch (e) { return err(e); }
}
// ---- cowcancel: off-chain cancellation typed data + on-chain invalidateOrder tx ----
export async function cowcancel(q) {
  const ch = cch(q.chain); if (!ch) return bad("chain: base|ethereum|arbitrum|polygon");
  const uids = String(q.uids || q.uid || "").split(/[\s,;]+/).filter(Boolean); if (!uids.length || uids.length > 20 || !uids.every(isUid)) return bad("uids: 1-20 CoW order UIDs");
  const owner = "0x" + uids[0].slice(66, 106); if (!uids.every((u) => u.slice(66, 106).toLowerCase() === owner.slice(2).toLowerCase())) return bad("all uids must share one owner");
  try {
    const st = await Promise.all(uids.map((u) => cow(ch, "/orders/" + u))); const rows = uids.map((u, i) => ({ uid: u, status: st[i].ok ? st[i].j.status : st[i].status === 404 ? "not_found" : "unknown" }));
    const enc = uids.map((u) => h(u.slice(2))).join("");
    const sh = h(kh("OrderCancellations(bytes[] orderUids)") + h(enc)), digest = "0x" + h("1901" + domSep(ch) + sh);
    let nonce = q.nonce != null ? Number(q.nonce) : null; const txs = [];
    for (const u of uids) { const data = sel("invalidateOrder(bytes)") + pad("20") + pad("38") + u.slice(2) + "0".repeat(16); const t = await txbuild({ chain: ch, from: owner, to: SETTLE, data, value: "0", ...(nonce != null ? { nonce: String(nonce) } : {}) }); if (t.body.tx && nonce == null) nonce = t.body.tx.nonce; if (nonce != null) nonce++; txs.push({ uid: u, calldata: data, ...pick(t) }); }
    return ok({ chain: ch, owner: checksum(owner), orders: rows, offchain: { typed_data: { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], OrderCancellations: [{ name: "orderUids", type: "bytes[]" }] }, primaryType: "OrderCancellations", domain: { name: "Gnosis Protocol", version: "v2", chainId: CID[ch], verifyingContract: SETTLE }, message: { orderUids: uids } }, digest, submit: { method: "DELETE", url: "https://api.cow.fi/" + API[ch] + "/api/v1/orders", body: { orderUids: uids, signature: "<0x sig of digest>", signingScheme: "eip712" } } }, onchain_txs: txs, warnings: rows.filter((r) => r.status === "fulfilled").length ? ["some orders already filled — cancel has no effect on them"] : [], note: "Off-chain cancel is free but best-effort; on-chain invalidateOrder is final (costs gas)." });
  } catch (e) { return err(e); }
}
// ---- cowpresign: setPreSignature tx for smart-contract wallets (presign orders) ----
export async function cowpresign(q) {
  const ch = cch(q.chain); if (!ch) return bad("chain: base|ethereum|arbitrum|polygon"); if (!isUid(q.uid)) return bad("uid: 56-byte CoW order UID");
  const owner = "0x" + q.uid.slice(66, 106), on = !/^(false|0|no|revoke)$/i.test(String(q.signed ?? "true"));
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: SETTLE, data: sel("preSignature(bytes)") + pad("20") + pad("38") + q.uid.slice(2) + "0".repeat(16) }, "latest"]], ["eth_call", [{ to: SETTLE, data: sel("filledAmount(bytes)") + pad("20") + pad("38") + q.uid.slice(2) + "0".repeat(16) }, "latest"]], ["eth_getCode", [owner, "latest"]]]);
    const cur = r[0] ? w(r[0], 0) !== 0n : null, filled = r[1] ? w(r[1], 0).toString() : null;
    const data = sel("setPreSignature(bytes,bool)") + pad("40") + pad(on ? "1" : "0") + pad("38") + q.uid.slice(2) + "0".repeat(16);
    const t = await txbuild({ chain: ch, from: owner, to: SETTLE, data, value: "0", ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    const warn = []; if (cur === on) warn.push("presignature already " + (on ? "set" : "cleared")); if (r[2] && r[2] !== "0x") warn.push("owner is a contract — submit via its execution path (e.g. Safe tx) with this calldata");
    return ok({ chain: ch, settlement: SETTLE, uid: q.uid, owner: checksum(owner), currently_presigned: cur, set_to: on, filled_amount: filled, calldata: data, ...pick(t), warnings: warn, note: "Order must be posted to the CoW API with signingScheme=presign, signature=owner address (0x + 20 bytes), then presigned on-chain." });
  } catch (e) { return err(e); }
}
