// packb58 (builder B, 2026-11-02): yield-bearing stablecoin savings on-chain: Sky sUSDS/sDAI stats + deposit/redeem tx, holder savings position, Ethena sUSDe stats. $0 upstream (keyless RPCs).
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
const V = { susds: { v: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD", u: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", us: "USDS" }, sdai: { v: "0x83F20F44975D03b1b09e64809B757c47f942BEeA", u: "0x6B175474E89094C44Da98b954EedeAC495271d0F", us: "DAI" }, susde: { v: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497", u: "0x4c9EDD5852cd905f086C759E8383e09bff1E68B3", us: "USDe" } };
const POT = "0x197E90f9FAD81970bA7976f33CbD77088E5D7cf7", E18 = 10n ** 18n, YR = 31536000;
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const W = (h, i = 0) => (h && h.length >= 66 + 64 * i ? w(h, i) : null);
const apyRay = (r) => (r ? (Number(r) / 1e27) ** YR - 1 : null);
async function vstats(k) { const x = V[k], extra = k === "susds" ? [call(x.v, sel("ssr()"))] : k === "sdai" ? [call(POT, sel("dsr()"))] : [call(x.v, sel("cooldownDuration()")), call(x.v, sel("getUnvestedAmount()"))];
  const r = (await rpcBatch("ethereum", [call(x.v, "0x01e1d114"), call(x.v, "0x18160ddd"), call(x.v, "0x07a2d13a" + pad(E18.toString(16))), ...extra])).results;
  const ta = W(r[0]), ts = W(r[1]), px = W(r[2]); if (ta == null || px == null) throw new Error("vault read failed: " + k);
  const o = { vault: k, address: checksum(x.v), asset: { symbol: x.us, address: checksum(x.u) }, share_price: Number(px) / 1e18, total_assets: fmt(ta, 18), total_supply: fmt(ts, 18) };
  if (k !== "susde") { o.rate_per_second_ray = W(r[3]).toString(); o.apy = apyRay(W(r[3])); o.rate_source = k === "susds" ? "sUSDS.ssr() (Sky Savings Rate)" : "Pot.dsr() (DAI Savings Rate)"; }
  else { o.cooldown_seconds = Number(W(r[3]) ?? 0n); o.unvested_rewards = r[4] ? fmt(W(r[4]), 18) : null; o.apy = null; o.note = "sUSDe yield is streamed via 8h vesting; with cooldown>0, redeem/withdraw are disabled: use cooldownShares then unstake (see /v1/susdecooldown)"; }
  return o; }
export async function skysavings(q) {
  const k = String(q.vault || "").toLowerCase(); if (q.vault != null && !["susds", "sdai"].includes(k)) return bad("vault must be susds or sdai");
  if (q.vault == null && q.all !== "true" && q.all !== true) return bad("vault (susds|sdai) required, or all=true");
  try { const ks = k ? [k] : ["susds", "sdai"], out = await Promise.all(ks.map(vstats)); return ok({ chain: "ethereum", vaults: out, build: "/v1/skysavingsbuild", source: "Sky sUSDS / sDAI (ERC-4626) + Pot eth_call" }); } catch (e) { return err(e); }
}
export async function susdestats(q) {
  if (q.amount == null && q.chain !== "ethereum") return bad("chain=ethereum (or amount) required");
  try { const o = await vstats("susde"); if (q.amount != null) { const a = toUnits(q.amount, 18); if (!a) return bad("bad amount"); o.quote = { usde_in: q.amount, susde_out: fmt(a * E18 / BigInt(Math.round(o.share_price * 1e18)), 18) }; } return ok({ chain: "ethereum", ...o, source: "Ethena StakedUSDeV2 eth_call" }); } catch (e) { return err(e); }
}
export async function savingsposition(q) {
  if (!isA(q.address)) return bad("address required");
  try { const ks = Object.keys(V), A = pad(q.address.slice(2).toLowerCase()), r = (await rpcBatch("ethereum", ks.flatMap((k) => [call(V[k].v, "0x70a08231" + A), call(V[k].u, "0x70a08231" + A)]))).results;
    const bal = ks.map((k, i) => ({ k, sh: W(r[2 * i]) ?? 0n, un: W(r[2 * i + 1]) ?? 0n }));
    const cv = (await rpcBatch("ethereum", bal.map((b) => call(V[b.k].v, "0x07a2d13a" + pad(b.sh.toString(16)))))).results;
    const cd = (await rpcBatch("ethereum", [call(V.susde.v, sel("cooldowns(address)") + A)])).results[0];
    const pos = bal.map((b, i) => ({ vault: b.k, shares: fmt(b.sh, 18), value_in_asset: fmt(W(cv[i]) ?? 0n, 18), asset: V[b.k].us, idle_asset_balance: fmt(b.un, 18) }));
    const tot = pos.reduce((s, p) => s + Number(p.value_in_asset), 0), cdEnd = W(cd, 0), cdAmt = W(cd, 1);
    return ok({ chain: "ethereum", address: checksum(q.address), positions: pos, total_savings_usd_approx: tot, susde_cooldown: cdAmt ? { underlying: fmt(cdAmt, 18), cooldown_end: Number(cdEnd), claimable: Number(cdEnd) <= Date.now() / 1000 } : null, source: "ERC-4626 balanceOf/convertToAssets eth_call" });
  } catch (e) { return err(e); }
}
export async function skysavingsbuild(q) {
  const k = String(q.vault || "").toLowerCase(), act = String(q.action || "deposit").toLowerCase();
  if (!V[k]) return bad("vault required: susds, sdai or susde"); if (!isA(q.from)) return bad("from address required"); if (!["deposit", "redeem"].includes(act)) return bad("action must be deposit or redeem");
  const a = toUnits(q.amount, 18); if (!q.amount || !a) return bad("amount required"); const rc = isA(q.receiver) ? q.receiver : q.from, x = V[k];
  try { const ex = { chain: "ethereum", vault: k, action: act, amount: q.amount, receiver: checksum(rc) };
    if (act === "deposit") { const pv = (await rpcBatch("ethereum", [call(x.v, sel("previewDeposit(uint256)") + pad(a.toString(16)))])).results[0]; ex.expected_shares = W(pv) != null ? fmt(W(pv), 18) : null;
      return await finish("ethereum", q.from, x.u, a, x.v, { to: x.v, data: "0x6e553f65" + pad(a.toString(16)) + pad(rc.slice(2)), value: 0 }, ex); }
    if (k === "susde") { const c = W((await rpcBatch("ethereum", [call(x.v, sel("cooldownDuration()"))])).results[0]) ?? 0n; if (c > 0n) { const t = await txbuild({ chain: "ethereum", from: q.from, to: x.v, data: sel("cooldownShares(uint256)") + pad(a.toString(16)), value: "0" }); return ok({ ...ex, action: "cooldownShares", cooldown_seconds: Number(c), note: "sUSDe redeem is disabled while cooldown>0; this starts the cooldown, then call unstake(receiver) after it ends", ...pick(t) }); } }
    const pv = (await rpcBatch("ethereum", [call(x.v, sel("previewRedeem(uint256)") + pad(a.toString(16)))])).results[0]; ex.expected_assets = W(pv) != null ? fmt(W(pv), 18) : null;
    const t = await txbuild({ chain: "ethereum", from: q.from, to: x.v, data: "0xba087652" + pad(a.toString(16)) + pad(rc.slice(2)) + pad(q.from.slice(2)), value: "0" }); return ok({ ...ex, ...pick(t) });
  } catch (e) { return err(e); }
}
