// packb40 (builder B, 2026-11-02): kyberswap, veloraswap, lifiquote, swapbest. $0 upstream (keyless public RPCs + KyberSwap/Velora/LI.FI public APIs).
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
const NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const CID = { ethereum: 1, base: 8453, optimism: 10, arbitrum: 42161, polygon: 137 }, KY = { ethereum: "ethereum", base: "base", optimism: "optimism", arbitrum: "arbitrum", polygon: "polygon" };
const tk = (ch, t) => { const s = String(t || "").trim(); if (isA(s)) return s; const u = s.toUpperCase(); return u === "ETH" || (u === "POL" && ch === "polygon") ? NATIVE : u === "USDC" ? USDC[ch] : u === "WETH" ? WETH[ch] : null; };
const isN = (t) => t.toLowerCase() === NATIVE.toLowerCase();
const J = async (u, init) => { const r = await fetch(u, { ...init, headers: { "content-type": "application/json", accept: "application/json", "x-client-id": "beggarbot", ...(init && init.headers) } }); const j = await r.json().catch(() => null); return { ok: r.ok, status: r.status, j }; };
async function prep(q, multi) {
  const ch = ck(q.chain); if (!ch) return { e: bad("unknown chain") }; if (!isA(q.from)) return { e: bad("from address required") };
  const ti = tk(ch, q.token_in), to = tk(multi ? ck(q.destination) || ch : ch, q.token_out); if (!ti || !to) return { e: bad("token_in/token_out: address, ETH, USDC or WETH") };
  const { results: d } = await rpcBatch(ch, [isN(ti) ? ["eth_chainId", []] : ["eth_call", [{ to: ti, data: "0x313ce567" }, "latest"]]]);
  const dec = isN(ti) ? 18 : d[0] && d[0].length >= 66 ? Number(w(d[0], 0)) : null; if (dec == null) return { e: bad("token_in decimals() failed") };
  const amt = toUnits(q.amount, dec); if (!amt) return { e: bad("amount (human units of token_in) required") };
  const slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 2000);
  return { ch, ti, to, dec, amt, slip };
}
async function finish(ch, from, ti, amt, spender, tx, extra) {
  const warn = []; let approval = null;
  if (!isN(ti)) { const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: ti, data: "0xdd62ed3e" + pad(from) + pad(spender) }, "latest"]], ["eth_call", [{ to: ti, data: "0x70a08231" + pad(from) }, "latest"]]]);
    if (r[1] && w(r[1], 0) < amt) warn.push("insufficient token_in balance");
    if (r[0] && w(r[0], 0) < amt) { const ad = "0x095ea7b3" + pad(spender) + pad(amt.toString(16)); const at = await txbuild({ chain: ch, from, to: ti, data: ad, value: "0" }); approval = { to: checksum(ti), spender: checksum(spender), calldata: ad, ...pick(at) }; warn.push("approve the router first"); } }
  const t = await txbuild({ chain: ch, from, to: tx.to, data: tx.data, value: String(BigInt(tx.value || 0)), ...(approval && approval.tx ? { nonce: String(approval.tx.nonce + 1), gas: String(tx.gas || 400000) } : {}) });
  return ok({ ...extra, router: checksum(tx.to), approval_tx: approval, calldata_bytes: (tx.data.length - 2) / 2, ...pick(t), warnings: warn.concat(extra.warnings || []), note: "Aggregator quotes expire in ~30-60s: build, sign and send promptly." });
}
async function kyQ(p, from) { const r = await J("https://aggregator-api.kyberswap.com/" + KY[p.ch] + "/api/v1/routes?tokenIn=" + p.ti + "&tokenOut=" + p.to + "&amountIn=" + p.amt); return r.ok && r.j && r.j.data && r.j.data.routeSummary ? r.j.data : null; }
async function veQ(p, dd) { const r = await J("https://api.paraswap.io/prices?srcToken=" + p.ti + "&destToken=" + p.to + "&amount=" + p.amt + "&srcDecimals=" + p.dec + "&destDecimals=" + dd + "&side=SELL&network=" + CID[p.ch] + "&version=6.2"); return r.ok && r.j && r.j.priceRoute ? r.j.priceRoute : null; }
async function decOut(ch, t) { if (isN(t)) return 18; const { results: d } = await rpcBatch(ch, [["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]]]); return d[0] && d[0].length >= 66 ? Number(w(d[0], 0)) : 18; }
// ---- kyberswap: KyberSwap aggregator route → build → tx ----
export async function kyberswap(q) {
  try { const p = await prep(q); if (p.e) return p.e; const rcpt = isA(q.recipient) ? q.recipient : q.from;
    const d = await kyQ(p); if (!d) return bad("KyberSwap found no route");
    const b = await J("https://aggregator-api.kyberswap.com/" + KY[p.ch] + "/api/v1/route/build", { method: "POST", body: JSON.stringify({ routeSummary: d.routeSummary, sender: q.from, recipient: rcpt, slippageTolerance: p.slip }) });
    if (!b.ok || !b.j || !b.j.data) return bad("KyberSwap build failed: " + ((b.j && b.j.message) || b.status));
    const x = b.j.data, dd = await decOut(p.ch, p.to);
    return await finish(p.ch, q.from, p.ti, p.amt, x.routerAddress, { to: x.routerAddress, data: x.data, value: x.transactionValue || (isN(p.ti) ? p.amt : 0), gas: x.gas }, { chain: p.ch, aggregator: "kyberswap", token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out: fmt(BigInt(x.amountOut), dd), amount_out_usd: x.amountOutUsd, min_out_raw: (BigInt(x.amountOut) * BigInt(10000 - p.slip) / 10000n).toString(), slippage_bps: p.slip, recipient: checksum(rcpt), source: "aggregator-api.kyberswap.com" });
  } catch (e) { return err(e); }
}
// ---- veloraswap: Velora (ParaSwap) prices → transactions → tx ----
export async function veloraswap(q) {
  try { const p = await prep(q); if (p.e) return p.e; const rcpt = isA(q.recipient) ? q.recipient : q.from; const dd = await decOut(p.ch, p.to);
    const pr = await veQ(p, dd); if (!pr) return bad("Velora found no route");
    const b = await J("https://api.paraswap.io/transactions/" + CID[p.ch] + "?ignoreChecks=true", { method: "POST", body: JSON.stringify({ srcToken: p.ti, destToken: p.to, srcAmount: p.amt.toString(), srcDecimals: p.dec, destDecimals: dd, slippage: p.slip, priceRoute: pr, userAddress: q.from, receiver: rcpt }) });
    if (!b.ok || !b.j || !b.j.data) return bad("Velora build failed: " + ((b.j && b.j.error) || b.status));
    return await finish(p.ch, q.from, p.ti, p.amt, pr.tokenTransferProxy || pr.contractAddress, { to: b.j.to, data: b.j.data, value: b.j.value, gas: b.j.gas }, { chain: p.ch, aggregator: "velora", token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out: fmt(BigInt(pr.destAmount), dd), amount_out_usd: pr.destUSD, min_out_raw: (BigInt(pr.destAmount) * BigInt(10000 - p.slip) / 10000n).toString(), slippage_bps: p.slip, recipient: checksum(rcpt), source: "api.paraswap.io" });
  } catch (e) { return err(e); }
}
// ---- lifiquote: LI.FI cross-chain/same-chain swap+bridge quote → tx ----
export async function lifiquote(q) {
  try { const p = await prep(q, true); if (p.e) return p.e; const dst = ck(q.destination) || p.ch; const rcpt = isA(q.recipient) ? q.recipient : q.from;
    const z = (t) => isN(t) ? "0x0000000000000000000000000000000000000000" : t;
    const r = await J("https://li.quest/v1/quote?fromChain=" + CID[p.ch] + "&toChain=" + CID[dst] + "&fromToken=" + z(p.ti) + "&toToken=" + z(p.to) + "&fromAmount=" + p.amt + "&fromAddress=" + q.from + "&toAddress=" + rcpt + "&slippage=" + p.slip / 10000 + "&integrator=beggarbot");
    if (!r.ok || !r.j || !r.j.transactionRequest) return bad("LI.FI quote failed: " + ((r.j && r.j.message) || r.status));
    const x = r.j, e = x.estimate, tr = x.transactionRequest;
    return await finish(p.ch, q.from, p.ti, p.amt, e.approvalAddress || tr.to, { to: tr.to, data: tr.data, value: tr.value, gas: tr.gasLimit ? BigInt(tr.gasLimit).toString() : null }, { chain: p.ch, destination: dst, aggregator: "lifi", tool: x.tool, token_in: p.ti, token_out: p.to, amount_in: q.amount, amount_out_raw: e.toAmount, min_out_raw: e.toAmountMin, amount_out_usd: e.toAmountUSD, fee_costs: (e.feeCosts || []).map((f) => ({ name: f.name, usd: f.amountUSD })), est_duration_sec: e.executionDuration, recipient: checksum(rcpt), status_url: "https://li.quest/v1/status?txHash=<hash>", source: "li.quest" });
  } catch (e) { return err(e); }
}
// ---- swapbest: compare KyberSwap / Velora / LI.FI / CoW quotes for the same swap ----
export async function swapbest(q) {
  try { const p = await prep(q); if (p.e) return p.e; const dd = await decOut(p.ch, p.to); const z = (t) => isN(t) ? "0x0000000000000000000000000000000000000000" : t;
    const COW = { ethereum: "mainnet", base: "base", arbitrum: "arbitrum_one", polygon: "polygon" };
    const tasks = { kyberswap: kyQ(p).then((d) => d && BigInt(d.routeSummary.amountOut)), velora: veQ(p, dd).then((x) => x && BigInt(x.destAmount)),
      lifi: J("https://li.quest/v1/quote?fromChain=" + CID[p.ch] + "&toChain=" + CID[p.ch] + "&fromToken=" + z(p.ti) + "&toToken=" + z(p.to) + "&fromAmount=" + p.amt + "&fromAddress=" + q.from + "&integrator=beggarbot").then((r) => r.ok && r.j && r.j.estimate ? BigInt(r.j.estimate.toAmount) : null),
      cow: COW[p.ch] && !isN(p.ti) ? J("https://api.cow.fi/" + COW[p.ch] + "/api/v1/quote", { method: "POST", body: JSON.stringify({ sellToken: p.ti, buyToken: isN(p.to) ? WETH[p.ch] : p.to, from: q.from, kind: "sell", sellAmountBeforeFee: p.amt.toString(), signingScheme: "eip712", appData: "{}" }) }).then((r) => r.ok && r.j && r.j.quote ? BigInt(r.j.quote.buyAmount) : null) : Promise.resolve(null) };
    const ks = Object.keys(tasks), vs = await Promise.allSettled(Object.values(tasks));
    const rows = ks.map((k, i) => ({ aggregator: k, amount_out: vs[i].status === "fulfilled" && vs[i].value ? fmt(vs[i].value, dd) : null, raw: vs[i].status === "fulfilled" && vs[i].value ? vs[i].value : null, error: vs[i].status === "rejected" ? String(vs[i].reason && vs[i].reason.message || vs[i].reason) : vs[i].value ? null : "no quote" })).sort((a, b) => (b.raw || 0n) > (a.raw || 0n) ? 1 : (b.raw || 0n) < (a.raw || 0n) ? -1 : 0);
    const best = rows[0] && rows[0].raw ? rows[0] : null;
    const out = rows.map((r) => ({ aggregator: r.aggregator, amount_out: r.amount_out, vs_best_bps: best && r.raw ? Number((best.raw - r.raw) * 10000n / best.raw) : null, error: r.error }));
    const build = { kyberswap: "/v1/kyberswap", velora: "/v1/veloraswap", lifi: "/v1/lifiquote", cow: "/v1/cowquote" };
    return ok({ chain: p.ch, token_in: p.ti, token_out: p.to, amount_in: q.amount, best: best ? best.aggregator : null, quotes: out, build_with: best ? build[best.aggregator] : null, note: "CoW quote is gasless (fee already netted); others exclude your gas cost." });
  } catch (e) { return err(e); }
}
export { prep, finish, J, tk, isN, CID, decOut };
