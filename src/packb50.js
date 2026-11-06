// packb50 (builder B, 2026-11-02): fluidlend, fluidbuild, fluidvaults, fluidpositions. $0 upstream (Fluid public API + keyless RPCs).
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
const FC = { ethereum: 1, base: 8453, arbitrum: 42161, polygon: 137 }, FA = "https://api.fluid.instadapp.io/v2";
const pct = (x) => x == null ? null : Number(x) / 100;
const lim = (q, d = 25) => Math.min(Math.max(Number(q.limit) || d, 1), 100);
const chq = (q) => { const c = q.chain ? ck(q.chain) : null; return c && FC[c] ? c : null; };
const ft = (t) => { const d = Number(t.decimals), px = Number(t.asset && t.asset.price || 0); return { ftoken: t.address, symbol: t.symbol, asset: t.asset && t.asset.symbol, asset_address: t.assetAddress, decimals: d, native_underlying: !!t.isNativeUnderlying, supply_apr_pct: pct(t.supplyRate), rewards_apr_pct: pct(t.rewardsRate), total_apr_pct: pct(t.totalRate), total_assets: fmt(BigInt(t.totalAssets), d), tvl_usd: Math.round(Number(t.totalAssets) / 10 ** d * px), assets_per_share: t.convertToAssets ? fmt(BigInt(t.convertToAssets), d) : null, eip2612: !!t.eip2612Deposits }; };
async function ftokens(ch) { const r = await J(FA + "/lending/" + FC[ch] + "/tokens"); if (!r.ok || !r.j || !Array.isArray(r.j.data)) throw new Error("Fluid lending " + r.status); return r.j.data; }
export async function fluidlend(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum, base, arbitrum, polygon)");
  try { const out = (await ftokens(ch)).map(ft).sort((a, b) => (b.total_apr_pct || 0) - (a.total_apr_pct || 0)); return ok({ chain: ch, count: out.length, tokens: out, build: "/v1/fluidbuild?chain=" + ch + "&ftoken=<symbol|address>", source: "api.fluid.instadapp.io" }); } catch (e) { return err(e); }
}
export async function fluidbuild(q) {
  const ch = chq(q); if (!ch) return bad("chain required"); if (!q.ftoken || !isA(q.from) || !q.amount) return bad("ftoken (fUSDC or address), from, amount required");
  const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "redeem"].includes(act)) return bad("action deposit|redeem");
  try { const k = String(q.ftoken).toLowerCase(), t = (await ftokens(ch)).find((x) => x.address.toLowerCase() === k || x.symbol.toLowerCase() === k); if (!t) return bad("fToken not found on " + ch); const f = ft(t);
    if (f.native_underlying && act === "deposit") return bad("native-underlying fToken: wrap to WETH and use fWETH, or use the Fluid app");
    const amt = toUnits(q.amount, f.decimals); if (!amt) return bad("bad amount"); const me = pad(q.from.slice(2)), cps = BigInt(t.convertToShares || 0), cpa = BigInt(t.convertToAssets || 0), one = 10n ** BigInt(f.decimals);
    if (act === "deposit") return await finish(ch, q.from, f.asset_address, amt, f.ftoken, { to: f.ftoken, data: sel("deposit(uint256,address)") + pad(amt.toString(16)) + me, value: 0 }, { chain: ch, action: act, ftoken: f.ftoken, symbol: f.symbol, asset: f.asset, amount: q.amount, est_shares: cps ? fmt(amt * cps / one, f.decimals) : null, supply_apr_pct: f.total_apr_pct, source: "api.fluid.instadapp.io" });
    const tx = await txbuild({ chain: ch, from: q.from, to: f.ftoken, data: sel("redeem(uint256,address,address)") + pad(amt.toString(16)) + me + me, value: "0" });
    return ok({ chain: ch, action: act, ftoken: f.ftoken, symbol: f.symbol, shares: q.amount, est_assets: cpa ? fmt(amt * cpa / one, f.decimals) : null, ...pick(tx), source: "api.fluid.instadapp.io" });
  } catch (e) { return err(e); }
}
export async function fluidvaults(q) {
  const ch = chq(q); if (!ch) return bad("chain required (ethereum, base, arbitrum, polygon)");
  try { const r = await J(FA + "/" + FC[ch] + "/vaults"); if (!r.ok || !Array.isArray(r.j)) return err("Fluid vaults " + r.status);
    const s = (x) => [x.token0, x.token1].filter((t) => t && t.symbol && !/^0x0{40}$/.test(t.address)).map((t) => t.symbol).join("/");
    const c = q.collateral ? String(q.collateral).toLowerCase() : null, b = q.borrow ? String(q.borrow).toLowerCase() : null;
    let out = r.j.map((v) => { const t0 = v.borrowToken.token0, bp = Number(t0.price || 0), bd = Number(t0.decimals); return { id: v.id, vault: v.address, type: v.type, collateral: s(v.supplyToken), borrow: s(v.borrowToken), supply_apr_pct: v.type === "1" || v.type === "3" ? pct(v.supplyRate && v.supplyRate.vault && v.supplyRate.vault.rate) : null, borrow_apr_pct: v.type === "1" || v.type === "2" ? pct(v.borrowRate && v.borrowRate.vault && v.borrowRate.vault.rate) : null, rate_note: v.type === "1" ? null : "smart-col/debt (DEX) vault: rate net of trading fees, see Fluid app", collateral_factor_pct: v.collateralFactor / 100, liquidation_threshold_pct: v.liquidationThreshold / 100, liquidation_penalty_pct: v.liquidationPenalty / 100, borrowable_usd: Math.round(Number(v.borrowable || 0) / 10 ** bd * bp), total_borrow_usd: Math.round(Number(v.totalBorrow || 0) / 10 ** bd * bp), positions: Number(v.totalPositions || 0), oracle: v.oracleDescription || null }; })
      .filter((v) => (!c || v.collateral.toLowerCase().split("/").includes(c)) && (!b || v.borrow.toLowerCase().split("/").includes(b)));
    const sk = q.sort === "liquidity" ? "borrowable_usd" : q.sort === "size" ? "total_borrow_usd" : "borrow_apr_pct"; out.sort((x, y) => sk === "borrow_apr_pct" ? (x[sk] ?? 1e9) - (y[sk] ?? 1e9) : y[sk] - x[sk]);
    return ok({ chain: ch, count: out.length, vaults: out.slice(0, lim(q)), source: "api.fluid.instadapp.io" });
  } catch (e) { return err(e); }
}
export async function fluidpositions(q) {
  const a = q.address || q.from; if (!isA(a)) return bad("address required"); const ch = q.chain ? chq(q) : "ethereum"; if (!ch) return bad("chain must be ethereum, base, arbitrum, polygon");
  try { const r = await J(FA + "/lending/" + FC[ch] + "/users/" + a + "/positions"); if (!r.ok || !r.j || !Array.isArray(r.j.data)) return err("Fluid positions " + r.status);
    const out = r.j.data.map((p) => { const f = ft(p.token), px = Number(p.token.asset && p.token.asset.price || 0); return { ftoken: f.ftoken, symbol: f.symbol, asset: f.asset, shares: fmt(BigInt(p.shares || 0), f.decimals), underlying: fmt(BigInt(p.underlyingAssets || 0), f.decimals), usd: +(Number(p.underlyingAssets || 0) / 10 ** f.decimals * px).toFixed(2), wallet_asset_balance: fmt(BigInt(p.underlyingBalance || 0), f.decimals), allowance: fmt(BigInt(p.allowance || 0), f.decimals), supply_apr_pct: f.total_apr_pct }; });
    const held = out.filter((x) => x.shares !== "0");
    return ok({ chain: ch, address: checksum(a), supplied_count: held.length, total_supplied_usd: +held.reduce((s, x) => s + x.usd, 0).toFixed(2), positions: q.all ? out : held, wallet_depositable: out.filter((x) => x.wallet_asset_balance !== "0").map((x) => ({ asset: x.asset, balance: x.wallet_asset_balance, ftoken: x.symbol, apr_pct: x.supply_apr_pct })), note: "Fluid Lend (fToken) positions; borrow-vault NFTs not included", source: "api.fluid.instadapp.io" });
  } catch (e) { return err(e); }
}
