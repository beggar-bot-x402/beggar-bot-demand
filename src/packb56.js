// packb56 (builder B, 2026-11-02): Rocket Pool rETH + ether.fi eETH/weETH on-chain: rethstats, rethbuild, weethstats, weethbuild. $0 upstream (keyless RPCs).
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
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], S = (s) => sel(s), CH = "ethereum";
const RS = "0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46", RETH = "0xae78736Cd615f374D3085123A210448E74Fc6393";
const EETH = "0x35fA164735182de50811E8e2E824cFb9B6118ac2", WEETH = "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", ELP = "0x308861A430be4cce5502d0A12724771Fc6DaF216";
const e18 = (h) => h && h.length >= 66 ? fmt(w(h, 0), 18) : null;
const needEth = (q) => { if (q.chain && ck(q.chain) !== "ethereum") return bad("Ethereum mainnet only (chain=ethereum)"); return null; };
async function rocket() { const ks = ["rocketDepositPool", "rocketDAOProtocolSettingsDeposit"].map((n) => call(RS, S("getAddress(bytes32)") + keccakHex("contract.address" + n).slice(2))); const r = await rpcBatch(CH, ks); return { dp: "0x" + r.results[0].slice(-40), set: "0x" + r.results[1].slice(-40) }; }
export async function rethstats(q) {
  const b = needEth(q); if (b) return b; if (!q.chain && !q.amount) return bad("chain=ethereum required");
  try { const { dp, set } = await rocket(), r = await rpcBatch(CH, [call(RETH, S("getExchangeRate()")), call(RETH, S("getTotalCollateral()")), call(RETH, "0x18160ddd"), call(dp, S("getBalance()")), call(dp, S("getMaximumDepositAmount()")), call(set, S("getDepositEnabled()")), call(set, S("getMinimumDeposit()")), call(set, S("getDepositFee()")), call(set, S("getMaximumDepositPoolSize()"))]);
    const rate = Number(w(r.results[0], 0)) / 1e18, fee = r.results[7] ? Number(w(r.results[7], 0)) / 1e18 : null, amt = q.amount ? toUnits(q.amount, 18) : null;
    return ok({ chain: CH, reth: RETH, deposit_pool: checksum(dp), eth_per_reth: rate, reth_per_eth: 1 / rate, reth_supply: e18(r.results[2]), tvl_eth: +(Number(e18(r.results[2])) * rate).toFixed(2), burn_collateral_eth: e18(r.results[1]), deposit_pool_balance_eth: e18(r.results[3]), max_deposit_now_eth: e18(r.results[4]), deposit_pool_cap_eth: e18(r.results[8]), deposits_enabled: r.results[5] ? w(r.results[5], 0) === 1n : null, minimum_deposit_eth: e18(r.results[6]), deposit_fee_pct: fee != null ? fee * 100 : null,
      quote: amt ? { deposit_eth: q.amount, reth_out: +(Number(q.amount) * (1 - (fee || 0)) / rate).toFixed(8), burn_reth: q.amount, eth_out: +(Number(q.amount) * rate).toFixed(8), burn_possible: w(r.results[1], 0) >= amt * BigInt(Math.round(rate * 1e6)) / 1000000n } : null, build: "/v1/rethbuild", source: "RocketStorage + rETH + RocketDepositPool eth_call" });
  } catch (e) { return err(e); }
}
export async function rethbuild(q) {
  const b = needEth(q); if (b) return b; if (!isA(q.from)) return bad("from address required"); const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "burn"].includes(act)) return bad("action: deposit or burn"); const amt = toUnits(q.amount, 18); if (!amt) return bad("amount required (ETH for deposit, rETH for burn)");
  try { const { dp } = await rocket(); const t = act === "deposit" ? await txbuild({ chain: CH, from: q.from, to: dp, data: S("deposit()"), value: amt.toString() }) : await txbuild({ chain: CH, from: q.from, to: RETH, data: S("burn(uint256)") + pad(amt.toString(16)), value: "0" });
    return ok({ chain: CH, protocol: "rocketpool", action: act, to: act === "deposit" ? checksum(dp) : RETH, amount: q.amount, note: act === "deposit" ? "reverts if deposits are disabled or the pool is full; check /v1/rethstats max_deposit_now_eth" : "burn needs enough burn collateral; otherwise swap rETH on a DEX", ...pick(t) });
  } catch (e) { return err(e); }
}
export async function weethstats(q) {
  const b = needEth(q); if (b) return b; if (!q.chain && !q.amount) return bad("chain=ethereum required");
  try { const r = await rpcBatch(CH, [call(WEETH, S("getRate()")), call(WEETH, "0x18160ddd"), call(ELP, S("getTotalPooledEther()")), call(EETH, "0x18160ddd"), call(EETH, S("totalShares()")), call(ELP, S("paused()"))]);
    const rate = Number(w(r.results[0], 0)) / 1e18;
    return ok({ chain: CH, eeth: EETH, weeth: WEETH, liquidity_pool: ELP, eth_per_weeth: rate, weeth_per_eth: 1 / rate, weeth_supply: e18(r.results[1]), weeth_tvl_eth: +(Number(e18(r.results[1])) * rate).toFixed(2), total_pooled_eth: e18(r.results[2]), eeth_supply: e18(r.results[3]), eeth_shares: e18(r.results[4]), pool_paused: r.results[5] ? w(r.results[5], 0) === 1n : null, quote: q.amount ? { eth_in: q.amount, eeth_out: q.amount, weeth_after_wrap: +(Number(q.amount) / rate).toFixed(8) } : null, build: "/v1/weethbuild", source: "ether.fi LiquidityPool + weETH eth_call" });
  } catch (e) { return err(e); }
}
export async function weethbuild(q) {
  const b = needEth(q); if (b) return b; if (!isA(q.from)) return bad("from address required"); const act = String(q.action || "deposit").toLowerCase(); if (!["deposit", "wrap", "unwrap"].includes(act)) return bad("action: deposit (ETH->eETH), wrap (eETH->weETH) or unwrap"); const amt = toUnits(q.amount, 18); if (!amt) return bad("amount required");
  try { const extra = { chain: CH, protocol: "ether.fi", action: act, amount: q.amount };
    if (act === "wrap") return await finish(CH, q.from, EETH, amt, WEETH, { to: WEETH, data: S("wrap(uint256)") + pad(amt.toString(16)), value: 0 }, extra);
    const t = act === "deposit" ? await txbuild({ chain: CH, from: q.from, to: ELP, data: S("deposit()"), value: amt.toString() }) : await txbuild({ chain: CH, from: q.from, to: WEETH, data: S("unwrap(uint256)") + pad(amt.toString(16)), value: "0" });
    return ok({ ...extra, to: act === "deposit" ? ELP : WEETH, note: act === "deposit" ? "mints eETH 1:1; then wrap with action=wrap for weETH. Exits to ETH go through the ether.fi withdrawal queue" : null, ...pick(t) });
  } catch (e) { return err(e); }
}
