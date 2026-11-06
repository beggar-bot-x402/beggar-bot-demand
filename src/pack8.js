// Pack 8 (2026-11-02 wave 2): /v1/l2status, /v1/pairliq, /v1/mevstyle, /v1/vault4626. Keyless public RPCs only, $0 upstream, fails soft.
import { keccakHex, checksum } from "./evm.js";
import { rpcBatch } from "./walletintel.js";
import { decodeStr, fmtUnits } from "./onchain.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const isH = (h) => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h.trim());
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const word = (h, i) => "0x" + (h || "0x").slice(2 + 64 * i, 66 + 64 * i);
const addrW = (h, i = 0) => "0x" + word(h, i).slice(-40);
const CH = { base: "base", "8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", optimism: "optimism", op: "optimism", "10": "optimism", arbitrum: "arbitrum", arb: "arbitrum", "42161": "arbitrum", polygon: "polygon", "137": "polygon" };
const chainOf = (c) => CH[String(c ?? "base").trim().toLowerCase()] || null;
const CHAINS_MSG = "chain must be base, ethereum, optimism, arbitrum, polygon";
const STABLE = new Set(["USDC", "USDT", "DAI", "USDBC", "USDS", "USDE", "PYUSD", "FDUSD", "LUSD", "FRAX", "USDC.E", "EURC"]);

// ---- /v1/l2status ----
export async function l2status(a) {
  const want = String(a.chains ?? "base,optimism,arbitrum,ethereum").split(",").map((x) => chainOf(x)).filter(Boolean);
  if (!want.length || want.length > 5) return bad("chains: 1–5 of " + CHAINS_MSG.slice(9));
  const out = await Promise.all([...new Set(want)].map(async (ch) => {
    const tags = ["latest", "safe", "finalized"];
    try { const { results: r, rpc } = await rpcBatch(ch, tags.map((t) => ["eth_getBlockByNumber", [t, false]]));
      const now = Math.floor(Date.now() / 1000); const b = {};
      tags.forEach((t, i) => { const x = r[i]; b[t === "latest" ? "unsafe" : t] = x ? { number: Number(BigInt(x.number)), timestamp: Number(BigInt(x.timestamp)), age_s: now - Number(BigInt(x.timestamp)), hash: x.hash } : null; });
      const L = b.unsafe, F = b.finalized, S = b.safe;
      const lag = (y) => (L && y ? L.number - y.number : null);
      const flags = []; if (L && L.age_s > 60) flags.push("head_stale_gt_60s"); if (F && F.age_s > (ch === "ethereum" ? 1200 : 7200)) flags.push("finality_lagging"); if (!F) flags.push("finalized_tag_unsupported");
      return { chain: ch, rpc, ...b, safe_lag_blocks: lag(S), finalized_lag_blocks: lag(F), finality_delay_s: L && F ? L.timestamp - F.timestamp : null, healthy: !flags.filter((f) => f !== "finalized_tag_unsupported").length, flags };
    } catch (e) { return { chain: ch, error: String(e.message || e), healthy: false }; }
  }));
  return { status: 200, body: { checked_at: new Date().toISOString(), chains: out, note: "unsafe=latest head; safe/finalized from RPC block tags. OP-stack safe = derived from L1 batch; finalized = L1-finalized." } };
}

// ---- /v1/pairliq ----
// Uniswap v2 / Aerodrome (getReserves) and Uniswap v3 (slot0+liquidity+balances) pool reader.
export async function pairliq(a) {
  const ch = chainOf(a.chain); if (!ch) return bad(CHAINS_MSG);
  const pool = String(a.pool ?? a.pair ?? "").trim(); if (!isA(pool)) return bad("pool: 0x pair/pool address required (Uniswap v2/v3, Aerodrome, Sushi, PancakeSwap)");
  let r, rpc;
  try { ({ results: r, rpc } = await rpcBatch(ch, [call(pool, sel("token0()")), call(pool, sel("token1()")), call(pool, sel("getReserves()")), call(pool, sel("slot0()")), call(pool, sel("liquidity()")), call(pool, sel("fee()")), call(pool, sel("stable()")), ["eth_getCode", [pool, "latest"]]])); }
  catch (e) { return { status: 502, body: { error: "public rpc unavailable: " + (e.message || e) } }; }
  if (!r[7] || r[7] === "0x") return { status: 404, body: { error: "no contract at pool address", chain: ch } };
  if (!r[0] || r[0] === "0x" || !r[1] || r[1] === "0x") return { status: 422, body: { error: "not a recognized pair: token0()/token1() missing", chain: ch } };
  const t = [addrW(r[0]), addrW(r[1])];
  const v3 = r[3] && r[3].length >= 130 && (!r[2] || r[2] === "0x");
  let m; try { m = (await rpcBatch(ch, t.flatMap((x) => [call(x, sel("symbol()")), call(x, sel("decimals()")), call(x, sel("balanceOf(address)") + pool.slice(2).toLowerCase().padStart(64, "0"))]))).results; } catch { m = []; }
  const tok = t.map((x, i) => ({ address: checksum(x), symbol: decodeStr(m[3 * i]) || null, decimals: m[3 * i + 1] && m[3 * i + 1] !== "0x" ? Number(big(m[3 * i + 1])) : 18, pool_balance_raw: big(m[3 * i + 2]) }));
  let res0, res1, type, price, extra = {};
  if (!v3 && r[2] && r[2] !== "0x") { res0 = big(word(r[2], 0)); res1 = big(word(r[2], 1)); type = r[6] && r[6] !== "0x" ? (big(r[6]) ? "aerodrome_stable" : "aerodrome_volatile") : "uniswap_v2_style";
    price = Number(res0) ? (Number(res1) / 10 ** tok[1].decimals) / (Number(res0) / 10 ** tok[0].decimals) : null; extra.last_update_ts = Number(big(word(r[2], 2))); }
  else if (v3) { type = "uniswap_v3_style"; res0 = tok[0].pool_balance_raw; res1 = tok[1].pool_balance_raw; const sp = big(word(r[3], 0)); const p = (Number(sp) / 2 ** 96) ** 2; price = p * 10 ** (tok[0].decimals - tok[1].decimals);
    let tick = big(word(r[3], 1)); if (tick >= 1n << 255n) tick -= 1n << 256n; extra = { sqrtPriceX96: sp.toString(), tick: Number(BigInt.asIntN(24, tick)), active_liquidity: big(r[4]).toString(), fee_tier_bps: r[5] && r[5] !== "0x" ? Number(big(r[5])) / 100 : null }; }
  else return { status: 422, body: { error: "pool has token0/1 but neither getReserves() nor slot0()", chain: ch, tokens: tok.map(({ pool_balance_raw, ...x }) => x) } };
  const amt = [Number(res0) / 10 ** tok[0].decimals, Number(res1) / 10 ** tok[1].decimals];
  const s0 = STABLE.has(String(tok[0].symbol).toUpperCase()), s1 = STABLE.has(String(tok[1].symbol).toUpperCase());
  const tvl = s1 ? amt[1] * 2 : s0 ? amt[0] * 2 : null;
  const rp = (x) => (x == null || !isFinite(x) ? null : Number(x.toPrecision(8)));
  return { status: 200, body: { chain: ch, rpc, pool: checksum(pool), type, token0: { ...tok[0], pool_balance_raw: undefined, reserve: rp(amt[0]) }, token1: { ...tok[1], pool_balance_raw: undefined, reserve: rp(amt[1]) },
    price_token0_in_token1: rp(price), price_token1_in_token0: price ? rp(1 / price) : null, tvl_usd_estimate: tvl != null ? Math.round(tvl) : null, tvl_method: tvl != null ? "2 × stable-side reserve" : "no stable side; pair with /v1/tokenprice", ...extra,
    flags: [...(tvl != null && tvl < 10000 ? ["thin_liquidity_lt_10k"] : []), ...(amt[0] === 0 || amt[1] === 0 ? ["empty_side"] : [])] } };
}

// ---- /v1/mevstyle ----
const T_TRANSFER = keccakHex("Transfer(address,address,uint256)"), T_SWAP2 = keccakHex("Swap(address,uint256,uint256,uint256,uint256,address)"), T_SWAP3 = keccakHex("Swap(address,address,int256,int256,uint160,uint128,int24)"), T_SWAPAERO = keccakHex("Swap(address,address,uint256,uint256,uint256,uint256)");
export function analyzeReceipt(rc, tx) {
  const logs = (rc && rc.logs) || []; const from = String((tx && tx.from) || rc.from || "").toLowerCase();
  const transfers = logs.filter((l) => l.topics && l.topics[0] === T_TRANSFER && l.topics.length === 3).map((l) => ({ token: l.address.toLowerCase(), from: "0x" + l.topics[1].slice(26), to: "0x" + l.topics[2].slice(26), value: big(l.data), logIndex: Number(big(l.logIndex || "0x0")) }));
  const swaps = logs.filter((l) => l.topics && [T_SWAP2, T_SWAP3, T_SWAPAERO].includes(l.topics[0])).map((l) => ({ pool: l.address.toLowerCase(), kind: l.topics[0] === T_SWAP3 ? "v3" : l.topics[0] === T_SWAP2 ? "v2" : "aerodrome" }));
  const flags = []; const tax = [];
  // transfer-tax: same token, same from in one tx, a small side-transfer alongside a main transfer (fee-on-transfer pattern)
  const byKey = {}; for (const t of transfers) (byKey[t.token + t.from] ||= []).push(t);
  for (const g of Object.values(byKey)) if (g.length >= 2) { const s = [...g].sort((x, y) => (y.value > x.value ? 1 : -1)); const tot = s.reduce((x, y) => x + y.value, 0n); const side = tot - s[0].value; if (tot > 0n && side > 0n) { const pct = Number((side * 10000n) / tot) / 100; if (pct > 0 && pct <= 50) tax.push({ token: checksum(s[0].token), from: checksum(s[0].from), main_to: checksum(s[0].to), side_recipients: s.slice(1).map((x) => checksum(x.to)), tax_pct_estimate: pct }); } }
  if (tax.length) flags.push("fee_on_transfer_pattern");
  const poolCounts = {}; for (const s of swaps) poolCounts[s.pool] = (poolCounts[s.pool] || 0) + 1;
  if (Object.values(poolCounts).some((n) => n >= 2)) flags.push("same_pool_multi_swap_possible_arb_or_sandwich_leg");
  const tokensIn = new Set(transfers.filter((t) => t.to === from).map((t) => t.token)), tokensOut = new Set(transfers.filter((t) => t.from === from).map((t) => t.token));
  const cyclic = [...tokensIn].filter((x) => tokensOut.has(x)); if (swaps.length >= 2 && cyclic.length) flags.push("cyclic_token_flow_possible_arbitrage");
  if (tx && tx.to == null) flags.push("contract_creation");
  if (rc && rc.status === "0x0") flags.push("reverted");
  return { log_count: logs.length, transfer_count: transfers.length, swap_count: swaps.length, pools: Object.keys(poolCounts).map(checksum), transfer_tax: tax, cyclic_tokens: cyclic.map(checksum), flags };
}
export async function mevstyle(a) {
  const ch = chainOf(a.chain); if (!ch) return bad(CHAINS_MSG);
  const h = String(a.tx ?? a.hash ?? "").trim(); if (!isH(h)) return bad("tx: 0x 32-byte tx hash required");
  let r; try { r = (await rpcBatch(ch, [["eth_getTransactionReceipt", [h]], ["eth_getTransactionByHash", [h]]])).results; } catch (e) { return { status: 502, body: { error: "public rpc unavailable: " + (e.message || e) } }; }
  const [rc, tx] = r; if (!rc) return { status: 404, body: { error: "receipt not found (pending or wrong chain)", chain: ch } };
  const an = analyzeReceipt(rc, tx); const bn = Number(big(rc.blockNumber)), idx = Number(big(rc.transactionIndex));
  // sandwich check: neighbours in block from same sender touching same pool
  let sandwich = null;
  if (an.swap_count && a.neighbors !== "false") try {
    const blk = (await rpcBatch(ch, [["eth_getBlockByNumber", [rc.blockNumber, true]]])).results[0]; const txs = (blk && blk.transactions) || [];
    const pick = txs.filter((t) => { const i = Number(big(t.transactionIndex)); return i !== idx && Math.abs(i - idx) <= 3; });
    if (pick.length) { const rcs = (await rpcBatch(ch, pick.map((t) => ["eth_getTransactionReceipt", [t.hash]]))).results; const mine = new Set(an.pools.map((x) => x.toLowerCase()));
      const hits = pick.map((t, k) => ({ t, p: analyzeReceipt(rcs[k] || {}, t).pools.map((x) => x.toLowerCase()).filter((x) => mine.has(x)) })).filter((x) => x.p.length);
      const before = hits.filter((x) => Number(big(x.t.transactionIndex)) < idx), after = hits.filter((x) => Number(big(x.t.transactionIndex)) > idx);
      const attacker = before.find((b) => after.some((x) => x.t.from.toLowerCase() === b.t.from.toLowerCase()));
      sandwich = { neighbors_scanned: pick.length, same_pool_neighbors: hits.map((x) => ({ hash: x.t.hash, index: Number(big(x.t.transactionIndex)), from: checksum(x.t.from) })), likely_sandwiched: !!attacker, attacker: attacker ? checksum(attacker.t.from) : null };
      if (attacker) an.flags.push("likely_sandwiched"); }
  } catch { sandwich = { error: "neighbor scan unavailable" }; }
  return { status: 200, body: { chain: ch, tx: h, block: bn, index: idx, from: tx ? checksum(tx.from) : null, to: tx && tx.to ? checksum(tx.to) : null, status: rc.status === "0x1" ? "success" : "reverted", gas_used: Number(big(rc.gasUsed)), effective_gas_price_gwei: rc.effectiveGasPrice ? Number(big(rc.effectiveGasPrice)) / 1e9 : null, ...an, sandwich, note: "Heuristic only: fee-on-transfer, cyclic arb, same-pool multi-swap, ±3-tx same-sender sandwich around same pool." } };
}

// ---- /v1/vault4626 ----
export async function vault4626(a) {
  const ch = chainOf(a.chain); if (!ch) return bad(CHAINS_MSG);
  const v = String(a.vault ?? a.address ?? "").trim(); if (!isA(v)) return bad("vault: 0x ERC-4626 vault address required");
  const user = a.owner && isA(String(a.owner)) ? String(a.owner) : null;
  const one = (d) => (10n ** BigInt(d)).toString(16).padStart(64, "0");
  let r, rpc; try { ({ results: r, rpc } = await rpcBatch(ch, [call(v, sel("asset()")), call(v, sel("totalAssets()")), call(v, sel("totalSupply()")), call(v, sel("decimals()")), call(v, sel("symbol()")), call(v, sel("name()")), ...(user ? [call(v, sel("balanceOf(address)") + user.slice(2).toLowerCase().padStart(64, "0")), call(v, sel("maxWithdraw(address)") + user.slice(2).toLowerCase().padStart(64, "0"))] : [])])); }
  catch (e) { return { status: 502, body: { error: "public rpc unavailable: " + (e.message || e) } }; }
  if (!r[0] || r[0] === "0x" || !r[1] || r[1] === "0x") return { status: 422, body: { error: "not ERC-4626: asset()/totalAssets() missing", chain: ch } };
  const asset = addrW(r[0]); const vd = r[3] && r[3] !== "0x" ? Number(big(r[3])) : 18;
  let m; try { m = (await rpcBatch(ch, [call(asset, sel("symbol()")), call(asset, sel("decimals()")), call(v, sel("convertToAssets(uint256)") + one(vd)), call(v, sel("previewRedeem(uint256)") + one(vd))])).results; } catch { m = []; }
  const ad = m[1] && m[1] !== "0x" ? Number(big(m[1])) : 18; const ta = big(r[1]), ts = big(r[2]);
  const pps = m[2] && m[2] !== "0x" ? Number(big(m[2])) / 10 ** ad : null, prv = m[3] && m[3] !== "0x" ? Number(big(m[3])) / 10 ** ad : null;
  const flags = []; if (ts === 0n) flags.push("empty_vault_inflation_attack_risk"); if (pps != null && prv != null && prv < pps * 0.999) flags.push("redeem_fee_or_loss_gt_0.1pct"); if (pps != null && pps < 0.98 && /USD|DAI/i.test(decodeStr(m[0]) || "")) flags.push("share_price_below_par");
  const body = { chain: ch, rpc, vault: checksum(v), name: decodeStr(r[5]) || null, symbol: decodeStr(r[4]) || null, decimals: vd, asset: { address: checksum(asset), symbol: decodeStr(m[0]) || null, decimals: ad }, total_assets: fmtUnits(ta, ad), total_supply: fmtUnits(ts, vd), assets_per_share: pps, preview_redeem_per_share: prv, flags };
  if (user) body.owner = { address: checksum(user), shares: fmtUnits(big(r[6]), vd), max_withdraw_assets: r[7] && r[7] !== "0x" ? fmtUnits(big(r[7]), ad) : null };
  return { status: 200, body };
}
