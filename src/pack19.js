// pack19: aaactivity (ERC-4337 on Base), blockspace, ethburn, safeactivity
import { keccakHex } from "./evm.js";
const R = (status, body) => ({ status, body });
const CH = { base: ["https://base.drpc.org", "https://base-rpc.publicnode.com", "https://mainnet.base.org"], ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"], arbitrum: ["https://arbitrum-one-rpc.publicnode.com"], optimism: ["https://optimism-rpc.publicnode.com"], polygon: ["https://polygon-bor-rpc.publicnode.com"] };
async function rpc(chain, method, params) { let last; for (const u of CH[chain]) for (let k = 0; k < 3; k++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); if (/limit/i.test(j.error.message)) { await new Promise((z) => setTimeout(z, 800)); continue; } break; } return j.result; } catch (e) { last = e; } } throw last || new Error("rpc failed"); }
const err = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const hx = (n) => "0x" + n.toString(16); const un = (t) => "0x" + t.slice(26);
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseFloat(v || d) || d));
const words = (d) => (d.slice(2).match(/.{64}/g) || []).map((w) => BigInt("0x" + w));
const badChain = (c) => R(400, { error: "chain must be one of " + Object.keys(CH).join(",") });
async function logRange(chain, filter, minutes, bt, chunk) { const tip = parseInt(await rpc(chain, "eth_blockNumber", []), 16); const total = Math.ceil((minutes * 60) / bt); const out = []; for (let to = tip, left = total; left > 0; ) { const k = Math.min(chunk, left); out.push(...(await rpc(chain, "eth_getLogs", [{ ...filter, fromBlock: hx(to - k + 1), toBlock: hx(to) }]))); to -= k; left -= k; } return { tip, logs: out, blocks: total }; }
async function ethPrice() { try { const j = await (await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum", { signal: AbortSignal.timeout(6000) })).json(); return j.coins["coingecko:ethereum"].price; } catch { return null; } }

const EP = ["0x0000000071727de22e5e9d8baf0edac6f37da032", "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789", "0x4337084d9e255ff0702461cf8895ce9e3b5ff108"];
const T_UOP = keccakHex("UserOperationEvent(bytes32,address,address,uint256,bool,uint256,uint256)");
export async function aaactivity(a) {
  const chain = (a.chain || "base").toLowerCase(); if (!CH[chain]) return badChain();
  try {
    const bt = chain === "ethereum" ? 12 : chain === "polygon" ? 2 : chain === "arbitrum" ? 0.25 : 2; const minutes = n(a.minutes, 10, 1, 60);
    const { tip, logs, blocks } = await logRange(chain, { address: EP, topics: [T_UOP] }, minutes, bt, chain === "arbitrum" ? 2000 : 1000);
    const pm = {}, acc = new Set(), eps = {}; let ok = 0, cost = 0n;
    for (const l of logs) { const [, succ, c] = words(l.data); const p = un(l.topics[3]); const x = (pm[p] = pm[p] || { ops: 0, ok: 0, cost: 0n, senders: new Set() }); x.ops++; x.senders.add(un(l.topics[2])); if (succ) { ok++; x.ok++; } x.cost += c; cost += c; acc.add(un(l.topics[2])); const e = l.address.toLowerCase(); eps[e] = (eps[e] || 0) + 1; }
    const ep = await ethPrice(); const usd = (w) => (ep ? +((Number(w) / 1e18) * ep).toFixed(4) : null);
    return R(200, { chain, minutes, blocks, to_block: tip, user_ops: logs.length, success_rate_pct: logs.length ? +((100 * ok) / logs.length).toFixed(2) : null, unique_smart_accounts: acc.size, ops_per_min: +(logs.length / minutes).toFixed(2), total_gas_cost_eth: Number(cost) / 1e18, total_gas_cost_usd: usd(cost),
      sponsored_pct: logs.length ? +((100 * Object.entries(pm).filter(([p]) => !/^0x0{40}$/.test(p)).reduce((s, [, x]) => s + x.ops, 0)) / logs.length).toFixed(1) : null,
      entrypoints: Object.entries(eps).map(([address, c]) => ({ address, version: address.startsWith("0x00000000717") ? "v0.7" : address.startsWith("0x4337") ? "v0.8" : "v0.6", ops: c })),
      paymasters: Object.entries(pm).sort((p, q) => q[1].ops - p[1].ops).slice(0, n(a.limit, 15, 1, 50)).map(([address, x]) => ({ address, self_paid: /^0x0{40}$/.test(address), ops: x.ops, unique_accounts: x.senders.size, success_pct: +((100 * x.ok) / x.ops).toFixed(1), gas_cost_eth: Number(x.cost) / 1e18, gas_cost_usd: usd(x.cost) })) });
  } catch (e) { return err(e); }
}

export async function blockspace(a) {
  const chain = (a.chain || "base").toLowerCase(); if (!CH[chain]) return badChain();
  try {
    const blocks = n(a.blocks, 20, 2, 60) | 0; const tip = parseInt(await rpc(chain, "eth_blockNumber", []), 16); const rows = [];
    for (let i = 0; i < blocks; i++) { const b = await rpc(chain, "eth_getBlockByNumber", [hx(tip - i), true]); if (!b) continue; const tx = b.transactions.filter((t) => t.type !== "0x7e"); const tips = tx.map((t) => (t.maxPriorityFeePerGas ? Number(BigInt(t.maxPriorityFeePerGas)) : Math.max(0, Number(BigInt(t.gasPrice || "0x0")) - Number(BigInt(b.baseFeePerGas || "0x0"))))).sort((x, y) => x - y);
      rows.push({ n: parseInt(b.number, 16), ts: parseInt(b.timestamp, 16), used: parseInt(b.gasUsed, 16), limit: parseInt(b.gasLimit, 16), base: Number(BigInt(b.baseFeePerGas || "0x0")), txs: tx.length, blob: parseInt(b.blobGasUsed || "0x0", 16), p50: tips[tips.length >> 1] || 0, p90: tips[Math.floor(tips.length * 0.9)] || 0, contract: tx.filter((t) => t.input && t.input !== "0x").length }); }
    const avg = (f) => rows.reduce((s, r) => s + f(r), 0) / rows.length; const util = avg((r) => r.used / r.limit) * 100; const secs = rows[0].ts - rows[rows.length - 1].ts || 1;
    return R(200, { chain, from_block: rows[rows.length - 1].n, to_block: rows[0].n, blocks: rows.length, seconds: secs, avg_utilization_pct: +util.toFixed(2), congestion: util > 90 ? "congested" : util > 60 ? "busy" : util > 30 ? "normal" : "quiet",
      tps: +(rows.reduce((s, r) => s + r.txs, 0) / secs).toFixed(2), gas_per_sec_mgas: +(rows.reduce((s, r) => s + r.used, 0) / secs / 1e6).toFixed(2), avg_txs_per_block: +avg((r) => r.txs).toFixed(1), contract_call_share_pct: +((100 * rows.reduce((s, r) => s + r.contract, 0)) / Math.max(1, rows.reduce((s, r) => s + r.txs, 0))).toFixed(1),
      gas_limit: rows[0].limit, base_fee_gwei: { latest: rows[0].base / 1e9, min: Math.min(...rows.map((r) => r.base)) / 1e9, max: Math.max(...rows.map((r) => r.base)) / 1e9, trend: rows[0].base > rows[rows.length - 1].base ? "rising" : rows[0].base < rows[rows.length - 1].base ? "falling" : "flat" },
      priority_fee_gwei: { p50: +(avg((r) => r.p50) / 1e9).toFixed(6), p90: +(avg((r) => r.p90) / 1e9).toFixed(6) }, blob_gas_used_avg: chain === "ethereum" ? Math.round(avg((r) => r.blob)) : undefined });
  } catch (e) { return err(e); }
}

export async function ethburn(a) {
  try {
    const blocks = n(a.blocks, 300, 10, 1024) | 0; const tip = parseInt(await rpc("ethereum", "eth_blockNumber", []), 16); let burn = 0, blob = 0, gas = 0;
    for (let end = tip, left = blocks; left > 0; ) { const k = Math.min(1024, left); const h = await rpc("ethereum", "eth_feeHistory", [hx(k), hx(end), []]); const bf = h.baseFeePerGas, gu = h.gasUsedRatio, bb = h.baseFeePerBlobGas || [], br = h.blobGasUsedRatio || [];
      for (let i = 0; i < gu.length; i++) { const g = gu[i] * 60e6; gas += g; burn += (Number(BigInt(bf[i])) * g) / 1e18; if (bb[i] && br[i] != null) blob += (Number(BigInt(bb[i])) * br[i] * 1179648) / 1e18; } end -= k; left -= k; }
    const secs = blocks * 12; const perDay = (x) => (x * 86400) / secs; const issuancePerDay = 2700; const ep = await ethPrice(); const net = issuancePerDay - perDay(burn + blob);
    return R(200, { chain: "ethereum", blocks, to_block: tip, window_minutes: +(secs / 60).toFixed(1), burned_eth: +burn.toFixed(4), blob_fees_burned_eth: +blob.toFixed(6), burn_rate_eth_per_day: +perDay(burn + blob).toFixed(2), burn_usd_per_day: ep ? Math.round(perDay(burn + blob) * ep) : null,
      est_issuance_eth_per_day: issuancePerDay, net_supply_change_eth_per_day: +net.toFixed(2), annualized_inflation_pct: +((net * 365) / 120.7e6 * 100).toFixed(3), regime: net < 0 ? "deflationary (ultrasound)" : "inflationary (issuance > burn)",
      note: "gas used estimated from gasUsedRatio x 60M gas limit; issuance ~2700 ETH/day approx; blob burn assumes 9-blob max (1179648 gas)" });
  } catch (e) { return err(e); }
}

const T_OK = keccakHex("ExecutionSuccess(bytes32,uint256)"), T_FAIL = keccakHex("ExecutionFailure(bytes32,uint256)"), T_SETUP = keccakHex("SafeSetup(address,address[],uint256,address,address)");
export async function safeactivity(a) {
  const chain = (a.chain || "base").toLowerCase(); if (!CH[chain]) return badChain();
  try {
    const bt = chain === "ethereum" ? 12 : chain === "arbitrum" ? 0.25 : 2; const minutes = n(a.minutes, 10, 1, 30);
    const { tip, logs, blocks } = await logRange(chain, { topics: [[T_OK, T_FAIL, T_SETUP]] }, minutes, bt, chain === "arbitrum" ? 1000 : 50);
    const by = {}; let ok = 0, fail = 0; const created = [];
    for (const l of logs) { const s = l.address.toLowerCase(); if (l.topics[0] === T_SETUP) { const w = l.data.slice(2).match(/.{64}/g) || []; created.push({ safe: s, threshold: Number(BigInt("0x" + (w[1] || "0"))), tx: l.transactionHash }); continue; } const f = l.topics[0] === T_FAIL; f ? fail++ : ok++; const x = (by[s] = by[s] || { ok: 0, fail: 0 }); f ? x.fail++ : x.ok++; }
    return R(200, { chain, minutes, blocks, to_block: tip, executions: ok + fail, successes: ok, failures: fail, active_safes: Object.keys(by).length, new_safes: created.length,
      most_active: Object.entries(by).sort((p, q) => q[1].ok + q[1].fail - p[1].ok - p[1].fail).slice(0, n(a.limit, 15, 1, 50)).map(([safe, x]) => ({ safe, executions: x.ok + x.fail, failures: x.fail })), recent_new_safes: created.slice(-10) });
  } catch (e) { return err(e); }
}
