// packb20 (builder B, 2026-11-02): txbatch, balancediff, eip712domain, basefeenext. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak, keccakHex } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon", "84532": "base-sepolia" };
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137, "base-sepolia": 84532 };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : AL[s] || null; };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const csv = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const N = (h) => (h ? Number(BigInt(h)) : null);
const unhex = (h) => Uint8Array.from(String(h).replace(/^0x/, "").match(/../g) || [], (x) => parseInt(x, 16));
const hex = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
function str(h) { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } }
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export async function txbatch(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const hs = csv(q.hashes || q.hash); if (!hs.length || hs.length > 20 || !hs.every((h) => /^0x[0-9a-fA-F]{64}$/.test(h))) return bad("hashes: csv of 0x tx hashes (max 20)");
  try {
    const { results: r } = await rpcBatch(ch, [["eth_blockNumber", []], ["eth_getBlockByNumber", ["finalized", false]], ...hs.map((h) => ["eth_getTransactionReceipt", [h]])]);
    const head = N(r[0]), fin = r[1] ? N(r[1].number) : null;
    const txs = hs.map((h, i) => { const x = r[i + 2]; if (!x) return { hash: h, status: "pending_or_unknown" }; const bn = N(x.blockNumber); const usdc = (x.logs || []).filter((l) => l.address.toLowerCase() === USDC[ch].toLowerCase() && l.topics[0] === TRANSFER).map((l) => ({ from: checksum("0x" + l.topics[1].slice(26)), to: checksum("0x" + l.topics[2].slice(26)), amount: Number(BigInt(l.data)) / 1e6 })); return { hash: h, status: x.status === "0x1" ? "success" : "reverted", block: bn, confirmations: head - bn, finalized: fin != null ? bn <= fin : null, from: x.from, to: x.to, gas_used: N(x.gasUsed), fee_native: x.effectiveGasPrice ? Number(BigInt(x.gasUsed) * BigInt(x.effectiveGasPrice)) / 1e18 : null, log_count: (x.logs || []).length, usdc_transfers: usdc }; });
    const c = txs.reduce((m, t) => ((m[t.status] = (m[t.status] || 0) + 1), m), {});
    return ok({ chain: ch, head, finalized_head: fin, counts: c, all_final: txs.every((t) => t.finalized), txs });
  } catch (e) { return err(e); }
}
export async function balancediff(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.address)) return bad("address required");
  const toks = csv(q.tokens || "usdc").map((t) => (t.toLowerCase() === "usdc" ? USDC[ch] : t.toLowerCase() === "native" ? "native" : t));
  if (toks.length > 10 || !toks.every((t) => t === "native" || isA(t))) return bad("tokens: csv of 0x|usdc|native (max 10)");
  const tg = (v, d) => { v = String(v ?? d); return /^\d+$/.test(v) ? "0x" + BigInt(v).toString(16) : /^(latest|finalized|safe)$/.test(v) ? v : null; };
  try {
    let a = tg(q.from_block, null), b = tg(q.to_block, "latest");
    const { results: [head] } = await rpcBatch(ch, [["eth_blockNumber", []]]);
    if (!a) { const back = Math.min(Number(q.blocks_back || 1000), 500000); a = "0x" + (BigInt(head) - BigInt(back)).toString(16); }
    if (!b) return bad("to_block invalid");
    const calls = []; for (const t of toks) for (const blk of [a, b]) { if (t === "native") calls.push(["eth_getBalance", [q.address, blk]]); else calls.push(["eth_call", [{ to: t, data: "0x70a08231" + pad(q.address) }, blk]]); } for (const t of toks) if (t !== "native") calls.push(["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    let k = toks.length * 2;
    const rows = toks.map((t, i) => { let d = 18, sym = ch === "polygon" ? "POL" : "ETH"; if (t !== "native") { d = r[k] ? N(r[k].slice(0, 66)) : 18; sym = r[k + 1] ? str(r[k + 1]) : null; k += 2; } const x = r[2 * i], y = r[2 * i + 1]; const bx = x ? BigInt(x.slice(0, 66)) : null, by = y ? BigInt(y.slice(0, 66)) : null; return { token: t === "native" ? "native" : checksum(t.toLowerCase()), symbol: sym, decimals: d, before: bx != null ? Number(bx) / 10 ** d : null, after: by != null ? Number(by) / 10 ** d : null, delta: bx != null && by != null ? Number(by - bx) / 10 ** d : null, error: bx == null || by == null ? "balance unavailable (archive RPC may be required for old blocks)" : undefined }; });
    return ok({ chain: ch, address: checksum(q.address.toLowerCase()), from_block: N(a) ?? a, to_block: /^0x/.test(b) ? N(b) : b, diffs: rows, note: "Reconcile expected settlement vs actual on-chain delta." });
  } catch (e) { return err(e); }
}
export async function eip712domain(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const t = !q.token || String(q.token).toLowerCase() === "usdc" ? USDC[ch] : q.token; if (!isA(t)) return bad("token/contract 0x required");
  try {
    const { results: [d5267, ds, nm, ver, nonce] } = await rpcBatch(ch, [["eth_call", [{ to: t, data: "0x84b0196e" }, "latest"]], ["eth_call", [{ to: t, data: "0x3644e515" }, "latest"]], ["eth_call", [{ to: t, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: t, data: "0x54fd4d50" }, "latest"]], ...(isA(q.owner) ? [["eth_call", [{ to: t, data: "0x7ecebe00" + pad(q.owner) }, "latest"]]] : [])]);
    let dom = null;
    if (d5267 && d5267.length > 2 + 64 * 7) { const b = d5267.slice(2), w = (i) => b.slice(64 * i, 64 * i + 64); const s = (i) => { const off = Number(BigInt("0x" + w(i))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); }; dom = { fields: "0x" + w(0).slice(0, 2), name: s(1), version: s(2), chainId: Number(BigInt("0x" + w(3))), verifyingContract: checksum("0x" + w(4).slice(24)), salt: "0x" + w(5) }; }
    const name = dom ? dom.name : nm ? str(nm) : null, version = dom ? dom.version : ver ? str(ver) : null;
    let computed = null, match = null;
    if (name != null && version != null) { const enc = new Uint8Array(160); enc.set(unhex("8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f"), 0); enc.set(keccak(new TextEncoder().encode(name)), 32); enc.set(keccak(new TextEncoder().encode(version)), 64); enc.set(unhex(pad(CID[ch].toString(16))), 96); enc.set(unhex(pad(t)), 128); computed = hex(keccak(enc)); match = ds && ds.length >= 66 ? ds.slice(0, 66).toLowerCase() === computed : null; }
    return ok({ chain: ch, contract: checksum(t.toLowerCase()), eip5267: !!dom, domain: { name, version, chainId: CID[ch], verifyingContract: checksum(t.toLowerCase()) }, eip5267_domain: dom, domain_separator_onchain: ds && ds.length >= 66 ? ds.slice(0, 66) : null, domain_separator_computed: computed, separator_matches: match, ...(isA(q.owner) ? { owner: q.owner, permit_nonce: nonce ? BigInt(nonce.slice(0, 66)).toString() : null } : {}), x402_extra: name != null ? { name, version } : null, note: "Use x402_extra in PaymentRequirements.extra for EIP-3009 transferWithAuthorization signing." });
  } catch (e) { return err(e); }
}
export async function basefeenext(q) {
  const chains = csv(q.chains || q.chain || "base,ethereum,optimism,arbitrum,polygon").map(ck); if (chains.includes(null)) return bad("unknown chain");
  const out = await Promise.all([...new Set(chains)].map(async (ch) => { try { const { results: [b, tip] } = await rpcBatch(ch, [["eth_getBlockByNumber", ["latest", false]], ["eth_maxPriorityFeePerGas", []]]); const base = BigInt(b.baseFeePerGas || "0x0"), used = BigInt(b.gasUsed), lim = BigInt(b.gasLimit); const denom = ch === "base" || ch === "optimism" ? 250n : 8n, el = ch === "base" || ch === "optimism" ? 2n : ch === "ethereum" ? 2n : 2n; const target = lim / el; let next = base; if (ch !== "arbitrum" && target > 0n) { if (used > target) next = base + ((base * (used - target) / target / denom) || 1n); else if (used < target) next = base - base * (target - used) / target / denom; } const g = (x) => Number(x) / 1e9; const tp = tip ? BigInt(tip) : 0n; return { chain: ch, block: N(b.number), base_fee_gwei: g(base), next_base_fee_gwei: g(next), change_pct: base > 0n ? Number((next - base) * 10000n / base) / 100 : 0, gas_used_pct: Number(used * 10000n / lim) / 100, priority_fee_gwei: g(tp), suggested_max_fee_gwei: g(next * 2n + tp), usdc_transfer_cost_native: Number((next + tp) * 65000n) / 1e18, model: ch === "arbitrum" ? "arbitrum (floor-based; next≈current)" : "EIP-1559 (denominator " + denom + ")" }; } catch (e) { return { chain: ch, error: String(e.message || e) }; } }));
  return ok({ chains: out, cheapest_next: out.filter((x) => x.next_base_fee_gwei != null).sort((a, b) => a.usdc_transfer_cost_native - b.usdc_transfer_cost_native)[0]?.chain || null, note: "OP-stack denominators can change via SystemConfig; L1 data fee not included (see /v1/l1fee)." });
}
