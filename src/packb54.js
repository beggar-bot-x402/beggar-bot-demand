// packb54 (builder B, 2026-11-02): Aave v3 / SparkLend on-chain: aavemarkets, sparkmarkets, sparkposition, sparkbuild. $0 upstream (keyless RPCs).
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
const A3 = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";
const POOLS = { aave: { ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", arbitrum: A3, optimism: A3, polygon: A3 }, spark: { ethereum: "0xC13e21B648A5Ee794902342038FF3aDAB66BE987" } };
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], S = (s) => sel(s);
const str = (h) => { try { if (!h || h.length < 66) return null; if (h.length === 66) return new TextDecoder().decode(unhex(h.slice(2)).filter((b) => b)); const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
const apy = (r) => +(((1 + Number(r) / 1e27 / 31536000) ** 31536000 - 1) * 100).toFixed(3);
const bits = (c, a, n) => Number((c >> BigInt(a)) & ((1n << BigInt(n)) - 1n));
const cache = {};
async function reserves(proto, ch) {
  const P = POOLS[proto][ch], key = proto + ch; if (cache[key] && Date.now() - cache[key].t < 60000) return cache[key].v;
  const r0 = await rpcBatch(ch, [call(P, S("getReservesList()")), call(P, S("ADDRESSES_PROVIDER()"))]); const h = r0.results[0], n = Number(w(h, 1)), as = Array.from({ length: n }, (_, i) => "0x" + h.slice(2 + 64 * (2 + i) + 24, 66 + 64 * (2 + i)));
  const orc = "0x" + (await rpcBatch(ch, [call("0x" + r0.results[1].slice(-40), S("getPriceOracle()"))])).results[0].slice(-40);
  const r = await rpcBatch(ch, as.flatMap((a) => [call(P, S("getReserveData(address)") + pad(a.slice(2))), call(a, "0x95d89b41"), call(orc, S("getAssetPrice(address)") + pad(a.slice(2)))]));
  const rd = as.map((a, i) => r.results[3 * i]); const t = await rpcBatch(ch, rd.flatMap((d) => [call("0x" + d.slice(2 + 64 * 8 + 24, 66 + 64 * 8), "0x18160ddd"), call("0x" + d.slice(2 + 64 * 10 + 24, 66 + 64 * 10), "0x18160ddd")]));
  const v = as.map((a, i) => { const d = rd[i], c = w(d, 0), dec = bits(c, 48, 8), px = Number(w(r.results[3 * i + 2], 0)) / 1e8, sup = w(t.results[2 * i], 0), bor = w(t.results[2 * i + 1], 0), usd = (x) => Number(x) / 10 ** dec * px;
    return { asset: checksum(a), symbol: str(r.results[3 * i + 1]), decimals: dec, supply_apy_pct: apy(w(d, 2)), borrow_apy_pct: apy(w(d, 4)), total_supplied: fmt(sup, dec), total_borrowed: fmt(bor, dec), supplied_usd: Math.round(usd(sup)), borrowed_usd: Math.round(usd(bor)), utilization: sup ? +(Number(bor) / Number(sup)).toFixed(4) : 0, ltv: bits(c, 0, 16) / 1e4, liquidation_threshold: bits(c, 16, 16) / 1e4, liquidation_bonus: bits(c, 32, 16) ? bits(c, 32, 16) / 1e4 - 1 : 0, active: !!bits(c, 56, 1), frozen: !!bits(c, 57, 1), borrowing_enabled: !!bits(c, 58, 1), paused: !!bits(c, 60, 1), price_usd: px, a_token: checksum("0x" + d.slice(2 + 64 * 8 + 24, 66 + 64 * 8)) }; });
  cache[key] = { t: Date.now(), v }; return v;
}
async function mk(proto, q) {
  if (!q.chain) return bad("chain required (" + Object.keys(POOLS[proto]).join(", ") + ")"); const ch = ck(q.chain); if (!ch || !POOLS[proto][ch]) return bad("chain must be " + Object.keys(POOLS[proto]).join(", "));
  try { let v = await reserves(proto, ch); if (q.asset) { const a = String(q.asset).toLowerCase(); v = v.filter((x) => (x.symbol || "").toLowerCase() === a || x.asset.toLowerCase() === a); }
    v = [...v].sort((x, y) => (q.sort === "apy" ? y.supply_apy_pct - x.supply_apy_pct : y.supplied_usd - x.supplied_usd)); return ok({ protocol: proto === "aave" ? "aave-v3" : "sparklend", chain: ch, pool: POOLS[proto][ch], count: v.length, total_supplied_usd: v.reduce((s, x) => s + x.supplied_usd, 0), total_borrowed_usd: v.reduce((s, x) => s + x.borrowed_usd, 0), reserves: v, source: "Pool.getReserveData + oracle eth_call" });
  } catch (e) { return err(e); }
}
export const aavemarkets = (q) => mk("aave", q);
export const sparkmarkets = (q) => mk("spark", { ...q, chain: q.chain || (Object.keys(q).length ? "ethereum" : undefined) });
export async function sparkposition(q) {
  const a = q.address || q.from; if (!isA(a)) return bad("address required"); const proto = q.protocol === "aave" ? "aave" : "spark", ch = ck(q.chain || "ethereum"); if (!ch || !POOLS[proto][ch]) return bad("chain not supported for " + proto);
  try { const P = POOLS[proto][ch], v = await reserves(proto, ch), r = await rpcBatch(ch, [call(P, S("getUserAccountData(address)") + pad(a.slice(2))), call(P, S("getUserEMode(address)") + pad(a.slice(2))), ...v.flatMap((x) => [call(x.a_token, "0x70a08231" + pad(a.slice(2)))])]);
    const u = r.results[0]; if (!u || u.length < 386) return err("getUserAccountData failed");
    const pos = v.map((x, i) => ({ asset: x.symbol, supplied: fmt(w(r.results[2 + i], 0), x.decimals), supplied_usd: +(Number(w(r.results[2 + i], 0)) / 10 ** x.decimals * x.price_usd).toFixed(2), supply_apy_pct: x.supply_apy_pct })).filter((p) => p.supplied !== "0");
    const hf = w(u, 5); return ok({ protocol: proto, chain: ch, address: checksum(a), collateral_usd: Number(w(u, 0)) / 1e8, debt_usd: Number(w(u, 1)) / 1e8, available_borrow_usd: Number(w(u, 2)) / 1e8, liquidation_threshold: Number(w(u, 3)) / 1e4, ltv: Number(w(u, 4)) / 1e4, health_factor: hf > 10n ** 30n ? null : +(Number(hf) / 1e18).toFixed(4), liquidatable: hf < 10n ** 18n, emode_category: Number(w(r.results[1], 0)), supplied: pos, source: "Pool.getUserAccountData eth_call" });
  } catch (e) { return err(e); }
}
export async function sparkbuild(q) {
  if (!isA(q.from)) return bad("from address required"); const proto = q.protocol === "aave" ? "aave" : "spark", ch = ck(q.chain || "ethereum"); if (!ch || !POOLS[proto][ch]) return bad("chain not supported for " + proto);
  const act = String(q.action || "supply").toLowerCase(); if (!["supply", "withdraw", "borrow", "repay"].includes(act)) return bad("action: supply, withdraw, borrow or repay"); if (!q.asset || !q.amount) return bad("asset and amount required");
  try { const P = POOLS[proto][ch], a = String(q.asset).toLowerCase(), x = (await reserves(proto, ch)).find((y) => (y.symbol || "").toLowerCase() === a || y.asset.toLowerCase() === a); if (!x) return bad("unknown reserve");
    const max = String(q.amount).toLowerCase() === "max"; if (max && !["withdraw", "repay"].includes(act)) return bad("amount=max only for withdraw/repay"); const amt = max ? 2n ** 256n - 1n : toUnits(q.amount, x.decimals); if (!amt) return bad("bad amount");
    if (act === "borrow" && !x.borrowing_enabled) return bad(x.symbol + " borrowing disabled"); if ((act === "supply" || act === "borrow") && (x.frozen || x.paused)) return bad(x.symbol + " reserve frozen/paused");
    const A = pad(x.asset.slice(2)), F = pad(q.from.slice(2)), M = pad(amt.toString(16)), data = { supply: S("supply(address,uint256,address,uint16)") + A + M + F + pad("0"), withdraw: S("withdraw(address,uint256,address)") + A + M + F, borrow: S("borrow(address,uint256,uint256,uint16,address)") + A + M + pad("2") + pad("0") + F, repay: S("repay(address,uint256,uint256,address)") + A + M + pad("2") + F }[act];
    const extra = { protocol: proto, chain: ch, pool: P, action: act, asset: x.symbol, amount: q.amount, supply_apy_pct: x.supply_apy_pct, borrow_apy_pct: x.borrow_apy_pct };
    if (act === "supply" || act === "repay") { let need = amt; if (max) { const d = (await rpcBatch(ch, [call(P, S("getReserveData(address)") + A)])).results[0], vd = "0x" + d.slice(2 + 64 * 10 + 24, 66 + 64 * 10); need = w((await rpcBatch(ch, [call(vd, "0x70a08231" + F)])).results[0], 0) * 1001n / 1000n; } return await finish(ch, q.from, x.asset, need, P, { to: P, data, value: 0 }, extra); }
    const t = await txbuild({ chain: ch, from: q.from, to: P, data, value: "0" }); return ok({ ...extra, ...pick(t) });
  } catch (e) { return err(e); }
}
