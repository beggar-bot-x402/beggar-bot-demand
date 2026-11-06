// packb45 (builder B, 2026-11-02): mayanquote, mayanstatus, symbiosisswap, symbiosisstatus. $0 upstream (keyless public RPCs + Mayan + Symbiosis public APIs).
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
import { prep, finish, J, isN, CID, decOut } from "./packb40.js";
const isH = (x) => /^0x[0-9a-fA-F]{64}$/.test(String(x || ""));
const Z = "0x0000000000000000000000000000000000000000", z = (t) => isN(t) ? Z : t;
const NAME = Object.fromEntries(Object.entries(CID).map(([k, v]) => [v, k]));
const WHN = { 1: "solana", 2: "ethereum", 4: "bsc", 5: "polygon", 6: "avalanche", 23: "arbitrum", 24: "optimism", 30: "base" };
// ---- mayanquote: Mayan cross-chain quotes (Swift / MCTP / WH) ----
export async function mayanquote(q) {
  try { const p = await prep({ ...q, from: isA(q.from) ? q.from : "0x0000000000000000000000000000000000000001" }, true); if (p.e) return p.e; const dst = ck(q.destination) || p.ch; if (dst === p.ch) return bad("destination must differ from chain");
    const u = "https://price-api.mayan.finance/v3/quote?amountIn64=" + p.amt + "&fromToken=" + z(p.ti) + "&fromChain=" + p.ch + "&toToken=" + z(p.to) + "&toChain=" + dst + "&swift=true&mctp=true&fastMctp=true&wormhole=true&slippageBps=" + (q.slippage_bps ? p.slip : "auto") + "&sdkVersion=10_0_0";
    const r = await J(u); if (!r.ok || !r.j || !Array.isArray(r.j.quotes) || !r.j.quotes.length) return bad("Mayan quote failed: " + ((r.j && (r.j.msg || r.j.message)) || r.status));
    const qs = r.j.quotes.map((x) => ({ type: x.type, title: x.meta && x.meta.title || null, amount_out: x.expectedAmountOut, min_out: x.minAmountOut, price: x.price, eta_seconds: x.etaSeconds, relayer_fee: x.clientRelayerFeeSuccess ?? x.redeemRelayerFee ?? null, refund_fee: x.clientRelayerFeeRefund ?? x.refundRelayerFee ?? null, max_gas_drop: x.maxUserGasDrop ?? null, gasless: !!x.gasless, has_auction: !!x.hasAuction, deadline: x.deadline64 ? new Date(Number(x.deadline64) * 1000).toISOString() : null, contract: x.mctpMayanContract || x.swiftMayanContract || null }));
    return ok({ chain: p.ch, destination: dst, token_in: checksum(z(p.ti)), token_out: checksum(z(p.to)), amount_in: q.amount, count: qs.length, best: qs[0], quotes: qs, note: "Execute with the Mayan SDK (swapFromEvm) using the chosen quote type; track with /v1/mayanstatus.", source: "price-api.mayan.finance/v3/quote" });
  } catch (e) { return err(e); }
}
// ---- mayanstatus: Mayan swap status by source tx ----
export async function mayanstatus(q) {
  const t = String(q.tx || ""); if (!(isH(t) || /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(t))) return bad("tx (source tx hash) required");
  try { const r = await J("https://explorer-api.mayan.finance/v3/swap/trx/" + t); if (r.status === 404 || !r.j || !r.j.status) return ok({ found: false, tx: t, note: "no Mayan swap for this tx (or not indexed yet)" });
    const x = r.j, done = /SETTLED|COMPLETED|REDEEMED/.test(x.status), refunded = /REFUND/.test(x.status);
    return ok({ found: true, tx: t, status: x.status, done: done || refunded, refunded, order_id: x.orderId || null, trader: x.trader, source_chain: WHN[x.sourceChain] || x.sourceChain, dest_chain: WHN[x.destChain] || x.destChain, dest_address: x.destAddress, from_token: x.fromTokenSymbol, from_amount: x.fromAmount, to_token: x.toTokenSymbol, to_amount: x.toAmount, initiated_at: x.initiatedAt || null, completed_at: x.completedAt || null, insufficient_fees: !!x.insufficientFees, fulfill_tx: x.fulfillTxHash || x.redeemTxHash || null, explorer: "https://explorer.mayan.finance/swap/" + t, source: "explorer-api.mayan.finance" });
  } catch (e) { return err(e); }
}
// ---- symbiosisswap: Symbiosis cross-chain swap tx builder ----
export async function symbiosisswap(q) {
  try { const p = await prep(q, true); if (p.e) return p.e; const dst = ck(q.destination) || p.ch; const rcpt = isA(q.recipient) ? q.recipient : q.from; const dd = await decOut(dst, p.to);
    const r = await J("https://api.symbiosis.finance/crosschain/v1/swap", { method: "POST", body: JSON.stringify({ tokenAmountIn: { address: isN(p.ti) ? "" : p.ti, amount: p.amt.toString(), chainId: CID[p.ch], decimals: p.dec }, tokenOut: { chainId: CID[dst], address: isN(p.to) ? "" : p.to, decimals: dd }, from: q.from, to: rcpt, slippage: p.slip }) });
    if (!r.ok || !r.j || !r.j.tx) return bad("Symbiosis quote failed: " + ((r.j && r.j.message) || r.status));
    const x = r.j, o = x.tokenAmountOut || {}, m = x.tokenAmountOutMin || {}, spender = x.approveTo || x.tx.to;
    return await finish(p.ch, q.from, p.ti, p.amt, spender, { to: x.tx.to, data: x.tx.data, value: x.tx.value || 0 }, { chain: p.ch, destination: dst, aggregator: "symbiosis", token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out: o.amount ? fmt(BigInt(o.amount), o.decimals ?? dd) : null, min_out: m.amount ? fmt(BigInt(m.amount), m.decimals ?? dd) : null, fee: x.fee && x.fee.amount ? fmt(BigInt(x.fee.amount), x.fee.decimals) + " " + x.fee.symbol : null, price_impact_pct: x.priceImpact ?? null, est_seconds: x.estimatedTime ?? null, kind: x.kind || null, recipient: checksum(rcpt), status: "/v1/symbiosisstatus?chain=" + p.ch + "&tx=<hash>", source: "api.symbiosis.finance" });
  } catch (e) { return err(e); }
}
// ---- symbiosisstatus: Symbiosis cross-chain tx status ----
export async function symbiosisstatus(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch) return bad("chain (source) required"); if (!isH(q.tx)) return bad("tx (source tx hash) required");
  try { const r = await J("https://api.symbiosis.finance/crosschain/v1/tx/" + CID[ch] + "/" + q.tx); if (!r.j) return err("Symbiosis " + r.status); const x = r.j, s = x.status || {};
    if (s.code === -1) return ok({ found: false, chain: ch, tx: q.tx, note: "not a Symbiosis tx (or not indexed yet)" });
    const t = x.tx || {}, ti = x.txIn || {}, tk2 = x.tokenAmountOut || x.tokenOut || null;
    return ok({ found: true, chain: ch, tx: q.tx, status_code: s.code, status: s.text, done: s.code === 0 || /success/i.test(s.text || ""), dest_chain_id: t.chainId ?? null, dest_chain: NAME[t.chainId] || null, dest_tx: t.hash || null, in_tx: ti.hash || null, token_out: tk2 && tk2.symbol || null, amount_out: tk2 && tk2.amount != null && tk2.decimals != null ? fmt(BigInt(tk2.amount), tk2.decimals) : null, explorer: "https://explorer.symbiosis.finance/transactions/" + CID[ch] + "/" + q.tx, source: "api.symbiosis.finance/crosschain/v1/tx" });
  } catch (e) { return err(e); }
}
