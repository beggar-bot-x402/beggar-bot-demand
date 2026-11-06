// packb15 (builder B, 2026-11-02): noncegap, priceat, paymaster, usdcblacklist. $0 upstream (keyless RPCs, Chainlink on-chain feeds).
import { arch, ARCH, chainOf } from "./packb10.js";
import { rpcBatch, RPCS } from "./walletintel.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const word = (h, i) => (h && h.length >= 2 + 64 * (i + 1) ? BigInt("0x" + h.slice(2 + 64 * i, 2 + 64 * (i + 1))) : null);
const DEF = "base,ethereum,optimism,arbitrum,polygon";
const chains = (s) => String(s || DEF).split(",").map((x) => chainOf(x.trim(), RPCS)).filter(Boolean).slice(0, 6);

export async function noncegap(a) {
  const ad = a.address; if (!isA(ad)) return bad("address required");
  const out = await Promise.all(chains(a.chains).map(async (c) => { try { const { results: [l, p, g] } = await rpcBatch(c, [["eth_getTransactionCount", [ad, "latest"]], ["eth_getTransactionCount", [ad, "pending"]], ["eth_gasPrice", []]]); const L = Number(big(l)), P = Number(big(p)); return { chain: c, confirmed_nonce: L, pending_nonce: P, stuck_or_queued: P - L, next_nonce: P, gas_price_gwei: Number(big(g)) / 1e9, advice: P > L ? `${P - L} pending tx(s): replace nonce ${L} with higher fee to unstick` : "clear" }; } catch (e) { return { chain: c, error: String(e.message || e) }; } }));
  return ok({ address: ad, chains: out, any_pending: out.some((o) => o.stuck_or_queued > 0) });
}

const FEEDS = { ethereum: { "ETH/USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", "BTC/USD": "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", "USDC/USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", "USDT/USD": "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", "LINK/USD": "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c" }, base: { "ETH/USD": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", "USDC/USD": "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B" } };
export async function priceat(a) {
  const c = chainOf(a.chain || "ethereum", FEEDS); if (!c) return bad("chain: ethereum|base");
  const pair = String(a.pair || "ETH/USD").toUpperCase().replace("-", "/"); const feed = isA(a.feed) ? a.feed : FEEDS[c][pair]; if (!feed) return bad("pair one of " + Object.keys(FEEDS[c]).join(",") + " (or feed=0x aggregator)");
  const bl = String(a.blocks ?? a.block ?? "latest").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6); const tags = bl.map((b) => (/^\d+$/.test(b) ? "0x" + BigInt(b).toString(16) : b));
  try {
    const [d] = await arch(c, [["eth_call", [{ to: feed, data: "0x313ce567" }, "latest"]]]); const dec = Number(big(d));
    const res = await arch(c, tags.map((g) => ["eth_call", [{ to: feed, data: "0xfeaf968c" }, g]]));
    const pts = res.map((r, i) => { const ans = word(r, 1), upd = word(r, 3); return { block: bl[i], price: ans != null ? Number(ans) / 10 ** dec : null, updated_at: upd != null ? new Date(Number(upd) * 1000).toISOString() : null, round_id: word(r, 0)?.toString() ?? null }; });
    return ok({ chain: c, pair: a.feed ? null : pair, feed, decimals: dec, points: pts, source: "Chainlink aggregator latestRoundData (archive eth_call)" });
  } catch (e) { return err(e); }
}

const EP = { "v0.7": "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "v0.6": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "v0.8": "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" };
export async function paymaster(a) {
  const ad = a.address || a.paymaster; if (!isA(ad)) return bad("address (paymaster/account) required");
  const out = await Promise.all(chains(a.chains).map(async (c) => { try { const calls = Object.values(EP).map((e) => ["eth_call", [{ to: e, data: "0x5287ce12" + pad(ad) }, "latest"]]); calls.push(["eth_getCode", [ad, "latest"]]); const { results: R } = await rpcBatch(c, calls);
    const eps = Object.keys(EP).map((v, i) => { const r = R[i]; if (!r || r === "0x") return { entrypoint: v, available: false }; const dep = word(r, 0), st = word(r, 1), stake = word(r, 2), delay = word(r, 3), wt = word(r, 4); return { entrypoint: v, deposit_eth: Number(dep) / 1e18, staked: st === 1n, stake_eth: Number(stake) / 1e18, unstake_delay_sec: Number(delay), withdraw_time: wt ? new Date(Number(wt) * 1000).toISOString() : null }; });
    const total = eps.reduce((s, e) => s + (e.deposit_eth || 0), 0); return { chain: c, is_contract: !!R[R.length - 1] && R[R.length - 1] !== "0x", entrypoints: eps, total_deposit_eth: total, low_balance: total < 0.01 };
  } catch (e) { return { chain: c, error: String(e.message || e) }; } }));
  return ok({ address: ad, chains: out, needs_topup: out.filter((o) => o.low_balance && o.entrypoints?.some((e) => e.deposit_eth > 0 || e.staked)).map((o) => o.chain) });
}

const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
export async function usdcblacklist(a) {
  const addrs = String(a.address || a.addresses || "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10); if (!addrs.length || !addrs.every(isA)) return bad("address (csv up to 10) required");
  const out = await Promise.all(chains(a.chains).map(async (c) => { try { const { results: R } = await rpcBatch(c, [["eth_call", [{ to: USDC[c], data: "0x5c975abb" }, "latest"]], ...addrs.map((x) => ["eth_call", [{ to: USDC[c], data: "0xfe575a87" + pad(x) }, "latest"]])]); return { chain: c, usdc: USDC[c], paused: R[0] ? big(R[0]) === 1n : null, blacklisted: Object.fromEntries(addrs.map((x, i) => [x, R[i + 1] ? big(R[i + 1]) === 1n : null])) }; } catch (e) { return { chain: c, error: String(e.message || e) }; } }));
  const flagged = addrs.filter((x) => out.some((o) => o.blacklisted && o.blacklisted[x]));
  return ok({ addresses: addrs, flagged, can_receive_usdc: flagged.length === 0 && !out.some((o) => o.paused), source: "Circle FiatToken isBlacklisted/paused" });
}
