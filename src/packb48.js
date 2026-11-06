// packb48 (builder B, 2026-11-02): yearnvaults, yearnbuild, beefyvaults, beefybuild. $0 upstream (yDaemon + Beefy API + keyless RPCs).
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
const YC = { ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10, polygon: 137 };
const lim = (q, d = 25) => Math.min(Math.max(Number(q.limit) || d, 1), 100);
const yv = (v) => ({ name: v.displayName || v.name, vault: v.address, symbol: v.symbol, version: v.version, kind: v.kind, asset: v.token && v.token.symbol, asset_address: v.token && v.token.address, decimals: v.decimals, tvl_usd: v.tvl ? Math.round(v.tvl.tvl || 0) : null, net_apr: v.apr ? v.apr.netAPR : null, forward_apr: v.apr && v.apr.forwardAPR ? v.apr.forwardAPR.netAPR ?? null : null, perf_fee: v.apr && v.apr.fees ? v.apr.fees.performance : null, mgmt_fee: v.apr && v.apr.fees ? v.apr.fees.management : null, price_per_share: v.pricePerShare, risk_level: v.info ? v.info.riskLevel : null, endorsed: !!v.endorsed, retired: !!(v.details && v.details.isRetired), shutdown: !!v.emergency_shutdown, strategies: (v.strategies || []).length });
async function yall(ch) { const r = await J("https://ydaemon.yearn.fi/" + YC[ch] + "/vaults/all?limit=2000"); if (!r.ok || !Array.isArray(r.j)) throw new Error("yDaemon " + r.status); return r.j; }
// ---- yearnvaults ----
export async function yearnvaults(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !YC[ch]) return bad("chain required (ethereum, base, arbitrum, optimism, polygon)");
  try { const a = q.asset ? String(q.asset).toLowerCase() : null;
    let out = (await yall(ch)).map(yv).filter((v) => !v.retired && !v.shutdown && (v.tvl_usd || 0) >= Number(q.min_tvl ?? 10000) && (!a || String(v.asset).toLowerCase() === a || String(v.asset_address).toLowerCase() === a));
    const sk = q.sort === "tvl" ? "tvl_usd" : "net_apr"; out.sort((x, y) => (y[sk] || 0) - (x[sk] || 0));
    return ok({ chain: ch, count: out.length, vaults: out.slice(0, lim(q)), build: "/v1/yearnbuild?chain=" + ch + "&vault=<vault>", source: "ydaemon.yearn.fi" });
  } catch (e) { return err(e); }
}
// ---- yearnbuild: deposit / withdraw tx ----
export async function yearnbuild(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !YC[ch]) return bad("chain required"); if (!isA(q.vault) || !isA(q.from)) return bad("vault and from addresses required"); if (!q.amount) return bad("amount required");
  const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "withdraw"].includes(act)) return bad("action deposit|withdraw");
  try { const r = await J("https://ydaemon.yearn.fi/" + YC[ch] + "/vaults/" + q.vault); if (!r.ok || !r.j || !r.j.address) return bad("vault not found in yDaemon for " + ch); const v = yv(r.j);
    if (act === "deposit" && (v.retired || v.shutdown)) return bad("vault retired/shutdown: deposits disabled");
    const amt = toUnits(q.amount, Number(v.decimals)); if (!amt) return bad("bad amount"); const me = pad(q.from.slice(2)), v3 = /^3/.test(String(v.version));
    if (act === "deposit") return await finish(ch, q.from, v.asset_address, amt, v.vault, { to: v.vault, data: sel("deposit(uint256,address)") + pad(amt.toString(16)) + me, value: 0 }, { chain: ch, action: act, vault: v.vault, name: v.name, version: v.version, asset: v.asset, amount: q.amount, net_apr: v.net_apr, price_per_share: v.price_per_share, est_shares: v.price_per_share ? fmt(amt * 10n ** BigInt(v.decimals) / BigInt(v.price_per_share), Number(v.decimals)) : null, source: "ydaemon.yearn.fi" });
    const data = v3 ? sel("redeem(uint256,address,address)") + pad(amt.toString(16)) + me + me : sel("withdraw(uint256,address)") + pad(amt.toString(16)) + me;
    const t = await txbuild({ chain: ch, from: q.from, to: v.vault, data, value: "0" });
    return ok({ chain: ch, action: act, vault: v.vault, name: v.name, version: v.version, shares: q.amount, method: v3 ? "redeem" : "withdraw", est_assets: v.price_per_share ? fmt(amt * BigInt(v.price_per_share) / 10n ** BigInt(v.decimals), Number(v.decimals)) : null, ...pick(t), source: "ydaemon.yearn.fi" });
  } catch (e) { return err(e); }
}
// ---- beefy ----
let BV = null, BT = 0;
async function bdata() { if (BV && Date.now() - BT < 3e5) return BV; const [v, a, t] = await Promise.all([J("https://api.beefy.finance/vaults"), J("https://api.beefy.finance/apy/breakdown"), J("https://api.beefy.finance/tvl")]); if (!v.ok || !Array.isArray(v.j)) throw new Error("Beefy " + v.status); BV = { v: v.j, a: a.j || {}, t: t.j || {} }; BT = Date.now(); return BV; }
const bshape = (x, d, ch) => { const ap = d.a[x.id] || {}; return { id: x.id, name: x.name, vault: x.earnContractAddress, want: x.tokenAddress, want_symbol: x.token, want_decimals: x.tokenDecimals, platform: x.platformId, assets: x.assets, strategy_type: x.strategyTypeId || null, status: x.status, total_apy: ap.totalApy ?? null, vault_apr: ap.vaultApr ?? null, perf_fee: ap.beefyPerformanceFee ?? null, tvl_usd: d.t[YC[ch]] && d.t[YC[ch]][x.id] != null ? Math.round(d.t[YC[ch]][x.id]) : null, price_per_full_share: x.pricePerFullShare || null, risks: Object.keys(x.risks || {}).filter((k) => x.risks[k]), gov_vault: !!x.isGovVault }; };
export async function beefyvaults(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !YC[ch]) return bad("chain required (ethereum, base, arbitrum, optimism, polygon)");
  try { const d = await bdata(), a = q.asset ? String(q.asset).toLowerCase() : null;
    let out = d.v.filter((x) => x.chain === ch && x.status === "active" && (!a || (x.assets || []).some((s) => String(s).toLowerCase() === a))).map((x) => bshape(x, d, ch)).filter((x) => (x.tvl_usd || 0) >= Number(q.min_tvl ?? 10000));
    const sk = q.sort === "tvl" ? "tvl_usd" : "total_apy"; out.sort((x, y) => (y[sk] || 0) - (x[sk] || 0));
    return ok({ chain: ch, count: out.length, vaults: out.slice(0, lim(q)), build: "/v1/beefybuild?chain=" + ch + "&vault=<id|vault>", source: "api.beefy.finance" });
  } catch (e) { return err(e); }
}
export async function beefybuild(q) {
  const ch = q.chain ? ck(q.chain) : null; if (!ch || !YC[ch]) return bad("chain required"); if (!q.vault || !isA(q.from) || !q.amount) return bad("vault (id or address), from, amount required");
  const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "withdraw"].includes(act)) return bad("action deposit|withdraw");
  try { const d = await bdata(), k = String(q.vault).toLowerCase(), x = d.v.find((y) => y.chain === ch && (y.id === k || String(y.earnContractAddress).toLowerCase() === k)); if (!x) return bad("Beefy vault not found on " + ch);
    if (x.isGovVault) return bad("gov/reward-pool vaults use stake(); pick a standard moo vault"); const b = bshape(x, d, ch);
    if (act === "deposit" && x.status !== "active") return bad("vault status " + x.status + ": deposits paused");
    const amt = toUnits(q.amount, act === "deposit" ? Number(x.tokenDecimals) : 18); if (!amt) return bad("bad amount");
    if (act === "deposit") return await finish(ch, q.from, x.tokenAddress, amt, x.earnContractAddress, { to: x.earnContractAddress, data: sel("deposit(uint256)") + pad(amt.toString(16)), value: 0 }, { chain: ch, action: act, vault: b.vault, id: b.id, want: b.want_symbol, amount: q.amount, total_apy: b.total_apy, est_shares: b.price_per_full_share ? fmt(amt * 10n ** 18n / BigInt(b.price_per_full_share), 18) : null, note: "deposit of the vault want token (LP/asset); use addLiquidityUrl or a zap for raw tokens", source: "api.beefy.finance" });
    const t = await txbuild({ chain: ch, from: q.from, to: x.earnContractAddress, data: sel("withdraw(uint256)") + pad(amt.toString(16)), value: "0" });
    return ok({ chain: ch, action: act, vault: b.vault, id: b.id, shares: q.amount, est_want: b.price_per_full_share ? fmt(amt * BigInt(b.price_per_full_share) / 10n ** 18n, Number(x.tokenDecimals)) : null, ...pick(t), source: "api.beefy.finance" });
  } catch (e) { return err(e); }
}
