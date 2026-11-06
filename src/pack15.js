// pack15: x402 settlement analytics on Base via keyless eth_getLogs — x402revenue, x402settle, x402payer, tokenflows
const R = (status, body) => ({ status, body });
const RPC = { base: ["https://base-rpc.publicnode.com", "https://mainnet.base.org"], ethereum: ["https://ethereum-rpc.publicnode.com"], arbitrum: ["https://arbitrum-one-rpc.publicnode.com"], optimism: ["https://optimism-rpc.publicnode.com"], polygon: ["https://polygon-bor-rpc.publicnode.com"] };
const BLK_S = { base: 2, ethereum: 12, arbitrum: 0.25, optimism: 2, polygon: 2 };
const USDC = { base: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", ethereum: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", arbitrum: "0xaf88d065e77c8cc2239327c5edb3a432268e5831", optimism: "0x0b2c639c533813f4aa9d7837caf62653d097ff85", polygon: "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359" };
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const AUTH_USED = "0x98de503528ee59b575ef0c0a2576a82497bfc029a5685b209e9ec333479b10a5";
const ADDR = /^0x[0-9a-fA-F]{40}$/; const HASH = /^0x[0-9a-fA-F]{64}$/;
const pad = (a) => "0x" + a.toLowerCase().slice(2).padStart(64, "0");
const un = (t) => "0x" + t.slice(26);
async function rpc(chain, method, params) {
  let last; for (const u of RPC[chain]) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); continue; } return j.result; } catch (e) { last = e; } }
  throw last || new Error("rpc failed");
}
async function logs(chain, filter, hours) {
  const tip = parseInt(await rpc(chain, "eth_blockNumber", []), 16); let span = Math.ceil(hours * 3600 / BLK_S[chain]); const step = 45000; const out = [];
  let to = tip; const chunks = []; while (span > 0 && chunks.length < 4) { const n = Math.min(step, span); chunks.push([to - n + 1, to]); to -= n; span -= n; }
  for (const [f, t] of chunks) { const q = [{ ...filter, fromBlock: "0x" + f.toString(16), toBlock: "0x" + t.toString(16) }]; let r; try { r = await rpc(chain, "eth_getLogs", q); } catch (e) { await new Promise((z) => setTimeout(z, 1200)); r = await rpc(chain, "eth_getLogs", q); } out.push(...r); } return { tip, from: chunks.at(-1)[0], logs: out, truncated_hours: span > 0 };
}
const opts = (a) => { const chain = String(a.chain || "base").toLowerCase(); if (!RPC[chain]) return { err: "chain must be base|ethereum|arbitrum|optimism|polygon" }; const maxH = Math.floor(4 * 45000 * BLK_S[chain] / 3600); return { chain, hours: Math.max(1, Math.min(maxH, parseFloat(a.hours || "24") || 24)) }; };

export async function x402revenue(a) {
  const to = String(a.payto || a.address || ""); if (!ADDR.test(to)) return R(400, { error: "payto (0x address) required" });
  const o = opts(a); if (o.err) return R(400, { error: o.err }); const price = a.price_usd ? parseFloat(a.price_usd) : null;
  try {
    const L = await logs(o.chain, { address: USDC[o.chain], topics: [TRANSFER, null, pad(to)] }, o.hours);
    const payers = {}; let tot = 0; const amounts = {};
    for (const l of L.logs) { const v = Number(BigInt(l.data)) / 1e6; tot += v; const p = un(l.topics[1]); payers[p] = (payers[p] || 0) + v; amounts[v] = (amounts[v] || 0) + 1; }
    const top = Object.entries(payers).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([payer, usd]) => ({ payer, usd: +usd.toFixed(6) }));
    return R(200, { chain: o.chain, payto: to.toLowerCase(), hours: o.hours, from_block: L.from, to_block: L.tip, payments: L.logs.length, total_usdc: +tot.toFixed(6), unique_payers: Object.keys(payers).length,
      matching_price: price ? L.logs.filter((l) => Math.abs(Number(BigInt(l.data)) / 1e6 - price) < 1e-9).length : null, price_points: Object.entries(amounts).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([usd, n]) => ({ usd: +usd, count: n })),
      top_payers: top, recent: L.logs.slice(-10).reverse().map((l) => ({ tx: l.transactionHash, block: parseInt(l.blockNumber, 16), from: un(l.topics[1]), usdc: Number(BigInt(l.data)) / 1e6 })) });
  } catch (e) { return R(502, { error: String(e.message || e).slice(0, 200) }); }
}

export async function x402settle(a) {
  const h = String(a.tx || a.hash || ""); if (!HASH.test(h)) return R(400, { error: "tx (0x 32-byte hash) required" }); const o = opts(a); if (o.err) return R(400, { error: o.err });
  try {
    const [rc, tx] = await Promise.all([rpc(o.chain, "eth_getTransactionReceipt", [h]), rpc(o.chain, "eth_getTransactionByHash", [h])]);
    if (!rc) return R(404, { error: "tx not found or pending", tx: h });
    const usdc = USDC[o.chain]; const auths = rc.logs.filter((l) => l.topics[0] === AUTH_USED && l.address.toLowerCase() === usdc); const xfers = rc.logs.filter((l) => l.topics[0] === TRANSFER && l.address.toLowerCase() === usdc && l.topics.length === 3);
    const settlements = auths.map((al) => { const payer = un(al.topics[1]); const t = xfers.find((x) => un(x.topics[1]) === payer); return { payer, nonce: al.topics[2], payee: t ? un(t.topics[2]) : null, usdc: t ? Number(BigInt(t.data)) / 1e6 : null, atomic: t ? BigInt(t.data).toString() : null }; });
    const sel = tx?.input?.slice(0, 10);
    return R(200, { chain: o.chain, tx: h, status: rc.status === "0x1" ? "success" : "reverted", block: parseInt(rc.blockNumber, 16), facilitator: rc.from, to: rc.to,
      is_x402_settlement: settlements.length > 0, method: sel === "0xe3ee160e" ? "transferWithAuthorization" : sel === "0xef55bec6" ? "receiveWithAuthorization" : settlements.length ? "batched/proxied" : sel,
      settlements, gas_used: parseInt(rc.gasUsed, 16), effective_gas_price_gwei: rc.effectiveGasPrice ? parseInt(rc.effectiveGasPrice, 16) / 1e9 : null, fee_paid_by_facilitator_eth: rc.effectiveGasPrice ? parseInt(rc.gasUsed, 16) * parseInt(rc.effectiveGasPrice, 16) / 1e18 : null,
      plain_usdc_transfers: settlements.length ? 0 : xfers.map((x) => ({ from: un(x.topics[1]), to: un(x.topics[2]), usdc: Number(BigInt(x.data)) / 1e6 })) });
  } catch (e) { return R(502, { error: String(e.message || e).slice(0, 200) }); }
}

export async function x402payer(a) {
  const p = String(a.payer || a.address || ""); if (!ADDR.test(p)) return R(400, { error: "payer (0x address) required" }); const o = opts(a); if (o.err) return R(400, { error: o.err });
  try {
    const [A, T] = await Promise.all([logs(o.chain, { address: USDC[o.chain], topics: [AUTH_USED, pad(p)] }, o.hours), logs(o.chain, { address: USDC[o.chain], topics: [TRANSFER, pad(p)] }, o.hours)]);
    const authTx = new Set(A.logs.map((l) => l.transactionHash)); const sellers = {}; let x402 = 0, other = 0;
    for (const l of T.logs) { const v = Number(BigInt(l.data)) / 1e6; if (authTx.has(l.transactionHash)) { x402 += v; const s = un(l.topics[2]); sellers[s] = sellers[s] || { usd: 0, n: 0 }; sellers[s].usd += v; sellers[s].n++; } else other += v; }
    return R(200, { chain: o.chain, payer: p.toLowerCase(), hours: o.hours, x402_payments: A.logs.length, x402_spend_usdc: +x402.toFixed(6), other_usdc_out: +other.toFixed(6), unique_sellers: Object.keys(sellers).length,
      sellers: Object.entries(sellers).sort((x, y) => y[1].usd - x[1].usd).slice(0, 15).map(([payto, s]) => ({ payto, usdc: +s.usd.toFixed(6), payments: s.n })), agent_like: A.logs.length >= 5 });
  } catch (e) { return R(502, { error: String(e.message || e).slice(0, 200) }); }
}

export async function tokenflows(a) {
  const ad = String(a.address || ""); if (!ADDR.test(ad)) return R(400, { error: "address (0x) required" }); const o = opts(a); if (o.err) return R(400, { error: o.err });
  const tok = a.token ? String(a.token) : USDC[o.chain]; if (!ADDR.test(tok)) return R(400, { error: "token must be 0x address" });
  try {
    const [dec, IN, OUT] = await Promise.all([rpc(o.chain, "eth_call", [{ to: tok, data: "0x313ce567" }, "latest"]).catch(() => "0x6"), logs(o.chain, { address: tok, topics: [TRANSFER, null, pad(ad)] }, o.hours), logs(o.chain, { address: tok, topics: [TRANSFER, pad(ad)] }, o.hours)]);
    const d = 10 ** parseInt(dec, 16); const sum = (ls, side) => { const c = {}; let t = 0; for (const l of ls) { if (l.topics.length !== 3) continue; const v = Number(BigInt(l.data || "0x0")) / d; t += v; const k = un(l.topics[side]); c[k] = (c[k] || 0) + v; } return { t, c }; };
    const i = sum(IN.logs, 1), q = sum(OUT.logs, 2); const top = (c) => Object.entries(c).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([address, amount]) => ({ address, amount: +amount.toFixed(6) }));
    return R(200, { chain: o.chain, address: ad.toLowerCase(), token: tok.toLowerCase(), hours: o.hours, inflow: +i.t.toFixed(6), outflow: +q.t.toFixed(6), net: +(i.t - q.t).toFixed(6), transfers_in: IN.logs.length, transfers_out: OUT.logs.length, top_senders: top(i.c), top_recipients: top(q.c) });
  } catch (e) { return R(502, { error: String(e.message || e).slice(0, 200) }); }
}
