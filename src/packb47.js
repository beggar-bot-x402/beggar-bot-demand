// packb47 (builder B, 2026-11-02): curvepools, curvelend, curveswap, crvusdmarkets. $0 upstream (Curve public API + prices API + keyless RPCs).
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
const CA = "https://api.curve.finance/v1", CP = "https://prices.curve.finance/v1";
const CCH = { ethereum: "ethereum", base: "base", arbitrum: "arbitrum", optimism: "optimism", polygon: "polygon" };
const lim = (q, d = 25) => Math.min(Math.max(Number(q.limit) || d, 1), 100);
async function pools(ch) { const r = await J(CA + "/getPools/all/" + ch); if (!r.ok || !r.j || !r.j.data) throw new Error("Curve pools " + r.status); return r.j.data.poolData || []; }
// ---- curvepools ----
export async function curvepools(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !CCH[ch]) return bad("chain required (ethereum, base, arbitrum, optimism, polygon)");
  try { const [ps, v] = await Promise.all([pools(ch), J(CA + "/getVolumes/" + ch).catch(() => null)]); const vm = {}; for (const x of (v && v.j && v.j.data && v.j.data.pools) || []) vm[x.address.toLowerCase()] = x;
    const t = q.token ? String(q.token).toLowerCase() : null, minT = Number(q.min_tvl ?? 10000);
    let out = ps.filter((p) => (p.usdTotal || 0) >= minT && (!t || p.coins.some((c) => c.address.toLowerCase() === t || String(c.symbol).toLowerCase() === t))).map((p) => { const x = vm[p.address.toLowerCase()] || {}; return { name: p.name, pool: p.address, type: p.implementation || null, tvl_usd: Math.round(p.usdTotal || 0), volume_24h_usd: x.volumeUSD ?? null, base_apy_daily_pct: x.latestDailyApyPcent ?? null, base_apy_weekly_pct: x.latestWeeklyApyPcent ?? null, crv_apy_pct: p.gaugeCrvApy ? p.gaugeCrvApy[0] : null, amp: p.amplificationCoefficient ?? null, coins: p.coins.map((c, i) => ({ i, symbol: c.symbol, address: c.address, decimals: Number(c.decimals), usd: c.usdPrice ?? null })), gauge: p.gaugeAddress || null }; });
    const sk = q.sort === "volume" ? "volume_24h_usd" : q.sort === "apy" ? "base_apy_weekly_pct" : "tvl_usd"; out.sort((a, b) => (b[sk] || 0) - (a[sk] || 0));
    return ok({ chain: ch, count: out.length, pools: out.slice(0, lim(q)), build: "/v1/curveswap?chain=" + ch + "&pool=<pool>", source: "api.curve.finance" });
  } catch (e) { return err(e); }
}
// ---- curvelend ----
export async function curvelend(q) {
  const ch = q.chain ? ck(q.chain) : "ethereum"; if (!ch || !CCH[ch]) return bad("chain must be ethereum, arbitrum, optimism, base, polygon");
  if (q.chain === undefined && q.collateral === undefined && q.limit === undefined && q.sort === undefined) return bad("chain required");
  try { const r = await J(CA + "/getLendingVaults/all/" + ch); if (!r.ok || !r.j || !r.j.data) return err("Curve lend " + r.status);
    const c = q.collateral ? String(q.collateral).toLowerCase() : null;
    let out = (r.j.data.lendingVaultData || []).filter((v) => !c || [v.assets.collateral.symbol, v.assets.collateral.address].some((x) => String(x).toLowerCase() === c)).map((v) => ({ name: v.name, vault: v.address, controller: v.controllerAddress, amm: v.ammAddress, borrowed: v.assets.borrowed.symbol, collateral: v.assets.collateral.symbol, collateral_address: v.assets.collateral.address, lend_apy_pct: v.rates.lendApyPcent, borrow_apy_pct: v.rates.borrowApyPcent, supplied_usd: v.totalSupplied.usdTotal, borrowed_usd: v.borrowed.usdTotal, available_usd: v.availableToBorrow.usdTotal, utilization: v.totalSupplied.usdTotal ? +(v.borrowed.usdTotal / v.totalSupplied.usdTotal).toFixed(4) : null }));
    const sk = q.sort === "borrow" ? "borrow_apy_pct" : q.sort === "tvl" ? "supplied_usd" : "lend_apy_pct"; out = out.filter((v) => (v.supplied_usd || 0) >= Number(q.min_tvl ?? 1000)); out.sort((a, b) => sk === "borrow_apy_pct" ? a[sk] - b[sk] : b[sk] - a[sk]);
    return ok({ chain: ch, count: out.length, vaults: out.slice(0, lim(q)), source: "api.curve.finance getLendingVaults" });
  } catch (e) { return err(e); }
}
// ---- curveswap: direct pool exchange tx with on-chain get_dy quote ----
export async function curveswap(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !CCH[ch]) return bad("chain required");
  if (!isA(q.pool) || !isA(q.from)) return bad("pool and from addresses required"); if (!q.token_in || !q.token_out || !q.amount) return bad("token_in, token_out, amount required");
  try { const p = (await pools(ch)).find((x) => x.address.toLowerCase() === q.pool.toLowerCase()); if (!p) return bad("pool not in Curve registry for " + ch);
    const ix = (t) => p.coins.findIndex((c) => c.address.toLowerCase() === String(t).toLowerCase() || String(c.symbol).toLowerCase() === String(t).toLowerCase());
    const i = ix(q.token_in), j = ix(q.token_out); if (i < 0 || j < 0 || i === j) return bad("tokens must be distinct pool coins: " + p.coins.map((c) => c.symbol).join(", "));
    const ci = p.coins[i], cj = p.coins[j]; if (/^0xe{40}$/i.test(ci.address)) return bad("native-ETH input not supported; use WETH pools");
    const amt = toUnits(q.amount, Number(ci.decimals)); if (!amt) return bad("bad amount"); const slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 5000);
    const args = pad(i.toString(16)) + pad(j.toString(16)) + pad(amt.toString(16));
    const r = await rpcBatch(ch, [["eth_call", [{ to: p.address, data: sel("get_dy(int128,int128,uint256)") + args }, "latest"]], ["eth_call", [{ to: p.address, data: sel("get_dy(uint256,uint256,uint256)") + args }, "latest"]]]);
    const i128 = r.results[0] && r.results[0].length >= 66, dy = i128 ? w(r.results[0], 0) : r.results[1] && r.results[1].length >= 66 ? w(r.results[1], 0) : null; if (!dy) return err("get_dy reverted on pool");
    const min = dy * BigInt(10000 - slip) / 10000n, data = sel(i128 ? "exchange(int128,int128,uint256,uint256)" : "exchange(uint256,uint256,uint256,uint256)") + args + pad(min.toString(16));
    const ein = Number(amt) / 10 ** Number(ci.decimals) * (ci.usdPrice || 0), eout = Number(dy) / 10 ** Number(cj.decimals) * (cj.usdPrice || 0);
    return await finish(ch, q.from, ci.address, amt, p.address, { to: p.address, data, value: 0 }, { chain: ch, aggregator: "curve-pool", pool: p.address, pool_name: p.name, index_type: i128 ? "int128" : "uint256", token_in: ci.symbol, token_out: cj.symbol, i, j, amount_in: q.amount, amount_out: fmt(dy, Number(cj.decimals)), min_out: fmt(min, Number(cj.decimals)), slippage_bps: slip, usd_in: +ein.toFixed(4), usd_out: +eout.toFixed(4), est_price_impact: ein ? +((eout - ein) / ein).toFixed(5) : null, note: "tokens sent to from; get_dy read live on-chain", source: "api.curve.finance + on-chain get_dy" });
  } catch (e) { return err(e); }
}
// ---- crvusdmarkets: crvUSD mint markets ----
export async function crvusdmarkets(q) {
  const ch = q.chain ? ck(q.chain) : null; if (ch !== "ethereum") return bad("chain=ethereum required (crvUSD mint markets live on Ethereum)");
  try { const [r, s] = await Promise.all([J(CP + "/crvusd/markets/ethereum?page=1&per_page=50"), J(CA + "/getCrvusdTotalSupplyNumber").catch(() => null)]); if (!r.ok || !r.j || !Array.isArray(r.j.data)) return err("crvUSD markets " + r.status);
    const out = r.j.data.map((m) => ({ controller: m.address, llamma: m.llamma, collateral: m.collateral_token ? m.collateral_token.symbol : null, collateral_address: m.collateral_token ? m.collateral_token.address : null, borrow_apy_pct: m.borrow_apy, future_rate_apy: m.future_rate ?? null, total_debt: m.total_debt, n_loans: m.n_loans, oracle_price: m.price_oracle, amm_price: m.amm_price, debt_ceiling: m.debt_ceiling ?? null, borrowable: m.borrowable ?? null, collateral_usd: m.collateral_amount_usd ?? null, soft_liquidation: m.amm_price && m.price_oracle ? Math.abs(m.amm_price / m.price_oracle - 1) > 0.01 : null })).sort((a, b) => (b.total_debt || 0) - (a.total_debt || 0));
    return ok({ chain: ch, crvusd_total_supply: s && s.j != null ? Number(s.text ?? s.j) : null, count: out.length, markets: out, source: "prices.curve.finance + api.curve.finance" });
  } catch (e) { return err(e); }
}
