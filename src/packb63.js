// packb63 (builder B, 2026-11-02): Aerodrome (Base) gauges + veAERO on-chain: gauge emissions/APR, staked LP position + earned, claim tx, veNFT lock. $0 upstream (keyless RPC + coins.llama.fi prices).
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
const VOTER = "0x16613524e02ad97eDfeF371bC883F2F5d6C480A5", VE = "0xeBf418Fe2512e7E6bd9b87a8F0f294aCDC67e6B4", AERO = "0x940181a94A35A4569E4529A3CDfB74e38FD98631", CH = "base", DAY = 86400;
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], W = (h, i = 0) => (h && h.length >= 66 + 64 * i ? w(h, i) : null), A = (a) => pad(a.slice(2).toLowerCase()), adr = (h) => (h && h.length >= 66 ? checksum("0x" + h.slice(-40)) : null), Z = (a) => !a || /^0x0{40}$/i.test(a);
const str = (h) => { try { if (!h || h.length < 130) return null; const o = Number(w(h, 0)), n = Number(BigInt("0x" + h.slice(2 + o * 2, 66 + o * 2))); return new TextDecoder().decode(unhex(h.slice(66 + o * 2, 66 + o * 2 + n * 2))); } catch { return null; } };
const chk = (q) => !q.chain || ck(q.chain) === "base";
async function prices(ads) { try { const r = await fetch("https://coins.llama.fi/prices/current/" + ads.map((a) => "base:" + a).join(",")); const j = await r.json(); return Object.fromEntries(Object.entries(j.coins || {}).map(([k, v]) => [k.slice(5).toLowerCase(), v.price])); } catch { return {}; } }
async function gaugeOf(q) { if (isA(q.gauge)) return [q.gauge, null]; if (!isA(q.pool)) return [null, null]; const r = (await rpcBatch(CH, [call(VOTER, sel("gauges(address)") + A(q.pool))])).results[0], g = adr(r); return [Z(g) ? null : g, q.pool]; }
async function gaugeInfo(g, poolHint) { const r = (await rpcBatch(CH, [call(g, sel("rewardRate()")), call(g, "0x18160ddd"), call(g, sel("periodFinish()")), call(g, sel("stakingToken()")), call(VOTER, sel("isAlive(address)") + A(g)), call(g, sel("pool()"))])).results;
  const rate = W(r[0]); if (rate == null) throw new Error("not an Aerodrome gauge"); const pool = adr(r[3]) || adr(r[5]) || poolHint, isCL = !adr(r[3]) && !!adr(r[5]);
  const pr = (await rpcBatch(CH, [call(pool, sel("token0()")), call(pool, sel("token1()")), call(pool, sel("getReserves()")), call(pool, "0x18160ddd"), call(pool, "0x95d89b41"), call(pool, sel("stable()"))])).results, t0 = adr(pr[0]), t1 = adr(pr[1]);
  const dm = (await rpcBatch(CH, [call(t0, "0x313ce567"), call(t1, "0x313ce567"), call(t0, "0x95d89b41"), call(t1, "0x95d89b41")])).results, d0 = Number(W(dm[0]) ?? 18n), d1 = Number(W(dm[1]) ?? 18n);
  const px = await prices([AERO, t0, t1]), pA = px[AERO.toLowerCase()], p0 = px[t0.toLowerCase()], p1 = px[t1.toLowerCase()], per = Number(W(r[2]) ?? 0n), live = per > Date.now() / 1000;
  const perDay = live ? Number(rate) * DAY / 1e18 : 0; let stakedUsd = null, lpUsd = null;
  if (!isCL && W(pr[2]) != null && W(pr[3])) { const tvl = Number(W(pr[2], 0)) / 10 ** d0 * (p0 ?? NaN) + Number(W(pr[2], 1)) / 10 ** d1 * (p1 ?? NaN); if (Number.isFinite(tvl)) { lpUsd = tvl / (Number(W(pr[3])) / 1e18); stakedUsd = Number(W(r[1])) / 1e18 * lpUsd; } }
  return { gauge: checksum(g), pool: checksum(pool), pool_type: isCL ? "concentrated (Slipstream)" : W(pr[5]) ? "stable" : "volatile", token0: { address: t0, symbol: str(dm[2]), decimals: d0, price_usd: p0 ?? null }, token1: { address: t1, symbol: str(dm[3]), decimals: d1, price_usd: p1 ?? null }, alive: W(r[4]) !== 0n,
    emissions_aero_per_day: perDay, emissions_usd_per_day: pA ? perDay * pA : null, period_finish: per, epoch_live: live, staked: isCL ? null : fmt(W(r[1]) ?? 0n, 18), staked_usd: stakedUsd, lp_price_usd: lpUsd, emissions_apr: stakedUsd && pA ? perDay * pA * 365 / stakedUsd : null, aero_price_usd: pA ?? null, warnings: W(r[4]) === 0n ? ["gauge is killed in the Aerodrome Voter (no emissions); rewards already earned stay claimable"] : [], _rate: rate }; }
export async function aerogauge(q) {
  if (!chk(q)) return bad("Aerodrome is on base only"); if (!isA(q.pool) && !isA(q.gauge)) return bad("pool or gauge address required");
  try { const [g, p] = await gaugeOf(q); if (!g) return ok({ pool: q.pool, has_gauge: false }); const { _rate, ...i } = await gaugeInfo(g, p); return ok({ chain: CH, has_gauge: true, ...i, source: "Aerodrome Voter/Gauge eth_call + coins.llama.fi" }); } catch (e) { return err(e); }
}
export async function aerostake(q) {
  if (!chk(q)) return bad("Aerodrome is on base only"); if (!isA(q.address)) return bad("address required"); if (!isA(q.pool) && !isA(q.gauge)) return bad("pool or gauge address required");
  try { const [g, p] = await gaugeOf(q); if (!g) return bad("pool has no gauge"); const i = await gaugeInfo(g, p), r = (await rpcBatch(CH, [call(g, "0x70a08231" + A(q.address)), call(g, sel("earned(address)") + A(q.address)), call(i.pool, "0x70a08231" + A(q.address))])).results;
    const st = W(r[0]) ?? 0n, ea = W(r[1]) ?? 0n, un = W(r[2]) ?? 0n, sh = i.staked && Number(i.staked) ? Number(st) / 1e18 / Number(i.staked) : 0;
    return ok({ chain: CH, address: checksum(q.address), gauge: i.gauge, pool: i.pool, staked_lp: fmt(st, 18), unstaked_lp: fmt(un, 18), staked_usd: i.lp_price_usd ? Number(st) / 1e18 * i.lp_price_usd : null, share_of_gauge: sh, earned_aero: fmt(ea, 18), earned_usd: i.aero_price_usd ? Number(ea) / 1e18 * i.aero_price_usd : null, your_aero_per_day: i.emissions_aero_per_day * sh, emissions_apr: i.emissions_apr, claim: "/v1/aeroclaimbuild", note: i.pool_type.startsWith("concentrated") ? "CL gauges stake NFTs; balanceOf/earned shown as reported by the gauge" : undefined, source: "Aerodrome Gauge eth_call" });
  } catch (e) { return err(e); }
}
export async function aeroclaimbuild(q) {
  if (!chk(q)) return bad("Aerodrome is on base only"); if (!isA(q.from)) return bad("from address required"); if (!isA(q.pool) && !isA(q.gauge)) return bad("pool or gauge address required");
  try { const [g] = await gaugeOf(q); if (!g) return bad("pool has no gauge"); const e = W((await rpcBatch(CH, [call(g, sel("earned(address)") + A(q.from))])).results[0]) ?? 0n;
    const t = await txbuild({ chain: CH, from: q.from, to: g, data: sel("getReward(address)") + A(q.from), value: "0" }); return ok({ chain: CH, gauge: checksum(g), claimable_aero: fmt(e, 18), warnings: e === 0n ? ["nothing earned yet"] : [], ...pick(t) });
  } catch (e) { return err(e); }
}
export async function aerolock(q) {
  if (!chk(q)) return bad("Aerodrome is on base only"); const id = String(q.token_id ?? ""); if (!/^\d+$/.test(id)) return bad("token_id (veAERO NFT) required");
  try { const T = pad(BigInt(id).toString(16)), r = (await rpcBatch(CH, [call(VE, sel("locked(uint256)") + T), call(VE, sel("balanceOfNFT(uint256)") + T), call(VE, sel("ownerOf(uint256)") + T), call(VOTER, sel("lastVoted(uint256)") + T), call(VOTER, sel("usedWeights(uint256)") + T), call(VE, sel("voted(uint256)") + T), call(VE, sel("escrowType(uint256)") + T)])).results;
    const own = adr(r[2]); if (!own || Z(own)) return bad("veNFT not found (burned or nonexistent)"); const amt = BigInt.asIntN(128, W(r[0], 0) ?? 0n), end = Number(W(r[0], 1) ?? 0n), perm = (W(r[0], 2) ?? 0n) !== 0n, now = Date.now() / 1000, px = (await prices([AERO]))[AERO.toLowerCase()];
    return ok({ chain: CH, token_id: id, owner: own, locked_aero: fmt(amt < 0n ? 0n : amt, 18), locked_usd: px ? Number(amt) / 1e18 * px : null, lock_end: end, permanent: perm, expired: !perm && end > 0 && end < now, days_left: perm ? null : Math.max(0, (end - now) / DAY), voting_power: fmt(W(r[1]) ?? 0n, 18), voted_this_epoch: (W(r[5]) ?? 0n) !== 0n, last_voted: Number(W(r[3]) ?? 0n), used_weight: fmt(W(r[4]) ?? 0n, 18), escrow_type: ["normal", "locked (managed)", "managed"][Number(W(r[6]) ?? 0n)] || null, source: "Aerodrome VotingEscrow/Voter eth_call" });
  } catch (e) { return err(e); }
}
