// packb42 (builder B, 2026-11-02): acrossstatus, acrosslimits, cctpmint, cctpfee. $0 upstream (keyless public RPCs + Across app API + Circle Iris).
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
import { J, CID, tk } from "./packb40.js";
const isH = (x) => /^0x[0-9a-fA-F]{64}$/.test(String(x || ""));
const NAME = Object.fromEntries(Object.entries(CID).map(([k, v]) => [v, k]));
const DOM = { ethereum: 0, optimism: 2, arbitrum: 3, base: 6, polygon: 7 }, DN = Object.fromEntries(Object.entries(DOM).map(([k, v]) => [v, k]));
const MT2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const AX = "https://app.across.to/api";
const bytesEnc = (h) => { const s = String(h).replace(/^0x/, ""); const n = s.length / 2; return pad(n.toString(16)) + s.padEnd(Math.ceil(n / 32) * 64, "0"); };
// ---- acrossstatus: Across deposit fill status ----
export async function acrossstatus(q) {
  const tx = q.tx || q.deposit_tx; const hasId = q.deposit_id != null && /^\d+$/.test(String(q.deposit_id));
  if (!isH(tx) && !hasId) return bad("tx (deposit tx hash) or deposit_id + chain required");
  try { let u = AX + "/deposit/status?"; if (isH(tx)) u += "depositTxHash=" + tx; else { const ch = ck(q.chain); if (!ch) return bad("unknown chain"); u += "originChainId=" + CID[ch] + "&depositId=" + q.deposit_id; }
    const r = await J(u); if (r.status === 404 || (r.j && r.j.error === "DepositNotFoundException")) return ok({ found: false, status: "not_indexed", note: "Across indexes deposits within ~1 min; retry shortly", query: isH(tx) ? { tx } : { deposit_id: q.deposit_id } });
    if (!r.ok || !r.j) return err("Across status " + r.status); const x = r.j;
    return ok({ found: true, status: x.status, done: ["filled", "refunded", "expired"].includes(x.status), origin_chain_id: x.originChainId, origin_chain: NAME[x.originChainId] || null, destination_chain_id: x.destinationChainId, destination_chain: NAME[x.destinationChainId] || null, deposit_id: x.depositId, deposit_tx: x.depositTxHash || x.depositTxnRef, fill_tx: x.fillTx || x.fillTxnRef || null, refund_tx: x.depositRefundTxHash || null, explorer: "https://app.across.to/transactions", source: "app.across.to" });
  } catch (e) { return err(e); }
}
// ---- acrosslimits: Across route min/max/instant limits + fee breakdown ----
export async function acrosslimits(q) {
  const ch = ck(q.chain), dst = ck(q.destination); if (!ch || !dst || ch === dst) return bad("chain and a different destination required (ethereum, base, optimism, arbitrum, polygon)");
  const ti = tk(ch, q.token || "USDC"), to = tk(dst, q.token_out || q.token || "USDC"); if (!ti || !to || /^0xEeee/i.test(ti)) return bad("token: USDC, WETH or address (use WETH for ETH)");
  try { const r = await J(AX + "/limits?inputToken=" + ti + "&outputToken=" + to + "&originChainId=" + CID[ch] + "&destinationChainId=" + CID[dst]); if (!r.ok || !r.j || r.j.minDeposit == null) return bad("Across route unsupported: " + ((r.j && r.j.message) || r.status));
    const { results: d } = await rpcBatch(ch, [["eth_call", [{ to: ti, data: "0x313ce567" }, "latest"]]]); const dec = d[0] && d[0].length >= 66 ? Number(w(d[0], 0)) : 18; const x = r.j, f = (v) => v == null ? null : fmt(BigInt(v), dec), F = x.relayerFeeDetails || {};
    return ok({ chain: ch, destination: dst, input_token: checksum(ti), output_token: checksum(to), decimals: dec, min_deposit: f(x.minDeposit), max_deposit: f(x.maxDeposit), max_instant: f(x.maxDepositInstant), max_short_delay: f(x.maxDepositShortDelay), recommended_instant: f(x.recommendedDepositInstant), relay_fee_at_min: f(F.relayFeeTotal), gas_fee: f(F.gasFeeTotal), liquid_reserves: x.reserves ? f(x.reserves.liquidReserves) : null, build: "/v1/acrossdeposit?chain=" + ch + "&destination=" + dst, source: "app.across.to/api/limits" });
  } catch (e) { return err(e); }
}
// ---- cctpmint: build CCTP v2 receiveMessage tx on destination from a source burn tx ----
export async function cctpmint(q) {
  const src = ck(q.chain || q.source); if (!src || DOM[src] == null) return bad("chain (source of the burn) required"); if (!isH(q.tx)) return bad("tx (source burn tx hash) required");
  try { const r = await J("https://iris-api.circle.com/v2/messages/" + DOM[src] + "?transactionHash=" + q.tx); const m = r.j && r.j.messages && r.j.messages[0];
    if (!m) return ok({ ready: false, status: "not_found", note: "Iris has no message for this tx yet (or not a CCTP v2 burn)", chain: src, tx: q.tx });
    const dm = m.decodedMessage || {}, dd = dm.destinationDomain != null ? Number(dm.destinationDomain) : null, dst = DN[dd] || null, bb = dm.decodedMessageBody || {};
    if (m.status !== "complete" || !m.attestation || m.attestation === "PENDING") return ok({ ready: false, status: m.status || "pending", chain: src, destination: dst, amount: bb.amount ? fmt(BigInt(bb.amount), 6) : null, note: "attestation pending; standard transfers take ~13-19 min on Ethereum source, fast ~seconds" });
    const data = "0x57ecfd28" + pad("40") + pad((64 + 32 + Math.ceil((m.message.length - 2) / 64) * 32).toString(16)) + bytesEnc(m.message) + bytesEnc(m.attestation);
    const rc = bb.mintRecipient ? "0x" + String(bb.mintRecipient).slice(-40) : null; let built = null, warnings = [];
    if (!dst) warnings.push("destination domain " + dd + " not supported for tx build; submit calldata manually");
    else if (isA(q.from)) { const t = await txbuild({ chain: dst, from: q.from, to: MT2, data, value: "0", gas: "250000" }); built = pick(t); }
    return ok({ ready: true, chain: src, destination: dst, destination_domain: dd, nonce: dm.nonce || null, amount: bb.amount ? fmt(BigInt(bb.amount), 6) : null, fee_executed: bb.feeExecuted ? fmt(BigInt(bb.feeExecuted), 6) : null, mint_recipient: rc && isA(rc) ? checksum(rc) : null, to: MT2, calldata: data, ...(built || {}), warnings: warnings.concat(isA(q.from) ? [] : ["pass from= to get a signed-ready tx; anyone can relay receiveMessage"]), note: "Reverts if already minted (nonce used) — check /v1/cctpstatus first.", source: "iris-api.circle.com v2" });
  } catch (e) { return err(e); }
}
// ---- cctpfee: CCTP v2 fast vs standard fee matrix ----
export async function cctpfee(q) {
  const src = q.chain ? ck(q.chain) : null; if (!src || DOM[src] == null) return bad("chain required (ethereum, base, optimism, arbitrum, polygon)");
  const dests = q.destination ? [ck(q.destination)] : Object.keys(DOM).filter((c) => c !== src); if (dests.some((d) => !d || DOM[d] == null || d === src)) return bad("destination must be a different supported chain");
  const amt = q.amount != null ? Number(q.amount) : null; if (amt != null && !(amt > 0)) return bad("amount must be positive USDC");
  try { const rows = await Promise.all(dests.map(async (d) => { const r = await J("https://iris-api.circle.com/v2/burn/USDC/fees/" + DOM[src] + "/" + DOM[d]); const a = Array.isArray(r.j) ? r.j : [];
      const fast = a.find((x) => x.finalityThreshold <= 1000), std = a.find((x) => x.finalityThreshold >= 2000);
      const c = (x) => x ? { fee_bps: x.minimumFee, finality_threshold: x.finalityThreshold, ...(amt != null ? { fee_usdc: +(amt * x.minimumFee / 1e4).toFixed(6), receive_usdc: +(amt - amt * x.minimumFee / 1e4).toFixed(6) } : {}) } : null;
      return { destination: d, domain: DOM[d], fast: c(fast), standard: c(std) }; }));
    return ok({ chain: src, domain: DOM[src], amount: amt, routes: rows, eta: { fast: "~8-20s", standard: src === "ethereum" ? "~13-19 min" : "~15-20s (L2 soft) to minutes" }, build: "/v1/cctpburn?chain=" + src, source: "iris-api.circle.com/v2/burn/USDC/fees" });
  } catch (e) { return err(e); }
}
