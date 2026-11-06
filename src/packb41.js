// packb41 (builder B, 2026-11-02): relayquote, relaystatus, dlnorder, dlnstatus. $0 upstream (keyless public RPCs + Relay/deBridge DLN public APIs).
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
import { prep, finish, J, isN, CID, decOut } from "./packb40.js";
const Z = "0x0000000000000000000000000000000000000000", z = (t) => isN(t) ? Z : t;
const isH = (x) => /^0x[0-9a-fA-F]{64}$/.test(String(x || ""));
// ---- relayquote: Relay cross-chain/same-chain quote → executable steps ----
export async function relayquote(q) {
  try { const p = await prep(q, true); if (p.e) return p.e; const dst = ck(q.destination) || p.ch; const rcpt = isA(q.recipient) ? q.recipient : q.from;
    const r = await J("https://api.relay.link/quote", { method: "POST", body: JSON.stringify({ user: q.from, recipient: rcpt, originChainId: CID[p.ch], destinationChainId: CID[dst], originCurrency: z(p.ti), destinationCurrency: z(p.to), amount: p.amt.toString(), tradeType: "EXACT_INPUT", slippageTolerance: String(p.slip) }) });
    if (!r.ok || !r.j || !r.j.steps) return bad("Relay quote failed: " + ((r.j && r.j.message) || r.status));
    const steps = r.j.steps, dep = steps.find((s) => s.id === "deposit" || s.id === "swap") || steps[steps.length - 1], it = dep && dep.items && dep.items[0] && dep.items[0].data;
    if (!it || !it.to) return bad("Relay returned no transaction step (signature-only flows unsupported)");
    const D = r.j.details || {}, F = r.j.fees || {};
    return await finish(p.ch, q.from, p.ti, p.amt, it.to, { to: it.to, data: it.data || "0x", value: it.value || 0, gas: it.gas }, { chain: p.ch, destination: dst, aggregator: "relay", request_id: dep.requestId, token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out: D.currencyOut && D.currencyOut.amountFormatted, amount_out_usd: D.currencyOut && D.currencyOut.amountUsd, min_out_raw: D.currencyOut && D.currencyOut.minimumAmount, relayer_fee_usd: F.relayer && F.relayer.amountUsd, est_seconds: D.timeEstimate, steps: steps.map((s) => s.id), recipient: checksum(rcpt), status: "/v1/relaystatus?request_id=" + dep.requestId, source: "api.relay.link" });
  } catch (e) { return err(e); }
}
// ---- relaystatus: Relay request status ----
export async function relaystatus(q) {
  if (!isH(q.request_id)) return bad("request_id (0x 32-byte) required");
  try { const r = await J("https://api.relay.link/intents/status/v2?requestId=" + q.request_id); if (!r.ok || !r.j) return err("Relay status " + r.status);
    const x = r.j; return ok({ request_id: q.request_id, status: x.status, done: ["success", "failure", "refund"].includes(x.status), in_tx_hashes: x.inTxHashes || [], out_tx_hashes: x.txHashes || [], origin_chain_id: x.originChainId ?? null, destination_chain_id: x.destinationChainId ?? null, updated_at: x.updatedAt ? new Date(x.updatedAt).toISOString() : null, details: x.details || null, explorer: "https://relay.link/transaction/" + q.request_id });
  } catch (e) { return err(e); }
}
// ---- dlnorder: deBridge DLN cross-chain order create-tx ----
export async function dlnorder(q) {
  try { const p = await prep(q, true); if (p.e) return p.e; const dst = ck(q.destination); if (!dst || dst === p.ch) return bad("destination chain (different from chain) required"); const rcpt = isA(q.recipient) ? q.recipient : q.from;
    const u = "https://dln.debridge.finance/v1.0/dln/order/create-tx?srcChainId=" + CID[p.ch] + "&srcChainTokenIn=" + z(p.ti) + "&srcChainTokenInAmount=" + p.amt + "&dstChainId=" + CID[dst] + "&dstChainTokenOut=" + z(p.to) + "&dstChainTokenOutAmount=auto&dstChainTokenOutRecipient=" + rcpt + "&srcChainOrderAuthorityAddress=" + q.from + "&dstChainOrderAuthorityAddress=" + rcpt + "&prependOperatingExpenses=true";
    const r = await J(u); if (!r.ok || !r.j || !r.j.tx) return bad("DLN create-tx failed: " + ((r.j && r.j.errorMessage) || r.status));
    const x = r.j, E = x.estimation || {}, o = E.dstChainTokenOut || {};
    return await finish(p.ch, q.from, p.ti, p.amt, x.tx.allowanceTarget || x.tx.to, { to: x.tx.to, data: x.tx.data, value: x.tx.value || 0, gas: x.tx.gasLimit }, { chain: p.ch, destination: dst, aggregator: "debridge-dln", order_id: x.orderId, token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out_raw: o.amount, amount_out_recommended_raw: o.recommendedAmount, amount_out_usd: o.approximateUsdValue, fix_fee_native_raw: x.fixFee, est_fulfill_sec: x.order && x.order.approximateFulfillmentDelay, recipient: checksum(rcpt), status: "/v1/dlnstatus?order_id=" + x.orderId, warnings: ["tx value includes the DLN fixed protocol fee (" + x.fixFee + " wei native)"], source: "dln.debridge.finance" });
  } catch (e) { return err(e); }
}
// ---- dlnstatus: deBridge DLN order status ----
export async function dlnstatus(q) {
  if (!isH(q.order_id)) return bad("order_id (0x 32-byte) required");
  try { const [s, d] = await Promise.all([J("https://dln.debridge.finance/v1.0/dln/order/" + q.order_id + "/status"), J("https://stats-api.dln.trade/api/Orders/" + q.order_id)]);
    if (!s.ok && !(d.ok && d.j)) return ok({ order_id: q.order_id, found: false, note: (s.j && s.j.errorMessage) || "order not found" });
    const st = (s.j && s.j.status) || (d.j && d.j.state) || null, x = d.ok && d.j ? d.j : {};
    return ok({ order_id: q.order_id, found: true, status: st, done: /Fulfilled|SentUnlock|ClaimedUnlock|Cancelled|ClaimedOrderCancel|SentOrderCancel/i.test(String(st)), fulfilled: /Fulfilled|Unlock/i.test(String(st)), src_chain_id: x.giveOfferWithMetadata && x.giveOfferWithMetadata.chainId && x.giveOfferWithMetadata.chainId.stringValue || null, dst_chain_id: x.takeOfferWithMetadata && x.takeOfferWithMetadata.chainId && x.takeOfferWithMetadata.chainId.stringValue || null, create_tx: x.createdSrcEventMetadata && x.createdSrcEventMetadata.transactionHash && x.createdSrcEventMetadata.transactionHash.stringValue || null, fulfill_tx: x.fulfilledDstEventMetadata && x.fulfilledDstEventMetadata.transactionHash && x.fulfilledDstEventMetadata.transactionHash.stringValue || null, explorer: "https://app.debridge.finance/order?orderId=" + q.order_id, cancel_note: "Unfilled orders can be cancelled from the destination chain by the dst order authority via app.debridge.finance." });
  } catch (e) { return err(e); }
}
