// packb51 (builder B, 2026-11-02): merklrewards, merklclaim, merklopps, morphovaults. $0 upstream (Merkl v4 API + Morpho Blue API + keyless RPCs).
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
import { J } from "./packb40.js";
const MC = { ethereum: 1, base: 8453, arbitrum: 42161, optimism: 10, polygon: 137 }, MA = "https://api.merkl.xyz/v4", DIST = "0x3Ef3D8bA38EBe18DB133cEc108f4D14CE00Dd9Ae";
const lim = (q, d = 25) => Math.min(Math.max(Number(q.limit) || d, 1), 100);
const chq = (q) => { const c = q.chain ? ck(q.chain) : null; return c && MC[c] ? c : null; };
async function rewards(a, ch) { const r = await J(MA + "/users/" + a + "/rewards?chainId=" + MC[ch]); if (!r.ok || !Array.isArray(r.j)) throw new Error("Merkl rewards " + r.status); const out = []; for (const c of r.j) for (const x of c.rewards || []) { const d = Number(x.token.decimals), un = BigInt(x.amount) - BigInt(x.claimed); out.push({ token: x.token.symbol, token_address: x.token.address, decimals: d, price_usd: x.token.price ?? null, earned: fmt(BigInt(x.amount), d), claimed: fmt(BigInt(x.claimed), d), unclaimed: fmt(un > 0n ? un : 0n, d), pending: fmt(BigInt(x.pending || 0), d), unclaimed_usd: +(Number(un) / 10 ** d * (x.token.price || 0)).toFixed(4), campaigns: (x.breakdowns || []).length, _amt: x.amount, _proofs: x.proofs || [], _un: un }); } return out; }
const strip = (x) => { const { _amt, _proofs, _un, ...o } = x; return o; };
export async function merklrewards(q) {
  const a = q.address || q.from; if (!isA(a)) return bad("address required"); const ch = chq(q); if (!ch) return bad("chain required (ethereum, base, arbitrum, optimism, polygon)");
  try { const rs = await rewards(a, ch), un = rs.filter((x) => x._un > 0n).sort((x, y) => y.unclaimed_usd - x.unclaimed_usd);
    return ok({ chain: ch, address: checksum(a), tokens: rs.length, claimable_count: un.length, claimable_usd: +un.reduce((s, x) => s + x.unclaimed_usd, 0).toFixed(2), claimable: un.map(strip), fully_claimed: rs.filter((x) => x._un <= 0n).map(strip).slice(0, 20), claim: un.length ? "/v1/merklclaim?chain=" + ch + "&address=" + a : null, source: "api.merkl.xyz v4" });
  } catch (e) { return err(e); }
}
const enc = { addrs: (xs) => arr(xs.map((x) => pad(x.slice(2)))), nums: (xs) => arr(xs.map((x) => pad(BigInt(x).toString(16)))),
  proofs: (ps) => { const inner = ps.map((p) => arr(p.map((h) => pad(h.slice(2))))); let off = 32 * ps.length, heads = ""; for (const t of inner) { heads += pad(off.toString(16)); off += t.length / 2; } return pad(ps.length.toString(16)) + heads + inner.join(""); } };
export async function merklclaim(q) {
  const a = q.address || q.from; if (!isA(a)) return bad("address required"); const ch = chq(q); if (!ch) return bad("chain required");
  try { let rs = (await rewards(a, ch)).filter((x) => x._un > 0n && x._proofs.length); if (q.tokens) { const want = String(q.tokens).toLowerCase().split(","); rs = rs.filter((x) => want.includes(x.token.toLowerCase()) || want.includes(x.token_address.toLowerCase())); }
    if (!rs.length) return ok({ chain: ch, address: checksum(a), claimable: false, note: "nothing unclaimed with proofs (rewards may still be pending the next root)" });
    rs = rs.slice(0, 20); const parts = [enc.addrs(rs.map(() => a)), enc.addrs(rs.map((x) => x.token_address)), enc.nums(rs.map((x) => x._amt)), enc.proofs(rs.map((x) => x._proofs))];
    let off = 128, heads = ""; for (const p of parts) { heads += pad(off.toString(16)); off += p.length / 2; }
    const data = sel("claim(address[],address[],uint256[],bytes32[][])") + heads + parts.join("");
    const t = await txbuild({ chain: ch, from: isA(q.from) ? q.from : a, to: DIST, data, value: "0" });
    return ok({ chain: ch, address: checksum(a), distributor: DIST, claiming: rs.map((x) => ({ token: x.token, amount: x.unclaimed, usd: x.unclaimed_usd })), claim_usd: +rs.reduce((s, x) => s + x.unclaimed_usd, 0).toFixed(2), note: "claims cumulative amounts; anyone may submit for the user, tokens go to the user", ...pick(t), source: "api.merkl.xyz proofs -> Merkl Distributor" });
  } catch (e) { return err(e); }
}
export async function merklopps(q) {
  const ch = chq(q); if (!ch) return bad("chain required");
  try { const u = MA + "/opportunities?chainId=" + MC[ch] + "&status=LIVE&items=" + lim(q) + "&sort=" + (q.sort === "apr" ? "apr" : "tvl") + "&order=desc" + (q.action ? "&action=" + encodeURIComponent(String(q.action).toUpperCase()) : "") + (q.search ? "&name=" + encodeURIComponent(q.search) : "") + (q.min_tvl ? "&minimumTvl=" + Number(q.min_tvl) : "");
    const r = await J(u); if (!r.ok || !Array.isArray(r.j)) return err("Merkl opportunities " + r.status);
    const out = r.j.map((o) => ({ name: o.name, action: o.action, protocol: o.protocol ? o.protocol.name : null, identifier: o.identifier, tokens: (o.tokens || []).map((t) => t.symbol), tvl_usd: Math.round(o.tvl || 0), reward_apr_pct: o.apr ?? null, total_apr_pct: o.totalApr ?? null, daily_rewards_usd: o.dailyRewards ? Math.round(o.dailyRewards) : null, live_campaigns: o.liveCampaigns ?? null, deposit_url: o.depositUrl || null }));
    return ok({ chain: ch, count: out.length, opportunities: out, source: "api.merkl.xyz v4 opportunities" });
  } catch (e) { return err(e); }
}
export async function morphovaults(q) {
  const ch = chq(q); if (!ch || !["ethereum", "base", "arbitrum", "optimism", "polygon"].includes(ch)) return bad("chain required (ethereum, base, arbitrum, optimism, polygon)");
  try { const asset = q.asset ? String(q.asset) : null, w2 = "chainId_in:[" + MC[ch] + "]" + (asset ? (isA(asset) ? ', assetAddress_in:["' + asset + '"]' : ', assetSymbol_in:["' + asset.replace(/[^A-Za-z0-9.]/g, "") + '"]') : "") + (q.whitelisted === "false" ? "" : ", listed:true");
    const gq = "{ vaults(first:" + lim(q) + ", orderBy:" + (q.sort === "apy" ? "NetApy" : "TotalAssetsUsd") + ", orderDirection:Desc, where:{" + w2 + "}){ items{ address name symbol asset{symbol address decimals} state{ totalAssetsUsd apy netApy fee curator allocation{ supplyAssetsUsd market{ collateralAsset{symbol} lltv } } } } } }";
    const r = await J("https://blue-api.morpho.org/graphql", { method: "POST", body: JSON.stringify({ query: gq }) }); const it = r.j && r.j.data && r.j.data.vaults && r.j.data.vaults.items; if (!it) return err("Morpho API: " + ((r.j && r.j.errors && r.j.errors[0].message) || r.status));
    const out = it.map((v) => { const s = v.state || {}, al = (s.allocation || []).filter((x) => x.supplyAssetsUsd > 1).sort((a, b) => b.supplyAssetsUsd - a.supplyAssetsUsd); return { name: v.name, vault: v.address, symbol: v.symbol, asset: v.asset.symbol, asset_address: v.asset.address, tvl_usd: Math.round(s.totalAssetsUsd || 0), apy_pct: s.apy != null ? +(s.apy * 100).toFixed(3) : null, net_apy_pct: s.netApy != null ? +(s.netApy * 100).toFixed(3) : null, fee_pct: s.fee != null ? s.fee * 100 : null, curator: s.curator || null, top_collateral: al.slice(0, 5).map((x) => ({ collateral: x.market.collateralAsset ? x.market.collateralAsset.symbol : "idle", share: s.totalAssetsUsd ? +(x.supplyAssetsUsd / s.totalAssetsUsd).toFixed(3) : null, lltv: x.market.lltv ? Number(BigInt(x.market.lltv) * 1000n / 10n ** 18n) / 1000 : null })) }; });
    return ok({ chain: ch, count: out.length, vaults: out, build: "/v1/vaultbuild (ERC4626 deposit)", source: "blue-api.morpho.org" });
  } catch (e) { return err(e); }
}
