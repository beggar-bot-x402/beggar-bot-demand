// packb43 (builder B, 2026-11-02): lifistatus, lifiroutes, lifirefuel, lzmessage. $0 upstream (keyless public RPCs + LI.FI + LayerZero Scan public APIs).
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
import { J, CID, tk, isN } from "./packb40.js";
const isH = (x) => /^0x[0-9a-fA-F]{64}$/.test(String(x || ""));
const NAME = Object.fromEntries(Object.entries(CID).map(([k, v]) => [v, k]));
const Z = "0x0000000000000000000000000000000000000000", z = (t) => isN(t) ? Z : t;
const LQ = "https://li.quest/v1";
const side = (s) => s ? { chain_id: s.chainId, chain: NAME[s.chainId] || null, tx: s.txHash || null, link: s.txLink || null, token: s.token ? s.token.symbol : null, amount: s.amount && s.token ? fmt(BigInt(s.amount), s.token.decimals) : null, amount_usd: s.amountUSD ?? null, timestamp: s.timestamp ? new Date(s.timestamp * 1000).toISOString() : null } : null;
// ---- lifistatus: LI.FI cross-chain transfer status ----
export async function lifistatus(q) {
  if (!isH(q.tx)) return bad("tx (source tx hash) required");
  try { const r = await J(LQ + "/status?txHash=" + q.tx + (q.bridge ? "&bridge=" + encodeURIComponent(q.bridge) : ""));
    if (r.status === 404 || (r.j && r.j.code === 1011) || (r.j && r.j.status === "NOT_FOUND")) return ok({ found: false, status: "NOT_FOUND", tx: q.tx, note: "not a LI.FI-routed tx, or not indexed yet" });
    if (!r.ok || !r.j) return err("LI.FI status " + r.status); const x = r.j;
    return ok({ found: true, status: x.status, substatus: x.substatus || null, message: x.substatusMessage || null, done: ["DONE", "FAILED", "INVALID"].includes(x.status), tool: x.tool || null, sending: side(x.sending), receiving: side(x.receiving), explorer: x.lifiExplorerLink || "https://scan.li.fi/tx/" + q.tx, source: "li.quest/v1/status" });
  } catch (e) { return err(e); }
}
// ---- lifiroutes: ranked cross-chain routes (cheapest/fastest) ----
export async function lifiroutes(q) {
  const ch = ck(q.chain), dst = ck(q.destination); if (!ch || !dst) return bad("chain and destination required");
  const from = isA(q.from) ? q.from : "0x0000000000000000000000000000000000000001";
  const ti = tk(ch, q.token_in || "USDC"), to = tk(dst, q.token_out || q.token_in || "USDC"); if (!ti || !to) return bad("token_in/token_out: address, ETH, USDC or WETH");
  try { const { results: d } = await rpcBatch(ch, [isN(ti) ? ["eth_chainId", []] : ["eth_call", [{ to: ti, data: "0x313ce567" }, "latest"]]]); const dec = isN(ti) ? 18 : d[0] && d[0].length >= 66 ? Number(w(d[0], 0)) : null; if (dec == null) return bad("token_in decimals() failed");
    const amt = toUnits(q.amount, dec); if (!amt) return bad("amount (human units of token_in) required");
    const r = await J(LQ + "/advanced/routes", { method: "POST", body: JSON.stringify({ fromChainId: CID[ch], toChainId: CID[dst], fromTokenAddress: z(ti), toTokenAddress: z(to), fromAmount: amt.toString(), fromAddress: from, options: { slippage: Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 2000) / 1e4, order: "CHEAPEST" } }) });
    if (!r.ok || !r.j || !Array.isArray(r.j.routes)) return bad("LI.FI routes failed: " + ((r.j && r.j.message) || r.status));
    const routes = r.j.routes.slice(0, Math.min(Number(q.limit) || 8, 15)).map((x) => { const s = x.steps || [], dur = s.reduce((a, t) => a + ((t.estimate && t.estimate.executionDuration) || 0), 0), fees = s.flatMap((t) => (t.estimate && t.estimate.feeCosts) || []).reduce((a, f) => a + Number(f.amountUSD || 0), 0), gas = s.flatMap((t) => (t.estimate && t.estimate.gasCosts) || []).reduce((a, f) => a + Number(f.amountUSD || 0), 0);
      return { tools: s.map((t) => t.tool), tags: x.tags || [], amount_out: x.toToken ? fmt(BigInt(x.toAmount), x.toToken.decimals) : x.toAmount, min_out: x.toToken ? fmt(BigInt(x.toAmountMin), x.toToken.decimals) : x.toAmountMin, amount_out_usd: x.toAmountUSD, fee_usd: +fees.toFixed(4), gas_usd: +gas.toFixed(4), est_seconds: dur }; });
    return ok({ chain: ch, destination: dst, token_in: checksum(isN(ti) ? Z : ti), token_out: checksum(isN(to) ? Z : to), amount_in: q.amount, count: routes.length, cheapest: routes[0] || null, fastest: routes.slice().sort((a, b) => a.est_seconds - b.est_seconds)[0] || null, routes, build: "/v1/lifiquote", source: "li.quest/v1/advanced/routes" });
  } catch (e) { return err(e); }
}
// ---- lifirefuel: destination gas suggestion for a bridge ----
export async function lifirefuel(q) {
  const dst = ck(q.destination || q.chain); if (!q.destination || !dst) return bad("destination chain required"); const src = q.chain ? ck(q.chain) : null; if (q.chain && !src) return bad("unknown chain");
  try { const r = await J(LQ + "/gas/suggestion/" + CID[dst] + (src ? "?fromChain=" + CID[src] + "&fromToken=" + encodeURIComponent(q.token || "USDC") : ""));
    if (!r.ok || !r.j || !r.j.recommended) return bad("LI.FI gas suggestion unavailable: " + ((r.j && r.j.message) || r.status)); const x = r.j, a = (o) => o && o.token ? { symbol: o.token.symbol, amount: fmt(BigInt(o.amount), o.token.decimals), amount_usd: o.amountUsd ?? null } : null;
    const { results: g } = await rpcBatch(dst, [["eth_gasPrice", []]]); const gp = g[0] ? Number(BigInt(g[0])) / 1e9 : null;
    return ok({ destination: dst, chain: src, recommended_gas: a(x.recommended), limit: a(x.limit), serviceable: x.serviceable ?? null, from_amount_needed: x.fromAmount && x.fromToken ? fmt(BigInt(x.fromAmount), x.fromToken.decimals) + " " + x.fromToken.symbol : null, destination_gas_price_gwei: gp, note: "Amount of native gas to bring to the destination so the recipient can transact; add via LI.FI fromAmountForGas or a refuel bridge.", source: "li.quest/v1/gas/suggestion" });
  } catch (e) { return err(e); }
}
// ---- lzmessage: LayerZero message status by source tx hash ----
export async function lzmessage(q) {
  if (!isH(q.tx)) return bad("tx (source tx hash) required");
  try { const r = await J("https://scan.layerzero-api.com/v1/messages/tx/" + q.tx); if (r.status === 404 || (r.j && r.j.code === 4040)) return ok({ found: false, tx: q.tx, note: "no LayerZero message for this tx (or not indexed yet)" });
    if (!r.ok || !r.j || !Array.isArray(r.j.data)) return err("LayerZero scan " + r.status);
    const msgs = r.j.data.map((m) => ({ guid: m.guid || null, status: m.status && m.status.name || null, status_message: m.status && m.status.message || null, src_eid: m.pathway && m.pathway.srcEid, dst_eid: m.pathway && m.pathway.dstEid, src_chain: m.pathway && m.pathway.sender && m.pathway.sender.chain, dst_chain: m.pathway && m.pathway.receiver && m.pathway.receiver.chain, app: m.pathway && m.pathway.sender && (m.pathway.sender.name || m.pathway.sender.id) || null, sender: m.pathway && m.pathway.sender && m.pathway.sender.address, receiver: m.pathway && m.pathway.receiver && m.pathway.receiver.address, nonce: m.pathway && m.pathway.nonce, source_status: m.source && m.source.status, destination_status: m.destination && m.destination.status, destination_tx: m.destination && m.destination.tx && m.destination.tx.txHash || null, verification: m.verification && m.verification.dvn ? m.verification.dvn.status : null, created: m.created || null, updated: m.updated || null }));
    return ok({ found: msgs.length > 0, tx: q.tx, count: msgs.length, delivered: msgs.length > 0 && msgs.every((m) => m.status === "DELIVERED"), messages: msgs, explorer: "https://layerzeroscan.com/tx/" + q.tx, source: "scan.layerzero-api.com" });
  } catch (e) { return err(e); }
}
