// Pack 7 (2026-11-02, BUILD-NOW spend map): /v1/evmrpc, /v1/erc20balances, /v1/walletlabels, /v1/defistats (polymarket/blocktime/yieldpools/dexquote/weather/uptime/cryptonews already live).
// $0 upstream only: keyless public RPCs, DefiLlama keyless API, Polymarket gamma API. Fails soft.
import { keccakHex, checksum } from "./evm.js";
import { rpcBatch, RPCS, LABELS, ens } from "./walletintel.js";
import { decodeStr, fmtUnits } from "./onchain.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const aw = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const w32 = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, "0");
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);
const CH = { base: "base", "8453": "base", "eip155:8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", "eip155:1": "ethereum", optimism: "optimism", op: "optimism", "10": "optimism", arbitrum: "arbitrum", arb: "arbitrum", "42161": "arbitrum", polygon: "polygon", matic: "polygon", "137": "polygon", "base-sepolia": "base-sepolia", "84532": "base-sepolia" };
const chainOf = (c) => CH[String(c ?? "base").trim().toLowerCase()] || null;
const CHAINS_MSG = "chain must be base, ethereum, optimism, arbitrum, polygon, base-sepolia";
async function getJ(url, ms = 8000) { const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "beggar-bot/1.0" }, signal: AbortSignal.timeout(ms), cf: { cacheTtl: 300, cacheEverything: true } }); if (!r.ok) throw new Error("upstream http " + r.status); return r.json(); }
const r6 = (x) => (x == null || !isFinite(x) ? null : Number(Number(x).toPrecision(6)));

// ---- 1. /v1/evmrpc ----
export const RPC_ALLOW = new Set(["eth_blockNumber", "eth_chainId", "eth_call", "eth_estimateGas", "eth_gasPrice", "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getBalance", "eth_getCode", "eth_getStorageAt", "eth_getTransactionCount", "eth_getTransactionByHash", "eth_getTransactionReceipt", "eth_getBlockByNumber", "eth_getBlockByHash", "eth_getLogs", "eth_getBlockTransactionCountByNumber", "eth_getProof", "eth_sendRawTransaction", "net_version", "web3_clientVersion", "eth_syncing"]);
export async function evmrpc(a) {
  const ch = chainOf(a.chain); if (!ch) return bad(CHAINS_MSG);
  let reqs = a.requests ?? a.batch ?? (a.method ? [{ method: a.method, params: a.params ?? [] }] : null);
  if (typeof reqs === "string") try { reqs = JSON.parse(reqs); } catch { return bad("requests must be JSON array"); }
  if (typeof (a.params) === "string" && reqs && reqs.length === 1) try { reqs[0].params = JSON.parse(a.params); } catch { return bad("params must be JSON array"); }
  if (!Array.isArray(reqs) || !reqs.length) return bad("method (+ params JSON array) or requests [{method, params}] (≤20) required");
  if (reqs.length > 20) return bad("≤20 requests per call");
  for (const r of reqs) { if (!r || !RPC_ALLOW.has(r.method)) return bad("method not allowed: " + (r && r.method) + " (allow: " + [...RPC_ALLOW].join(", ") + ")"); if (!Array.isArray(r.params ?? [])) return bad("params must be array");
    if (r.method === "eth_getLogs") { const f = (r.params || [])[0] || {}; if (!f.blockHash && (f.fromBlock === undefined || f.fromBlock === "earliest")) return bad("eth_getLogs needs fromBlock (range ≤10k blocks) or blockHash"); } }
  let last;
  for (const url of RPCS[ch]) { try {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reqs.map((x, i) => ({ jsonrpc: "2.0", id: i, method: x.method, params: x.params ?? [] }))), signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("http " + r.status); const j = await r.json(); if (!Array.isArray(j)) throw new Error("non-batch reply");
    const out = reqs.map((x, i) => { const y = j.find((z) => z && z.id === i) || {}; return { method: x.method, ...(y.error ? { error: y.error } : { result: y.result ?? null }) }; });
    return { status: 200, body: { chain: ch, rpc: new URL(url).host, count: out.length, responses: out, ...(reqs.length === 1 ? { result: out[0].result, error: out[0].error } : {}) } };
  } catch (e) { last = e; } }
  return { status: 502, body: { chain: ch, error: "public rpc unavailable: " + (last && last.message) } };
}

// ---- 2. /v1/erc20balances ----
export async function erc20balances(a) {
  const ch = chainOf(a.chain); if (!ch) return bad(CHAINS_MSG);
  const addrs = list(a.addresses ?? a.address), toks = list(a.tokens ?? a.token); const native = !(a.native === false || a.native === "false");
  if (!addrs.length || addrs.length > 25 || !addrs.every(isA)) return bad("addresses: 1–25 0x addresses");
  if (toks.length > 25 || !toks.every(isA)) return bad("tokens: ≤25 0x token addresses");
  if (addrs.length * (toks.length + (native ? 1 : 0)) > 400) return bad("addresses × tokens ≤ 400");
  const calls = []; for (const t of toks) calls.push(call(t, sel("decimals()")), call(t, sel("symbol()")));
  const base = calls.length; for (const ad of addrs) { for (const t of toks) calls.push(call(t, sel("balanceOf(address)") + aw(ad))); if (native) calls.push(["eth_getBalance", [ad, "latest"]]); }
  const res = new Array(calls.length).fill(null); let rpc;
  try { for (let i = 0; i < calls.length; i += 100) { const r = await rpcBatch(ch, calls.slice(i, i + 100)); rpc = r.rpc; r.results.forEach((x, k) => (res[i + k] = x)); } }
  catch (e) { return { status: 200, body: { chain: ch, live: false, error: String(e.message || e) } }; }
  const meta = toks.map((t, i) => { const d = res[2 * i]; return { token: checksum(t), symbol: decodeStr(res[2 * i + 1]) || null, decimals: d && d !== "0x" ? Number(big(d)) : null }; });
  let k = base; const totals = meta.map(() => 0n); let ntot = 0n;
  const rows = addrs.map((ad) => { const b = {}; meta.forEach((m, i) => { const v = big(res[k++]); totals[i] += v; b[m.symbol || m.token] = { raw: v.toString(), amount: m.decimals != null ? fmtUnits(v, m.decimals) : null }; }); const o = { address: checksum(ad), balances: b }; if (native) { const n = big(res[k++]); ntot += n; o.native = fmtUnits(n, 18); } return o; });
  return { status: 200, body: { chain: ch, rpc, live: true, tokens: meta, results: rows, totals: Object.fromEntries(meta.map((m, i) => [m.symbol || m.token, m.decimals != null ? fmtUnits(totals[i], m.decimals) : totals[i].toString()])), ...(native ? { native_total: fmtUnits(ntot, 18) } : {}), calls: calls.length } };
}

// ---- 3. /v1/walletlabels ----
const ENT = Object.fromEntries(Object.entries({
  "0x28C6c06298d514Db089934071355E5743bf21d60": ["Binance 14 (hot)", "cex"], "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549": ["Binance 15", "cex"], "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d": ["Binance 16", "cex"], "0xF977814e90dA44bFA03b6295A0616a897441aceC": ["Binance 8 (cold)", "cex"], "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE": ["Binance 1", "cex"], "0xBE0eB53F46cd790Cd13851d5EFf43D12404d33E8": ["Binance 7 (cold)", "cex"],
  "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3": ["Coinbase 1", "cex"], "0x503828976D22510aad0201ac7EC88293211D23Da": ["Coinbase 2", "cex"], "0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43": ["Coinbase 10", "cex"], "0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740": ["Coinbase 3", "cex"], "0x3cD751E6b0078Be393132286c442345e5DC49699": ["Coinbase 4", "cex"],
  "0x2910543Af39abA0Cd09dBb2D50200b3E800A63D2": ["Kraken 1", "cex"], "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0": ["Kraken 4", "cex"], "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b": ["OKX 1", "cex"], "0xf89d7b9c864f589bbF53a82105107622B35EaA40": ["Bybit 1", "cex"], "0x77134cbC06cB00b66F4c7e623D5fdBF6777635EC": ["Bitfinex 2", "cex"], "0x1151314c646Ce4E0eFD76d1aF4760aE66a9Fe30F": ["Bitfinex 1", "cex"], "0x0D0707963952f2fBA59dD06f2b425ace40b492Fe": ["Gate.io 1", "cex"], "0x75e89d5979E4f6Fba9F97c104c2F0AFB3F1dcB88": ["MEXC 1", "cex"], "0xd24400ae8BfEBb18cA49Be86258a3C749cf46853": ["Gemini 1", "cex"], "0xE93381fB4c4F14bDa253907b18faD305D799241a": ["Huobi/HTX 10", "cex"], "0x46340b20830761efd32832A74d7169B29FEB9758": ["Crypto.com 2", "cex"], "0x6262998Ced04146fA42253a5C0AF90CA02dfd2A3": ["Crypto.com 1", "cex"], "0xA7EFAe728D2936e78BDA97dc267687568dD593f3": ["OKX 3", "cex"],
  "0x3154Cf16ccdb4C6d922629664174b904d80F2C35": ["Base L1StandardBridge (Ethereum)", "bridge"], "0x4200000000000000000000000000000000000010": ["OP-stack L2StandardBridge", "bridge"], "0x4200000000000000000000000000000000000016": ["OP-stack L2ToL1MessagePasser", "bridge"], "0x49048044D57e1C92A77f79988d21Fa8fAF74E97e": ["Base OptimismPortal (Ethereum)", "bridge"], "0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64": ["Across SpokePool (Base)", "bridge"], "0x5c7BCd6E7De5423a257D81B442095A1a6ced35C5": ["Across SpokePool (Ethereum)", "bridge"], "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE": ["LI.FI Diamond", "bridge_aggregator"], "0x8731d54E9D02c286767d56ac03e8037C07e01e98": ["Stargate Router (Ethereum)", "bridge"], "0x45f1A95A4D3f3836523F5c83673c797f4d4d263B": ["Stargate Router (Base)", "bridge"], "0x3a23F943181408EAC424116Af7b7790c94Cb97a5": ["Socket Gateway", "bridge_aggregator"], "0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1": ["Optimism L1StandardBridge", "bridge"], "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a": ["Arbitrum Bridge", "bridge"], "0x1a2a1c938CE3eC39b6D47113c7955bAa9DD454F2": ["Axie Ronin Bridge", "bridge"], "0x1a44076050125825900e736c501f859c50fE728c": ["LayerZero EndpointV2", "bridge"],
  "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43": ["Aerodrome Router", "dex"], "0x9008D19f58AAbD9eD0D60971565AA8510560ab41": ["CoW Protocol Settlement", "dex"], "0x1111111254EEB25477B68fb85Ed929f73A960582": ["1inch Router v5", "dex"], "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5": ["KyberSwap Router", "dex"], "0x19cEeAd7105607Cd444F5ad10dd51356436095a1": ["Odos Router v2 (Base)", "dex"], "0xCf5540fFFCdC3d510B18bFcA6d2b9987b0772559": ["Odos Router v2 (Ethereum)", "dex"], "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC": ["ParaSwap Augustus v6", "dex"],
  "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5": ["Aave v3 Pool (Base)", "lending"], "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2": ["Aave v3 Pool (Ethereum)", "lending"], "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb": ["Morpho Blue", "lending"], "0x46e6b214b524310239732D51387075E0e70970bf": ["Compound v3 cWETH (Base)", "lending"],
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045": ["vitalik.eth", "individual"], "0x8103683202aa8DA10536036EDef04CDd865C225E": ["Tornado-sanctioned (OFAC) sample", "sanctioned"], "0x722122dF12D4e14e13Ac3b6895a86e84145b6967": ["Tornado Cash Proxy (OFAC)", "sanctioned"], "0x910Cbd523D972eb0a6f4cAe4618aD62622b39DbF": ["Tornado Cash 10 ETH (OFAC)", "sanctioned"], "0xA160cdAB225685dA1d56aa342Ad8841c3b53f291": ["Tornado Cash 100 ETH (OFAC)", "sanctioned"], "0x098B716B8Aaf21512996dC57EB0615e2383E2f96": ["Lazarus/Ronin exploiter (OFAC)", "sanctioned"],
  "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7": ["Beggar Bot x402 payTo", "x402_seller"],
}).map(([k, v]) => [k.toLowerCase(), v]));
const KIND_OF = (l) => /USDC|USDT|WETH|DAI|EURC/.test(l) ? "token" : /Router|Seaport|0x Exchange|1inch/.test(l) ? "dex" : /EntryPoint|Safe|Multicall|Permit2|ENS/.test(l) ? "infrastructure" : /zero|burn/.test(l) ? "null" : "known_contract";
export async function walletlabels(a) {
  const addrs = list(a.addresses ?? a.address); if (!addrs.length || addrs.length > 20 || !addrs.every(isA)) return bad("addresses: 1–20 0x addresses");
  const ch = chainOf(a.chain); if (!ch) return bad(CHAINS_MSG); const live = !(a.live === false || a.live === "false");
  let res = null; if (live) try { res = (await rpcBatch(ch, addrs.flatMap((x) => [["eth_getCode", [x, "latest"]], ["eth_getTransactionCount", [x, "latest"]], ["eth_getBalance", [x, "latest"]]]))).results; } catch {}
  const names = live && a.ens !== "false" && addrs.length <= 5 ? await Promise.all(addrs.map(async (x) => { try { const o = await ens({ address: x }); return o.body && o.body.verified ? o.body.name : null; } catch { return null; } })) : addrs.map(() => null);
  const out = addrs.map((x, i) => { const k = x.toLowerCase(), e = ENT[k], l = LABELS[k]; const o = { address: checksum(x), label: e ? e[0] : l || null, category: e ? e[1] : l ? KIND_OF(l) : null, source: e || l ? "curated" : null, ens: names[i] };
    if (res) { const code = res[3 * i] || "0x"; o.account_type = code === "0x" ? "eoa" : code.startsWith("0xef0100") ? "eip7702_eoa" : "contract"; o.nonce = Number(big(res[3 * i + 1])); o.native_balance = fmtUnits(big(res[3 * i + 2]), 18);
      if (!o.category) o.category = o.account_type === "contract" ? "unlabeled_contract" : o.nonce === 0 ? "fresh_or_receive_only_eoa" : o.nonce > 10000 ? "high_activity_eoa_possible_bot_or_service" : "eoa"; }
    o.risk = o.category === "sanctioned" ? "high" : o.category === "fresh_or_receive_only_eoa" ? "unknown" : "none_known"; return o; });
  return { status: 200, body: { chain: ch, count: out.length, labeled: out.filter((x) => x.source).length, results: out, live: !!res, note: "Curated open label set (CEX hot/cold, bridges, DEX routers, lending, OFAC Tornado) + on-chain heuristics + forward-verified ENS; not exhaustive." } };
}

// ---- 4. /v1/defistats ----
export async function defistats(a) {
  const slug = String(a.protocol ?? a.slug ?? "").trim().toLowerCase(), chain = a.chain ? String(a.chain).trim() : "";
  try {
    if (!slug) { const c = await getJ("https://api.llama.fi/v2/chains"); const rows = c.filter((x) => x.tvl > 0).sort((x, y) => y.tvl - x.tvl);
      if (chain) { const m = rows.find((x) => x.name.toLowerCase() === chain.toLowerCase() || String(x.chainId) === chain); if (!m) return bad("unknown chain"); return { status: 200, body: { chain: m.name, tvl_usd: Math.round(m.tvl), rank: rows.indexOf(m) + 1, token: m.tokenSymbol, chain_id: m.chainId, source: "DefiLlama" } }; }
      return { status: 200, body: { top_chains: rows.slice(0, Math.min(50, Number(a.limit) || 20)).map((x, i) => ({ rank: i + 1, chain: x.name, tvl_usd: Math.round(x.tvl), token: x.tokenSymbol })), total_tvl_usd: Math.round(rows.reduce((n, x) => n + x.tvl, 0)), source: "DefiLlama" } }; }
    if (!/^[a-z0-9.\-_]{1,64}$/.test(slug)) return bad("protocol slug like aave, uniswap, aerodrome, morpho");
    const [tvl, fees, rev] = await Promise.all([getJ("https://api.llama.fi/tvl/" + slug).catch(() => null), getJ(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyFees&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`).catch(() => null), getJ(`https://api.llama.fi/summary/fees/${slug}?dataType=dailyRevenue&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`).catch(() => null)]);
    if (tvl == null && !fees) return { status: 404, body: { error: "protocol not found on DefiLlama", protocol: slug } };
    const cb = fees && fees.chainBreakdown ? Object.entries(fees.chainBreakdown).map(([c, v]) => ({ chain: c, fees_24h: typeof v === "object" ? Object.values(v).reduce((n, x) => n + (typeof x === "number" ? x : 0), 0) : v })).sort((x, y) => y.fees_24h - x.fees_24h).slice(0, 10) : null;
    const t = typeof tvl === "number" ? tvl : null, ann = fees ? fees.total30d * 365 / 30 : null;
    return { status: 200, body: { protocol: slug, name: fees ? fees.name : slug, symbol: fees ? fees.symbol : null, chains: fees ? fees.chains : null, tvl_usd: t != null ? Math.round(t) : null, fees: fees ? { "24h": fees.total24h, "7d": fees.total7d, "30d": fees.total30d, "1y": fees.total1y, change_1d_pct: fees.change_1d } : null, revenue: rev ? { "24h": rev.total24h, "7d": rev.total7d, "30d": rev.total30d, "1y": rev.total1y } : null, annualized_fees_usd: ann ? Math.round(ann) : null, fees_to_tvl_pct: ann && t ? r6((ann / t) * 100) : null, fee_chain_breakdown_24h: cb, gecko_id: fees ? fees.gecko_id : null, source: "DefiLlama", as_of: new Date().toISOString() } };
  } catch (e) { return { status: 502, body: { error: "DefiLlama unavailable: " + String(e.message || e) } }; }
}

