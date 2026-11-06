// packb55 (builder B, 2026-11-02): Euler v2 (EVK) on-chain: eulervaults, eulervault, eulerposition, eulerbuild. $0 upstream (keyless RPCs + coins.llama.fi prices).
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
import { finish, J } from "./packb40.js";
const FAC = { ethereum: "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e", base: "0x7F321498A801A191a93C840750ed637149dDf8D0" };
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], S = (s) => sel(s);
const str = (h) => { try { if (!h || h.length < 66) return null; if (h.length === 66) return new TextDecoder().decode(unhex(h.slice(2)).filter((b) => b)); const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
const adr = (h, i = 0) => h && h.length >= 66 + 64 * i ? "0x" + h.slice(2 + 64 * i + 24, 66 + 64 * i) : null;
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain); return c && FAC[c] ? c : null; };
const MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
function agg(calls) { const tup = calls.map(([, [c]]) => { const d = c.data.slice(2), L = d.length / 2, pd = d.padEnd(Math.ceil(L / 32) * 64, "0"); return pad(c.to.slice(2)) + pad("1") + pad("60") + pad(L.toString(16)) + pd; }); let off = 32 * tup.length, h = ""; for (const t of tup) { h += pad(off.toString(16)); off += t.length / 2; } return S("aggregate3((address,bool,bytes)[])") + pad("20") + pad(tup.length.toString(16)) + h + tup.join(""); }
function unagg(r) { const x = r.slice(2), W = (o) => Number(BigInt("0x" + x.slice(o * 2, o * 2 + 64))), base = W(0), n = W(base), out = []; for (let i = 0; i < n; i++) { const t = base + 32 + W(base + 32 + 32 * i), okk = W(t), bo = t + W(t + 32), L = W(bo); out.push(okk && L ? "0x" + x.slice((bo + 32) * 2, (bo + 32 + L) * 2) : null); } return out; }
async function many(ch, calls) { const out = []; for (let i = 0; i < calls.length; i += 400) { const part = calls.slice(i, i + 400); out.push(rpcBatch(ch, [["eth_call", [{ to: MC3, data: agg(part) }, "latest"]]]).then((r) => r.results[0] ? unagg(r.results[0]) : part.map(() => null))); } return (await Promise.all(out)).flat(); }
async function prices(ch, ads) { const u = [...new Set(ads.map((a) => a.toLowerCase()))], out = {}; for (let i = 0; i < u.length; i += 80) { const r = await J("https://coins.llama.fi/prices/current/" + u.slice(i, i + 80).map((a) => ch + ":" + a).join(",")); for (const [k, v] of Object.entries((r.j && r.j.coins) || {})) out[k.split(":")[1].toLowerCase()] = { p: v.price, s: v.symbol, d: v.decimals }; } return out; }
const ray = (r) => Number(r) / 1e27, apy = (x) => +((Math.exp(x * 31536000) - 1) * 100).toFixed(3);
async function vinfo(ch, vs) {
  const F = ["name()", "asset()", "totalAssets()", "totalBorrows()", "cash()", "interestRate()", "interestFee()", "decimals()", "governorAdmin()", "symbol()"];
  const r = await many(ch, vs.flatMap((v) => F.map((f) => call(v, S(f))))); const K = F.length;
  const raw = vs.map((v, i) => { const g = (j) => r[K * i + j]; return { vault: v, name: str(g(0)), asset: adr(g(1)), ta: g(2) ? w(g(2), 0) : 0n, tb: g(3) ? w(g(3), 0) : 0n, cash: g(4) ? w(g(4), 0) : 0n, ir: g(5) ? w(g(5), 0) : 0n, fee: g(6) ? Number(w(g(6), 0)) / 1e4 : 0, dec: g(7) ? Number(w(g(7), 0)) : 18, gov: adr(g(8)), sym: str(g(9)) }; }).filter((x) => x.asset);
  const px = await prices(ch, raw.map((x) => x.asset));
  return raw.map((x) => { const p = px[x.asset.toLowerCase()] || {}, u = x.ta > 0n ? Number(x.tb) / Number(x.ta) : 0, b = apy(ray(x.ir)), usd = (v) => p.p ? Number(v) / 10 ** x.dec * p.p : null;
    return { vault: checksum(x.vault), name: x.name, symbol: x.sym, asset: checksum(x.asset), asset_symbol: p.s || null, decimals: x.dec, total_assets: fmt(x.ta, x.dec), total_borrows: fmt(x.tb, x.dec), cash: fmt(x.cash, x.dec), tvl_usd: usd(x.ta) != null ? Math.round(usd(x.ta)) : null, borrowed_usd: usd(x.tb) != null ? Math.round(usd(x.tb)) : null, utilization: +u.toFixed(4), borrow_apy_pct: b, supply_apy_pct: +(b * u * (1 - x.fee)).toFixed(3), interest_fee: x.fee, governor: x.gov && !/^0x0{40}$/.test(x.gov) ? checksum(x.gov) : null, escrow_or_ungoverned: !x.gov || /^0x0{40}$/.test(x.gov) }; });
}
const cache = {};
async function all(ch) { if (cache[ch] && Date.now() - cache[ch].t < 300000) return cache[ch].v; const n = Number(w((await rpcBatch(ch, [call(FAC[ch], S("getProxyListLength()"))])).results[0], 0)); const h = (await rpcBatch(ch, [call(FAC[ch], S("getProxyListSlice(uint256,uint256)") + pad("0") + pad(n.toString(16)))])).results[0]; const m = Number(w(h, 1)); const vs = Array.from({ length: m }, (_, i) => adr(h, 2 + i)); const v = (await vinfo(ch, vs)).filter((x) => x.tvl_usd && x.tvl_usd >= 1000); cache[ch] = { t: Date.now(), v }; return v; }
export async function eulervaults(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)");
  try { let v = await all(ch); if (q.asset) { const a = String(q.asset).toLowerCase(); v = v.filter((x) => (x.asset_symbol || "").toLowerCase() === a || x.asset.toLowerCase() === a); } if (q.governed === "true") v = v.filter((x) => x.governor);
    v = [...v].sort((a, b) => (q.sort === "apy" ? b.supply_apy_pct - a.supply_apy_pct : b.tvl_usd - a.tvl_usd)); const lim = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    return ok({ chain: ch, factory: FAC[ch], vaults_over_1k_usd: v.length, total_tvl_usd: v.reduce((s, x) => s + x.tvl_usd, 0), vaults: v.slice(0, lim), detail: "/v1/eulervault", source: "Euler EVK GenericFactory + vault eth_call; prices coins.llama.fi" });
  } catch (e) { return err(e); }
}
export async function eulervault(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); if (!isA(q.vault)) return bad("vault address required");
  try { const [v] = await vinfo(ch, [q.vault]); if (!v) return bad("not an Euler vault"); const r = await rpcBatch(ch, [call(q.vault, S("LTVList()")), call(q.vault, S("oracle()")), call(q.vault, S("unitOfAccount()")), call(q.vault, S("caps()")), call(q.vault, S("maxLiquidationDiscount()"))]);
    const L = r.results[0], n = L ? Number(w(L, 1)) : 0, cols = Array.from({ length: n }, (_, i) => adr(L, 2 + i)); const lr = cols.length ? await rpcBatch(ch, cols.flatMap((c) => [call(q.vault, S("LTVFull(address)") + pad(c.slice(2))), call(c, "0x95d89b41"), call(c, S("asset()"))])) : { results: [] };
    const collateral = cols.map((c, i) => { const f = lr.results[3 * i]; return { collateral_vault: checksum(c), symbol: str(lr.results[3 * i + 1]), underlying: adr(lr.results[3 * i + 2]) ? checksum(adr(lr.results[3 * i + 2])) : null, borrow_ltv: f ? Number(w(f, 0)) / 1e4 : null, liquidation_ltv: f ? Number(w(f, 1)) / 1e4 : null }; }).filter((x) => x.liquidation_ltv);
    return ok({ chain: ch, ...v, oracle: adr(r.results[1]) ? checksum(adr(r.results[1])) : null, unit_of_account: adr(r.results[2]) ? checksum(adr(r.results[2])) : null, max_liquidation_discount: r.results[4] ? Number(w(r.results[4], 0)) / 1e4 : null, accepted_collateral: collateral, source: "Euler EVK vault eth_call" });
  } catch (e) { return err(e); }
}
export async function eulerposition(q) {
  const ch = chq(q), a = q.address || q.from; if (!ch) return bad("chain required (ethereum or base)"); if (!isA(a)) return bad("address required");
  try { const v = isA(q.vault) ? await vinfo(ch, [q.vault]) : await all(ch); const r = await many(ch, v.flatMap((x) => [call(x.vault, "0x70a08231" + pad(a.slice(2))), call(x.vault, S("debtOf(address)") + pad(a.slice(2)))]));
    const sh = v.map((x, i) => ({ x, s: r[2 * i] ? w(r[2 * i], 0) : 0n, d: r[2 * i + 1] ? w(r[2 * i + 1], 0) : 0n })).filter((p) => p.s > 0n || p.d > 0n);
    const cv = sh.length ? await rpcBatch(ch, sh.map((p) => call(p.x.vault, S("convertToAssets(uint256)") + pad(p.s.toString(16))))) : { results: [] };
    const pos = sh.map((p, i) => { const as = cv.results[i] ? w(cv.results[i], 0) : 0n, px = p.x.tvl_usd && Number(p.x.total_assets) ? p.x.tvl_usd / Number(p.x.total_assets) : null; return { vault: p.x.vault, name: p.x.name, asset: p.x.asset_symbol, supplied: fmt(as, p.x.decimals), supplied_usd: px != null ? +(Number(fmt(as, p.x.decimals)) * px).toFixed(2) : null, debt: fmt(p.d, p.x.decimals), debt_usd: px != null ? +(Number(fmt(p.d, p.x.decimals)) * px).toFixed(2) : null, supply_apy_pct: p.x.supply_apy_pct, borrow_apy_pct: p.x.borrow_apy_pct }; });
    return ok({ chain: ch, address: checksum(a), scanned_vaults: v.length, positions: pos, note: "scans the main EVC account only (sub-accounts are XOR-derived addresses; pass them as address)", source: "Euler EVK vault eth_call" });
  } catch (e) { return err(e); }
}
export async function eulerbuild(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum or base)"); if (!isA(q.from) || !isA(q.vault)) return bad("from and vault addresses required");
  const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "withdraw", "borrow", "repay"].includes(act)) return bad("action: deposit, withdraw, borrow or repay"); if (!q.amount) return bad("amount required");
  try { const [v] = await vinfo(ch, [q.vault]); if (!v) return bad("not an Euler vault"); const max = String(q.amount).toLowerCase() === "max"; if (max && act !== "repay") return bad("amount=max only for repay"); const amt = max ? 2n ** 256n - 1n : toUnits(q.amount, v.decimals); if (!amt) return bad("bad amount");
    const F = pad(q.from.slice(2)), M = pad(amt.toString(16)), data = { deposit: S("deposit(uint256,address)") + M + F, withdraw: S("withdraw(uint256,address,address)") + M + F + F, borrow: S("borrow(uint256,address)") + M + F, repay: S("repay(uint256,address)") + M + F }[act];
    const extra = { chain: ch, protocol: "euler-v2", action: act, vault: v.vault, vault_name: v.name, asset: v.asset_symbol, amount: q.amount, supply_apy_pct: v.supply_apy_pct, borrow_apy_pct: v.borrow_apy_pct, note: act === "borrow" ? "borrow requires EVC enableController(vault) and enableCollateral(collateral vault) first; a plain call reverts otherwise" : null };
    if (act === "deposit" || act === "repay") { let need = amt; if (max) need = w((await rpcBatch(ch, [call(v.vault, S("debtOf(address)") + F)])).results[0], 0) * 1001n / 1000n; return await finish(ch, q.from, v.asset, need, v.vault, { to: v.vault, data, value: 0 }, extra); }
    const t = await txbuild({ chain: ch, from: q.from, to: v.vault, data, value: "0" }); return ok({ ...extra, ...pick(t) });
  } catch (e) { return err(e); }
}
