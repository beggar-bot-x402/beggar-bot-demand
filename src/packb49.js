// packb49 (builder B, 2026-11-02): savingsrates, savingsbuild, susdecooldown, usdsconvert. $0 upstream (keyless Ethereum RPC + Ethena public yields).
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
const V = { susds: { vault: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD", asset: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", sym: "USDS", rate: "ssr()" }, sdai: { vault: "0x83F20F44975D03b1b09e64809B757c47f942BEeA", asset: "0x6B175474E89094C44Da98b954EedeAC495271d0F", sym: "DAI", rate: "dsr()", rateAt: "0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7" }, susde: { vault: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497", asset: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", sym: "USDe" } };
const RAY = 10n ** 27n, E18 = 10n ** 18n, call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const apy = (r) => r ? +((Math.pow(Number(r) / 1e27, 31536000) - 1) * 100).toFixed(4) : null;
const eth = (q) => { const c = q.chain ? ck(q.chain) : "ethereum"; return c === "ethereum"; };
// ---- savingsrates ----
export async function savingsrates(q) {
  if (!q.chain) return bad("chain=ethereum required"); if (!eth(q)) return bad("savings vaults live on Ethereum");
  try { const ks = Object.keys(V), calls = [];
    for (const k of ks) { const v = V[k]; calls.push(call(v.vault, sel("totalAssets()")), call(v.vault, sel("totalSupply()")), call(v.vault, sel("convertToAssets(uint256)") + pad(E18.toString(16))), call(v.rateAt || v.vault, v.rate ? sel(v.rate) : sel("totalSupply()"))); }
    calls.push(call(V.susde.vault, sel("cooldownDuration()")));
    const [r, ey] = await Promise.all([rpcBatch("ethereum", calls), J("https://ethena.fi/api/yields/protocol-and-staking-yield").catch(() => null)]); const x = r.results, e = ey && ey.j;
    const out = ks.map((k, n) => { const v = V[k], b = 4 * n; const ta = x[b] ? w(x[b], 0) : null; return { token: k === "susds" ? "sUSDS" : k === "sdai" ? "sDAI" : "sUSDe", vault: v.vault, asset: v.sym, asset_address: v.asset, total_assets: ta != null ? fmt(ta, 18) : null, total_supply: x[b + 1] ? fmt(w(x[b + 1], 0), 18) : null, share_price: x[b + 2] ? fmt(w(x[b + 2], 0), 18) : null, apy_pct: v.rate ? apy(x[b + 3] ? w(x[b + 3], 0) : null) : (e && e.stakingYield ? e.stakingYield.value : null), apy_source: v.rate ? "on-chain " + v.rate : "ethena.fi stakingYield", ...(k === "susde" ? { avg30d_apy_pct: e && e.avg30dSusdeYield ? e.avg30dSusdeYield.value : null, cooldown_seconds: x[12] ? Number(w(x[12], 0)) : null } : {}) }; });
    return ok({ chain: "ethereum", vaults: out.sort((a, b) => (b.apy_pct || 0) - (a.apy_pct || 0)), build: "/v1/savingsbuild?vault=susds|sdai|susde", rpc: r.rpc, source: "keyless RPC + ethena.fi" });
  } catch (e) { return err(e); }
}
// ---- savingsbuild: ERC4626 deposit/redeem ----
export async function savingsbuild(q) {
  if (!eth(q)) return bad("Ethereum only"); const k = String(q.vault || "").toLowerCase(), v = V[k]; if (!v) return bad("vault must be susds, sdai or susde");
  if (!isA(q.from) || !q.amount) return bad("from and amount required"); const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "redeem"].includes(act)) return bad("action deposit|redeem");
  const amt = toUnits(q.amount, 18); if (!amt) return bad("bad amount"); const me = pad(q.from.slice(2));
  try { const r = await rpcBatch("ethereum", [call(v.vault, sel(act === "deposit" ? "previewDeposit(uint256)" : "previewRedeem(uint256)") + pad(amt.toString(16))), ...(k === "susde" ? [call(v.vault, sel("cooldownDuration()"))] : [])]);
    const pv = r.results[0] ? fmt(w(r.results[0], 0), 18) : null;
    if (act === "deposit") return await finish("ethereum", q.from, v.asset, amt, v.vault, { to: v.vault, data: sel("deposit(uint256,address)") + pad(amt.toString(16)) + me, value: 0 }, { chain: "ethereum", action: act, vault: k, asset: v.sym, amount: q.amount, est_shares: pv, source: "on-chain ERC4626" });
    if (k === "susde" && r.results[1] && w(r.results[1], 0) > 0n) return bad("sUSDe has a cooldown (" + Number(w(r.results[1], 0)) / 3600 + "h); use /v1/susdecooldown action=start then unstake");
    const t = await txbuild({ chain: "ethereum", from: q.from, to: v.vault, data: sel("redeem(uint256,address,address)") + pad(amt.toString(16)) + me + me, value: "0" });
    return ok({ chain: "ethereum", action: act, vault: k, shares: q.amount, est_assets: pv, asset: v.sym, ...pick(t), source: "on-chain ERC4626" });
  } catch (e) { return err(e); }
}
// ---- susdecooldown: status + start/unstake builder ----
export async function susdecooldown(q) {
  const a = q.address || q.from; if (!isA(a)) return bad("address required"); const act = String(q.action || "status").toLowerCase(); if (!["status", "start", "unstake"].includes(act)) return bad("action status|start|unstake");
  try { const S = V.susde.vault, r = await rpcBatch("ethereum", [call(S, sel("cooldowns(address)") + pad(a.slice(2))), call(S, sel("balanceOf(address)") + pad(a.slice(2))), call(S, sel("cooldownDuration()")), ["eth_getBlockByNumber", ["latest", false]]]);
    const end = r.results[0] ? Number(w(r.results[0], 0)) : 0, und = r.results[0] ? w(r.results[0], 1) : 0n, bal = r.results[1] ? w(r.results[1], 0) : 0n, dur = r.results[2] ? Number(w(r.results[2], 0)) : null, now = r.results[3] ? Number(BigInt(r.results[3].timestamp)) : Math.floor(Date.now() / 1e3);
    const st = { address: checksum(a), susde_balance: fmt(bal, 18), cooling_usde: fmt(und, 18), cooldown_end: end ? new Date(end * 1e3).toISOString() : null, seconds_left: end ? Math.max(end - now, 0) : null, claimable: !!end && und > 0n && end <= now, cooldown_duration_s: dur };
    if (act === "status") return ok({ chain: "ethereum", ...st, source: "sUSDe on-chain" });
    if (act === "unstake") { if (!st.claimable) return bad(und > 0n ? "cooldown not finished: " + st.seconds_left + "s left" : "nothing cooling down"); const t = await txbuild({ chain: "ethereum", from: a, to: S, data: sel("unstake(address)") + pad(a.slice(2)), value: "0" }); return ok({ chain: "ethereum", action: act, ...st, ...pick(t) }); }
    const amt = q.amount ? toUnits(q.amount, 18) : bal; if (!amt || amt > bal) return bad("amount (sUSDe shares) required and <= balance " + fmt(bal, 18));
    const t = await txbuild({ chain: "ethereum", from: a, to: S, data: sel("cooldownShares(uint256)") + pad(amt.toString(16)), value: "0" });
    return ok({ chain: "ethereum", action: act, shares: fmt(amt, 18), ...st, note: und > 0n ? "adds to existing cooldown and resets its timer" : null, ...pick(t) });
  } catch (e) { return err(e); }
}
// ---- usdsconvert: DAI <-> USDS 1:1 via Sky DaiUsds converter ----
const DU = "0x3225737a9Bbb6473CB4a45b7244ACa2BeFdB276A";
export async function usdsconvert(q) {
  if (!eth(q)) return bad("Ethereum only"); const dir = String(q.direction || "").toLowerCase(); if (!["dai_to_usds", "usds_to_dai"].includes(dir)) return bad("direction dai_to_usds|usds_to_dai");
  if (!isA(q.from) || !q.amount) return bad("from and amount required"); const amt = toUnits(q.amount, 18); if (!amt) return bad("bad amount"); const rc = isA(q.recipient) ? q.recipient : q.from;
  try { const d2u = dir === "dai_to_usds", tin = d2u ? V.sdai.asset : V.susds.asset;
    return await finish("ethereum", q.from, tin, amt, DU, { to: DU, data: sel(d2u ? "daiToUsds(address,uint256)" : "usdsToDai(address,uint256)") + pad(rc.slice(2)) + pad(amt.toString(16)), value: 0 }, { chain: "ethereum", direction: dir, converter: DU, amount_in: q.amount, amount_out: q.amount, rate: "1:1", recipient: checksum(rc), source: "Sky DaiUsds converter" });
  } catch (e) { return err(e); }
}
