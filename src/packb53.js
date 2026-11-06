// packb53 (builder B, 2026-11-02): Moonwell on-chain: moonwellmarkets, moonwellposition, moonwellbuild, moonwellenter. $0 upstream (keyless RPCs).
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
import { finish } from "./packb40.js";
const CT = { base: "0xfBb21d0380beE3312B33c4353c8936a0F13EF26C", optimism: "0xCa889f40aae37FFf165BccF69aeF1E82b5C511B9" };
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const S = (s) => sel(s);
const str = (h) => { try { if (!h || h.length < 130) return null; const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
const apy = (r) => +(((1 + Number(r) / 1e18) ** 31536000 - 1) * 100).toFixed(3);
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain); return c && CT[c] ? c : null; };
const cache = {};
async function markets(ch) {
  if (cache[ch] && Date.now() - cache[ch].t < 60000) return cache[ch].v;
  const r0 = await rpcBatch(ch, [call(CT[ch], S("getAllMarkets()")), call(CT[ch], S("oracle()"))]); const h = r0.results[0], n = Number(w(h, 1)), ms = Array.from({ length: n }, (_, i) => "0x" + h.slice(2 + 64 * (2 + i) + 24, 66 + 64 * (2 + i))), orc = "0x" + r0.results[1].slice(-40);
  const F = ["symbol()", "underlying()", "supplyRatePerTimestamp()", "borrowRatePerTimestamp()", "totalSupply()", "totalBorrows()", "getCash()", "exchangeRateStored()", "decimals()"];
  const r = await rpcBatch(ch, ms.flatMap((m) => [...F.map((f) => call(m, S(f))), call(CT[ch], S("markets(address)") + pad(m.slice(2))), call(orc, S("getUnderlyingPrice(address)") + pad(m.slice(2))), call(CT[ch], S("mintGuardianPaused(address)") + pad(m.slice(2)))]));
  const K = F.length + 3, und = ms.map((m, i) => { const u = r.results[K * i + 1]; return u && u.length >= 66 ? "0x" + u.slice(-40) : null; });
  const ur = await rpcBatch(ch, und.flatMap((u) => u ? [call(u, "0x313ce567"), call(u, "0x95d89b41")] : [call(ms[0], "0x313ce567"), call(ms[0], "0x313ce567")]));
  const v = ms.map((m, i) => { const g = (j) => r.results[K * i + j], d = Number(w(ur.results[2 * i], 0)), cash = w(g(6), 0), bor = w(g(5), 0), mk = g(9), px = w(g(10), 0), usd = (x) => Number(x) / 10 ** d * Number(px) / 10 ** (36 - d);
    return { market: checksum(m), symbol: str(g(0)), underlying: und[i] ? checksum(und[i]) : null, underlying_symbol: und[i] ? str(ur.results[2 * i + 1]) : null, underlying_decimals: d, supply_apy_pct: apy(w(g(2), 0)), borrow_apy_pct: apy(w(g(3), 0)), total_supplied: fmt(cash + bor - 0n, d), total_borrowed: fmt(bor, d), cash: fmt(cash, d), supplied_usd: Math.round(usd(cash + bor)), borrowed_usd: Math.round(usd(bor)), utilization: cash + bor > 0n ? +(Number(bor) / Number(cash + bor)).toFixed(4) : 0, collateral_factor: mk && mk.length >= 130 ? Number(w(mk, 1)) / 1e18 : null, price_usd: Number(px) / 10 ** (36 - d), exchange_rate: w(g(7), 0), mint_paused: g(11) ? w(g(11), 0) === 1n : null }; });
  cache[ch] = { t: Date.now(), v }; return v;
}
const strip = ({ exchange_rate, ...o }) => o;
export async function moonwellmarkets(q) {
  const ch = chq(q); if (!ch) return bad("chain must be base or optimism");
  try { let ms = await markets(ch); if (q.asset) { const a = String(q.asset).toLowerCase(); ms = ms.filter((m) => [m.symbol, m.underlying_symbol, m.underlying, m.market].some((x) => x && x.toLowerCase() === a)); }
    ms = [...ms].sort((a, b) => b.supplied_usd - a.supplied_usd); return ok({ chain: ch, comptroller: CT[ch], count: ms.length, markets: ms.map(strip), source: "Moonwell comptroller + mToken eth_call" });
  } catch (e) { return err(e); }
}
export async function moonwellposition(q) {
  const ch = chq(q), a = q.address || q.from; if (!ch) return bad("chain must be base or optimism"); if (!isA(a)) return bad("address required");
  try { const ms = await markets(ch), r = await rpcBatch(ch, [call(CT[ch], S("getAccountLiquidity(address)") + pad(a.slice(2))), call(CT[ch], S("getAssetsIn(address)") + pad(a.slice(2))), ...ms.map((m) => call(m.market, S("getAccountSnapshot(address)") + pad(a.slice(2))))]);
    const liq = r.results[0], ins = r.results[1], inSet = new Set(Array.from({ length: Number(w(ins, 1)) }, (_, i) => ("0x" + ins.slice(2 + 64 * (2 + i) + 24, 66 + 64 * (2 + i))).toLowerCase()));
    const pos = []; ms.forEach((m, i) => { const s = r.results[2 + i]; if (!s || s.length < 258) return; const bal = w(s, 1), bor = w(s, 2), xr = w(s, 3), sup = bal * xr / 10n ** 18n; if (sup === 0n && bor === 0n) return; pos.push({ market: m.market, asset: m.underlying_symbol || m.symbol, supplied: fmt(sup, m.underlying_decimals), supplied_usd: +(Number(sup) / 10 ** m.underlying_decimals * m.price_usd).toFixed(2), borrowed: fmt(bor, m.underlying_decimals), borrowed_usd: +(Number(bor) / 10 ** m.underlying_decimals * m.price_usd).toFixed(2), collateral_enabled: inSet.has(m.market.toLowerCase()), collateral_factor: m.collateral_factor, supply_apy_pct: m.supply_apy_pct, borrow_apy_pct: m.borrow_apy_pct }); });
    const su = pos.reduce((s, p) => s + p.supplied_usd, 0), bu = pos.reduce((s, p) => s + p.borrowed_usd, 0), lim = pos.filter((p) => p.collateral_enabled).reduce((s, p) => s + p.supplied_usd * (p.collateral_factor || 0), 0);
    return ok({ chain: ch, address: checksum(a), positions: pos, supplied_usd: +su.toFixed(2), borrowed_usd: +bu.toFixed(2), borrow_limit_usd: +lim.toFixed(2), borrow_limit_used: lim ? +(bu / lim).toFixed(4) : null, liquidity_usd: liq ? +(Number(w(liq, 1)) / 1e18).toFixed(2) : null, shortfall_usd: liq ? +(Number(w(liq, 2)) / 1e18).toFixed(2) : null, liquidatable: liq ? w(liq, 2) > 0n : null, source: "Moonwell comptroller getAccountLiquidity + getAccountSnapshot" });
  } catch (e) { return err(e); }
}
export async function moonwellbuild(q) {
  const ch = chq(q); if (!ch) return bad("chain must be base or optimism"); if (!isA(q.from)) return bad("from address required"); const act = String(q.action || "supply").toLowerCase(); if (!["supply", "withdraw", "borrow", "repay"].includes(act)) return bad("action: supply, withdraw, borrow or repay"); if (!q.asset || !q.amount) return bad("asset and amount required");
  try { const a = String(q.asset).toLowerCase(), m = (await markets(ch)).find((x) => [x.symbol, x.underlying_symbol, x.underlying, x.market].some((y) => y && y.toLowerCase() === a)); if (!m || !m.underlying) return bad("unknown Moonwell market/asset");
    const max = String(q.amount).toLowerCase() === "max", amt = max ? 2n ** 256n - 1n : toUnits(q.amount, m.underlying_decimals); if (!amt) return bad("bad amount"); if (max && act !== "repay") return bad("amount=max only for repay");
    const data = S({ supply: "mint(uint256)", withdraw: "redeemUnderlying(uint256)", borrow: "borrow(uint256)", repay: "repayBorrow(uint256)" }[act]) + pad(amt.toString(16)), extra = { chain: ch, protocol: "moonwell", action: act, market: m.market, asset: m.underlying_symbol, amount: q.amount, supply_apy_pct: m.supply_apy_pct, borrow_apy_pct: m.borrow_apy_pct, note: act === "borrow" ? "requires collateral entered via /v1/moonwellenter" : null };
    if (act === "supply" || act === "repay") { let need = amt; if (max) { const s = (await rpcBatch(ch, [call(m.market, S("borrowBalanceStored(address)") + pad(q.from.slice(2)))])).results[0]; need = w(s, 0) * 1001n / 1000n; } return await finish(ch, q.from, m.underlying, need, m.market, { to: m.market, data, value: 0 }, extra); }
    const t = await txbuild({ chain: ch, from: q.from, to: m.market, data, value: "0" }); return ok({ ...extra, ...pick(t) });
  } catch (e) { return err(e); }
}
export async function moonwellenter(q) {
  const ch = chq(q); if (!ch) return bad("chain must be base or optimism"); if (!isA(q.from)) return bad("from address required"); if (!q.assets) return bad("assets required (comma list of symbols or mToken addresses)");
  try { const ms = await markets(ch), want = String(q.assets).toLowerCase().split(",").map((s) => s.trim()), sel2 = ms.filter((x) => [x.symbol, x.underlying_symbol, x.underlying, x.market].some((y) => y && want.includes(y.toLowerCase()))); if (!sel2.length) return bad("no matching Moonwell markets");
    const exit = String(q.action || "enter").toLowerCase() === "exit"; if (exit && sel2.length > 1) return bad("exit takes one asset");
    const data = exit ? S("exitMarket(address)") + pad(sel2[0].market.slice(2)) : S("enterMarkets(address[])") + pad("20") + arr(sel2.map((m) => pad(m.market.slice(2))));
    const t = await txbuild({ chain: ch, from: q.from, to: CT[ch], data, value: "0" }); return ok({ chain: ch, action: exit ? "exit" : "enter", comptroller: CT[ch], markets: sel2.map((m) => ({ market: m.market, asset: m.underlying_symbol, collateral_factor: m.collateral_factor })), ...pick(t) });
  } catch (e) { return err(e); }
}
