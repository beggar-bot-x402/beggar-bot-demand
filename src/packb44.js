// packb44 (builder B, 2026-11-02): whstatus, whvaa, axelarstatus, axelargas. $0 upstream (Wormholescan + Axelarscan public APIs).
import { J } from "./packb40.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const txOk = (t) => /^(0x)?[0-9a-fA-F]{64}$/.test(String(t || "")) || /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(String(t || ""));
const WC = { 1: "solana", 2: "ethereum", 4: "bsc", 5: "polygon", 6: "avalanche", 10: "fantom", 13: "klaytn", 14: "celo", 16: "moonbeam", 21: "sui", 22: "aptos", 23: "arbitrum", 24: "optimism", 30: "base", 34: "scroll", 35: "mantle", 38: "linea", 40: "sei", 44: "unichain", 47: "hyperevm", 48: "monad", 51: "fogo" };
const WS = "https://api.wormholescan.io/api/v1";
const b64hex = (s) => { const b = atob(s); let h = ""; for (let i = 0; i < b.length; i++) h += b.charCodeAt(i).toString(16).padStart(2, "0"); return "0x" + h; };
const opsFor = async (tx) => { const t = String(tx); const r = await J(WS + "/operations?txHash=" + t); if (r.ok && r.j && r.j.operations && r.j.operations.length) return r.j.operations; if (/^0x/i.test(t)) { const r2 = await J(WS + "/operations?txHash=" + t.slice(2)); if (r2.ok && r2.j && r2.j.operations) return r2.j.operations; } return []; };
// ---- whstatus: Wormhole message/transfer status by source tx ----
export async function whstatus(q) {
  if (!txOk(q.tx)) return bad("tx (source tx hash, EVM 0x… or Solana base58) required");
  try { const ops = await opsFor(q.tx); if (!ops.length) return ok({ found: false, tx: q.tx, note: "no Wormhole message for this tx (or not indexed yet)" });
    const msgs = ops.map((o) => { const sp = (o.content && o.content.standarizedProperties) || {}, sc = o.sourceChain || {}, tc = o.targetChain || null;
      return { id: o.id, emitter_chain: o.emitterChain, emitter_chain_name: WC[o.emitterChain] || null, sequence: o.sequence, app: (sp.appIds || []).join(",") || null, from_chain: WC[sp.fromChain] || sp.fromChain || null, to_chain: WC[sp.toChain] || sp.toChain || null, to_address: sp.toAddress || null, token_address: sp.tokenAddress || null, amount_raw: sp.amount || null, normalized_decimals: sp.normalizedDecimals ?? null, source_tx: sc.transaction && sc.transaction.txHash, source_status: sc.status || null, source_time: sc.timestamp || null, vaa_signed: !!(o.vaa && o.vaa.raw), redeemed: !!(tc && tc.status === "completed"), target_status: tc ? tc.status : null, target_tx: tc && tc.transaction ? tc.transaction.txHash : null, target_time: tc ? tc.timestamp : null };
    });
    return ok({ found: true, tx: q.tx, count: msgs.length, all_redeemed: msgs.every((m) => m.redeemed), messages: msgs, vaa: "/v1/whvaa?tx=" + q.tx, explorer: "https://wormholescan.io/#/tx/" + q.tx, source: "api.wormholescan.io" });
  } catch (e) { return err(e); }
}
// ---- whvaa: signed VAA bytes for redemption ----
export async function whvaa(q) {
  if (!txOk(q.tx) && !q.id) return bad("tx (source tx hash) or id (chain/emitter/sequence) required");
  try { let ops; if (q.id) { if (!/^\d+\/[0-9a-fA-F]{64}\/\d+$/.test(String(q.id))) return bad("id must be chain/emitterHex/sequence"); const r = await J(WS + "/operations/" + q.id); ops = r.ok && r.j ? [r.j] : []; } else ops = await opsFor(q.tx);
    if (!ops.length) return ok({ found: false, ready: false, note: "no Wormhole message found (or not indexed yet)" });
    const v = ops.map((o) => { const raw = o.vaa && o.vaa.raw; const hx = raw ? b64hex(raw) : null; const n = hx ? parseInt(hx.slice(12, 14), 16) : null;
      return { id: o.id, ready: !!raw, guardian_set_index: o.vaa ? o.vaa.guardianSetIndex : null, signatures: n, vaa_hex: hx, vaa_base64: raw || null, bytes: hx ? (hx.length - 2) / 2 : 0, redeemed: !!(o.targetChain && o.targetChain.status === "completed") }; });
    return ok({ found: true, ready: v.every((x) => x.ready), vaas: v, note: "Submit vaa_hex to the target chain's receiver (e.g. TokenBridge completeTransfer / NTT receiveMessage). Reverts if already redeemed.", source: "api.wormholescan.io" });
  } catch (e) { return err(e); }
}
// ---- axelarstatus: Axelar GMP / ITS status by source tx ----
export async function axelarstatus(q) {
  if (!txOk(q.tx) && !q.message_id) return bad("tx (source tx hash) or message_id required");
  try { const r = await J("https://api.axelarscan.io/gmp/searchGMP", { method: "POST", body: JSON.stringify(q.message_id ? { messageId: q.message_id, size: 10 } : { txHash: q.tx, size: 10 }) });
    if (!r.ok || !r.j) return err("Axelarscan " + r.status); const d = r.j.data || []; if (!d.length) return ok({ found: false, tx: q.tx || null, note: "no Axelar GMP call for this tx (or not indexed yet)" });
    const calls = d.map((x) => { const c = x.call || {}, rv = c.returnValues || {}, ex = x.executed || {}, g = x.gas_paid || {};
      return { message_id: x.message_id || x.id, status: x.status, simplified_status: x.simplified_status, source_chain: c.chain, destination_chain: rv.destinationChain || null, destination_contract: rv.destinationContractAddress || null, sender: rv.sender || null, symbol: x.symbol || null, amount: x.amount ?? null, value_usd: x.value ?? null, gas_paid: !!x.gas_paid, insufficient_fee: !!x.is_insufficient_fee, source_tx: c.transactionHash, executed_tx: ex.transactionHash || (ex.receipt && ex.receipt.transactionHash) || null, time_spent_s: x.time_spent ? x.time_spent.total ?? null : null, error: x.error ? String(x.error.message || x.error).slice(0, 300) : null };
    });
    return ok({ found: true, count: calls.length, all_executed: calls.every((c) => c.status === "executed"), calls, explorer: "https://axelarscan.io/gmp/" + (q.tx || q.message_id), source: "api.axelarscan.io/gmp/searchGMP" });
  } catch (e) { return err(e); }
}
// ---- axelargas: Axelar cross-chain gas fee estimate ----
export async function axelargas(q) {
  const s = String(q.chain || "").toLowerCase(), d = String(q.destination || "").toLowerCase(); if (!s || !d || s === d) return bad("chain and a different destination required (Axelar names: ethereum, base, arbitrum, optimism, polygon, avalanche, binance…)");
  const gl = String(q.gas_limit ?? 200000); if (!/^\d+$/.test(gl)) return bad("gas_limit must be an integer");
  try { const r = await J("https://api.axelarscan.io/gmp/estimateGasFee", { method: "POST", body: JSON.stringify({ sourceChain: s, destinationChain: d, gasLimit: gl, gasMultiplier: "auto", showDetailedFees: true }) });
    if (!r.ok || r.j == null || (r.j && r.j.error)) return bad("Axelar estimate failed: " + ((r.j && (r.j.message || r.j.error)) || r.status));
    const x = r.j, wei = typeof x === "object" ? x.executionFeeWithMultiplier ?? x.totalFee ?? null : x; const tot = typeof x === "object" && x.baseFee != null && wei != null ? (BigInt(x.baseFee) + BigInt(wei)).toString() : String(wei);
    return ok({ chain: s, destination: d, gas_limit: Number(gl), fee_wei: tot, fee_native: tot && /^\d+$/.test(tot) ? Number(BigInt(tot)) / 1e18 : null, details: typeof x === "object" ? { base_fee: x.baseFee ?? null, execution_fee: x.executionFee ?? null, execution_fee_with_multiplier: x.executionFeeWithMultiplier ?? null, l1_execution_fee: x.l1ExecutionFeeWithMultiplier ?? null, source_token: x.sourceToken ? x.sourceToken.symbol : null, gas_multiplier: x.gasMultiplier ?? null } : null, note: "Pay as msg.value to AxelarGasService.payNativeGasForContractCall on the source chain (fee assumes 18-decimal native).", source: "api.axelarscan.io/gmp/estimateGasFee" });
  } catch (e) { return err(e); }
}
