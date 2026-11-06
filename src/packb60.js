// packb60 (builder B, 2026-11-02): Morpho Blue + MetaMorpho on-chain: borrower position/health, single market with IRM APYs, vault allocations, vault holder position. $0 upstream (keyless RPCs).
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
const MB = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb", CH = ["ethereum", "base"], YR = 31536000;
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], W = (h, i = 0) => (h && h.length >= 66 + 64 * i ? w(h, i) : null), A = (a) => pad(a.slice(2).toLowerCase()), ad = (h, i = 0) => checksum("0x" + h.slice(2 + 64 * i + 24, 66 + 64 * i));
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain); return CH.includes(c) ? c : null; };
const idq = (x) => (/^0x[0-9a-fA-F]{64}$/.test(String(x || "")) ? x.toLowerCase() : null);
const str = (h) => { try { if (!h || h.length < 130) return null; const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
async function meta(ch, ads) { const r = (await rpcBatch(ch, ads.flatMap((a) => [call(a, "0x313ce567"), call(a, "0x95d89b41")]))).results; return ads.map((a, i) => ({ address: checksum(a), decimals: Number(W(r[2 * i]) ?? 18n), symbol: str(r[2 * i + 1]) })); }
async function markets(ch, ids) { const r = (await rpcBatch(ch, ids.flatMap((id) => [call(MB, sel("idToMarketParams(bytes32)") + id.slice(2)), call(MB, sel("market(bytes32)") + id.slice(2))]))).results;
  return ids.map((id, i) => { const p = r[2 * i], m = r[2 * i + 1]; if (!p || p.length < 2 + 64 * 5 || /^0x0+$/.test(p)) return null; return { id, loan: ad(p, 0), coll: ad(p, 1), oracle: ad(p, 2), irm: ad(p, 3), lltv: W(p, 4), pRaw: p.slice(2), mRaw: m.slice(2), tsa: W(m, 0), tss: W(m, 1), tba: W(m, 2), tbs: W(m, 3), last: Number(W(m, 4)), fee: W(m, 5) }; }); }
async function enrich(ch, mk) { const ok2 = mk.filter(Boolean), sig = sel("borrowRateView((address,address,address,address,uint256),(uint128,uint128,uint128,uint128,uint128,uint128))");
  const r = (await rpcBatch(ch, ok2.flatMap((m) => [/^0x0{40}$/i.test(m.irm) ? call(MB, "0x") : call(m.irm, sig + m.pRaw + m.mRaw), /^0x0{40}$/i.test(m.oracle) ? call(MB, "0x") : call(m.oracle, sel("price()"))]))).results;
  const toks = [...new Set(ok2.flatMap((m) => [m.loan, m.coll]).filter((a) => !/^0x0{40}$/i.test(a)))], md = Object.fromEntries((await meta(ch, toks)).map((t) => [t.address, t]));
  return ok2.map((m, i) => { const br = W(r[2 * i]), u = m.tsa ? Number(m.tba) / Number(m.tsa) : 0, bApy = br != null ? Math.exp(Number(br) / 1e18 * YR) - 1 : null, f = Number(m.fee) / 1e18, L = md[m.loan] || { decimals: 18 }, C = md[m.coll] || { decimals: 18 }, op = W(r[2 * i + 1]);
    return { ...m, L, C, util: u, borrow_apy: bApy, supply_apy: bApy != null ? bApy * u * (1 - f) : null, feeF: f, priceRaw: op, price: op != null ? Number(op) / 10 ** (36 + L.decimals - C.decimals) : null }; }); }
const pub = (m) => ({ market_id: m.id, loan_token: m.L, collateral_token: m.C, oracle: m.oracle, irm: m.irm, lltv: Number(m.lltv) / 1e18, total_supply: fmt(m.tsa, m.L.decimals), total_borrow: fmt(m.tba, m.L.decimals), liquidity: fmt(m.tsa - m.tba, m.L.decimals), utilization: m.util, borrow_apy: m.borrow_apy, supply_apy: m.supply_apy, fee: m.feeF, oracle_price_loan_per_collateral: m.price, last_update: m.last });
export async function morphomarket(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); const id = idq(q.market_id || q.market); if (!id) return bad("market_id (bytes32) required");
  try { const [m] = await markets(ch, [id]); if (!m) return bad("market not found"); const [e] = await enrich(ch, [m]); return ok({ chain: ch, ...pub(e), source: "Morpho Blue + IRM borrowRateView + oracle eth_call" }); } catch (e) { return err(e); }
}
export async function morphoposition(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); const id = idq(q.market_id || q.market); if (!id) return bad("market_id (bytes32) required"); if (!isA(q.address)) return bad("address required");
  try { const [[m], pr] = await Promise.all([markets(ch, [id]), rpcBatch(ch, [call(MB, sel("position(bytes32,address)") + id.slice(2) + A(q.address))])]); if (!m) return bad("market not found"); const [e] = await enrich(ch, [m]), p = pr.results[0];
    const ss = W(p, 0) ?? 0n, bs = W(p, 1) ?? 0n, col = W(p, 2) ?? 0n, sa = m.tss ? ss * m.tsa / m.tss : 0n, ba = m.tbs ? (bs * m.tba + m.tbs - 1n) / m.tbs : 0n;
    const cv = e.priceRaw != null ? col * e.priceRaw / 10n ** 36n : null, ltv = cv ? Number(ba) / Number(cv) : null, maxB = cv != null ? cv * m.lltv / 10n ** 18n : null;
    return ok({ chain: ch, address: checksum(q.address), market: pub(e), supplied: fmt(sa, e.L.decimals), borrowed: fmt(ba, e.L.decimals), collateral: fmt(col, e.C.decimals), collateral_value_in_loan: cv != null ? fmt(cv, e.L.decimals) : null, ltv, lltv: Number(m.lltv) / 1e18, health_factor: ba > 0n && maxB != null ? Number(maxB) / Number(ba) : null, liquidatable: ba > 0n && maxB != null ? ba > maxB : false, borrow_headroom: maxB != null && maxB > ba ? fmt(maxB - ba, e.L.decimals) : "0", liquidation_price: ba > 0n && col > 0n ? Number(ba) / 10 ** e.L.decimals / (Number(col) / 10 ** e.C.decimals * Number(m.lltv) / 1e18) : null, source: "Morpho Blue position/market + oracle eth_call" });
  } catch (e) { return err(e); }
}
async function vaultCore(ch, v) { const r = (await rpcBatch(ch, [call(v, sel("asset()")), call(v, sel("name()")), call(v, "0x01e1d114"), call(v, "0x18160ddd"), call(v, sel("fee()")), call(v, sel("curator()")), call(v, sel("owner()")), call(v, sel("supplyQueueLength()")), call(v, sel("withdrawQueueLength()"))])).results;
  if (!r[0] || r[0].length < 66 || W(r[7]) == null) throw new Error("not a MetaMorpho vault"); const [as] = await meta(ch, ["0x" + r[0].slice(-40)]); return { as, name: str(r[1]), ta: W(r[2]), ts: W(r[3]), fee: Number(W(r[4]) ?? 0n) / 1e18, curator: r[5] && r[5].length >= 66 ? ad(r[5]) : null, owner: r[6] && r[6].length >= 66 ? ad(r[6]) : null, wq: Number(W(r[8]) ?? 0n) }; }
export async function morphovault(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); if (!isA(q.vault)) return bad("vault address required");
  try { const c = await vaultCore(ch, q.vault), n = Math.min(c.wq, 40), qr = (await rpcBatch(ch, Array.from({ length: n }, (_, i) => call(q.vault, sel("withdrawQueue(uint256)") + pad(i.toString(16)))))).results, ids = qr.map((x) => (x && x.length >= 66 ? "0x" + x.slice(2, 66) : null)).filter(Boolean);
    const [mk, pc] = await Promise.all([markets(ch, ids), rpcBatch(ch, ids.flatMap((id) => [call(MB, sel("position(bytes32,address)") + id.slice(2) + A(q.vault)), call(q.vault, sel("config(bytes32)") + id.slice(2))]))]), en = await enrich(ch, mk), byId = Object.fromEntries(en.map((e) => [e.id, e]));
    const al = ids.map((id, i) => { const e = byId[id]; if (!e) return null; const ss = W(pc.results[2 * i]) ?? 0n, a = e.tss ? ss * e.tsa / e.tss : 0n; return { market_id: id, collateral: e.C.symbol || (e.C.address === checksum("0x" + "0".repeat(40)) ? "idle" : e.C.address), lltv: Number(e.lltv) / 1e18, allocated: fmt(a, c.as.decimals), allocatedN: Number(a) / 10 ** c.as.decimals, cap: fmt(W(pc.results[2 * i + 1], 0) ?? 0n, c.as.decimals), supply_apy: e.supply_apy, utilization: e.util }; }).filter(Boolean);
    const tot = al.reduce((s, x) => s + x.allocatedN, 0), apy = tot ? al.reduce((s, x) => s + x.allocatedN * (x.supply_apy || 0), 0) / tot * (1 - c.fee) : null;
    return ok({ chain: ch, vault: checksum(q.vault), name: c.name, asset: c.as, total_assets: fmt(c.ta, c.as.decimals), share_price: c.ts ? Number(c.ta) / Number(c.ts) * 10 ** (18 - c.as.decimals) : null, fee: c.fee, curator: c.curator, owner: c.owner, net_apy_est: apy, allocations: al.sort((x, y) => y.allocatedN - x.allocatedN).map(({ allocatedN, ...x }) => ({ ...x, share: tot ? allocatedN / tot : 0 })), source: "MetaMorpho + Morpho Blue eth_call" });
  } catch (e) { return err(e); }
}
export async function morphovaultpos(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); if (!isA(q.vault)) return bad("vault address required"); if (!isA(q.address)) return bad("address required");
  try { const c = await vaultCore(ch, q.vault), b = W((await rpcBatch(ch, [call(q.vault, "0x70a08231" + A(q.address))])).results[0]) ?? 0n, r = (await rpcBatch(ch, [call(q.vault, "0x07a2d13a" + pad(b.toString(16))), call(q.vault, sel("maxWithdraw(address)") + A(q.address))])).results;
    return ok({ chain: ch, vault: checksum(q.vault), name: c.name, address: checksum(q.address), asset: c.as, shares: fmt(b, 18), assets: fmt(W(r[0]) ?? 0n, c.as.decimals), max_withdraw_now: fmt(W(r[1]) ?? 0n, c.as.decimals), share_of_vault: c.ts ? Number(b) / Number(c.ts) : 0, source: "MetaMorpho ERC-4626 eth_call" });
  } catch (e) { return err(e); }
}
