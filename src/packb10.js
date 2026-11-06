// packb10 (builder B, 2026-11-02): contractage, walletage, approvals, usdcauth. $0 upstream (keyless archive-capable public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
export const AL = { "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "8453": "base", "10": "optimism", op: "optimism", "137": "polygon", "42161": "arbitrum", arb: "arbitrum" };
export const ARCH = { base: ["https://mainnet.base.org", "https://base.drpc.org"], ethereum: ["https://eth.drpc.org", "https://1rpc.io/eth"], optimism: ["https://optimism.drpc.org"], polygon: ["https://polygon.drpc.org"] };
export const chainOf = (c, set) => { const s = String(c ?? "base").toLowerCase(); const k = set[s] ? s : AL[s]; return k && set[k] ? k : null; };
async function post(u, calls, base) { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(calls.map(([m, p], i) => ({ jsonrpc: "2.0", id: base + i, method: m, params: p }))), signal: AbortSignal.timeout(8000) });
  const j = await r.json(); if (!Array.isArray(j)) throw new Error("non-batch " + JSON.stringify(j).slice(0, 80)); return j; }
export async function arch(chain, calls) { let last; for (const u of ARCH[chain]) { try { const chunks = []; for (let i = 0; i < calls.length; i += 3) chunks.push(post(u, calls.slice(i, i + 3), i));
  const out = new Array(calls.length).fill(undefined); for (const j of await Promise.all(chunks)) for (const x of j) { if (x.error) last = new Error(x.error.message); else out[x.id] = x.result; } if (out.some((x) => x === undefined)) throw last || new Error("partial"); return out; } catch (e) { last = e; } } throw new Error("archive rpc unavailable: " + (last && last.message)); }
// first block in [0, head] where pred(result) is true; k-ary search, 8 probes/round
async function firstBlock(chain, method, mk, pred, head) {
  let lo = 0, hi = head, rounds = 0; while (hi - lo > 1 && rounds < 14) { rounds++; const step = Math.max(1, Math.floor((hi - lo) / 9)); const probes = []; for (let b = lo + step; b < hi && probes.length < 8; b += step) probes.push(b);
    if (!probes.length) break; const res = await arch(chain, probes.map((b) => [method, mk("0x" + b.toString(16))])); let nlo = lo, nhi = hi;
    for (let i = 0; i < probes.length; i++) { if (pred(res[i])) { nhi = probes[i]; break; } nlo = probes[i]; } lo = nlo; hi = nhi; }
  if (hi - lo > 1) { // finish linearly is too costly; final binary
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); const [r] = await arch(chain, [[method, mk("0x" + m.toString(16))]]); if (pred(r)) hi = m; else lo = m; } }
  return hi;
}
export const blockTime = async (chain, b) => { const [blk] = await arch(chain, [["eth_getBlockByNumber", ["0x" + b.toString(16), false]]]); return blk ? Number(big(blk.timestamp)) : null; };

export async function contractage(a) {
  const ad = a.address || a.contract; if (!isA(ad)) return bad("address (contract) required"); const c = chainOf(a.chain, ARCH); if (!c) return bad("chain: base|ethereum|optimism|polygon");
  try { const [code, hh] = await arch(c, [["eth_getCode", [ad, "latest"]], ["eth_blockNumber", []]]); const head = Number(big(hh));
    if (!code || code === "0x") return ok({ address: checksum(ad), chain: c, is_contract: false, note: "no code at latest block (EOA or self-destructed)" });
    if ((code.length - 2) / 2 === 23 && code.startsWith("0xef0100")) return ok({ address: checksum(ad), chain: c, is_contract: false, eip7702_delegated: true, delegate: checksum("0x" + code.slice(8)) });
    const b = await firstBlock(c, "eth_getCode", (blk) => [ad, blk], (r) => r && r !== "0x", head); const ts = await blockTime(c, b);
    const days = ts ? Math.floor((Date.now() / 1000 - ts) / 86400) : null;
    return ok({ address: checksum(ad), chain: c, is_contract: true, creation_block: b, created_at: ts ? new Date(ts * 1000).toISOString() : null, age_days: days, code_bytes: (code.length - 2) / 2, risk_flags: [days != null && days < 7 && "deployed_under_7d", days != null && days < 30 && "deployed_under_30d"].filter(Boolean), method: "archive getCode search" });
  } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
}

export async function walletage(a) {
  const ad = a.address || a.wallet; if (!isA(ad)) return bad("address (wallet) required"); const c = chainOf(a.chain, ARCH); if (!c) return bad("chain: base|ethereum|optimism|polygon");
  try { const [n, hh, code, bal] = await arch(c, [["eth_getTransactionCount", [ad, "latest"]], ["eth_blockNumber", []], ["eth_getCode", [ad, "latest"]], ["eth_getBalance", [ad, "latest"]]]); const nonce = Number(big(n)), head = Number(big(hh));
    const base = { address: checksum(ad), chain: c, nonce, balance_wei: big(bal).toString(), is_contract: !!code && code !== "0x" && !code.startsWith("0xef0100"), eip7702: !!code && code.startsWith("0xef0100") };
    if (nonce === 0) return ok({ ...base, first_outgoing_block: null, first_outgoing_at: null, age_days: null, activity: "never_sent", risk_flags: ["no_outgoing_tx"] });
    const b = await firstBlock(c, "eth_getTransactionCount", (blk) => [ad, blk], (r) => r && big(r) > 0n, head); const ts = await blockTime(c, b);
    const days = ts ? Math.floor((Date.now() / 1000 - ts) / 86400) : null; const perDay = days ? +(nonce / Math.max(1, days)).toFixed(2) : null;
    return ok({ ...base, first_outgoing_block: b, first_outgoing_at: ts ? new Date(ts * 1000).toISOString() : null, age_days: days, tx_per_day: perDay, activity: nonce > 1000 ? "heavy" : nonce > 50 ? "active" : nonce > 5 ? "light" : "minimal", risk_flags: [days != null && days < 7 && "fresh_wallet_under_7d", days != null && days < 30 && "wallet_under_30d", nonce < 3 && "very_few_txs", perDay > 500 && "bot_like_rate"].filter(Boolean), method: "archive nonce search (first outgoing tx)" });
  } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
}

const MAXU = (1n << 256n) - 1n;
const SPENDERS = { "Permit2": "0x000000000022D473030F116dDEE9F6B43aC78BA3", "1inch v6": "0x111111125421cA6dc452d289314280a0f8842A65", "0x Exchange Proxy": "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", "CoW vault relayer": "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110", "Uniswap V2 router": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", "Uniswap V3 router02": "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", "Paraswap v6": "0x6A000F20005980200259B80c5102003040001068", "KyberSwap": "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5", "Odos v2": "0x19cEeAd7105607Cd444F5ad10dd51356436095a1" };
const UR = { base: "0x6fF5693b99212Da76ad316178A184AB56D299b43", ethereum: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af", optimism: "0x851116D9223fabED8E56C0E6b8Ad0c31d98B3507", arbitrum: "0xA51afAFe0263b40EdaEf0Df8781eA9aa03E381a3", polygon: "0x1095692A6237d83C6a72F3F5eFEdb9A670C49223" };
const TOK = { base: ["0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", "0x4200000000000000000000000000000000000006", "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"], ethereum: ["0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "0xdAC17F958D2ee523a2206206994597C13D831ec7", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", "0x6B175474E89094C44Da98b954EedeAC495271d0F"], optimism: ["0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", "0x4200000000000000000000000000000000000006"], arbitrum: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"], polygon: ["0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619"] };
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).filter(Boolean);
export async function approvals(a) {
  const ow = a.owner || a.address; if (!isA(ow)) return bad("owner (wallet) required"); const s = String(a.chain ?? "base").toLowerCase(); const c = TOK[s] ? s : AL[s]; if (!c || !TOK[c] || !RPCS[c]) return bad("chain: base|ethereum|optimism|arbitrum|polygon");
  const tokens = [...new Set([...TOK[c], ...list(a.tokens)].map((x) => x.toLowerCase()))]; const sp = { ...SPENDERS, "Uniswap Universal Router": UR[c] }; for (const x of list(a.spenders)) sp[x.toLowerCase()] = x;
  if ([...tokens, ...Object.values(sp)].some((x) => !isA(x))) return bad("tokens/spenders must be addresses"); if (tokens.length > 12 || Object.keys(sp).length > 16) return bad("max 12 tokens, 16 spenders");
  const S = Object.entries(sp); const calls = []; for (const t of tokens) { calls.push(["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]]); for (const [, x] of S) calls.push(["eth_call", [{ to: t, data: "0xdd62ed3e" + pad(ow) + pad(x) }, "latest"]]); }
  let R = []; let rpc; try { for (let i = 0; i < calls.length; i += 60) { const r = await rpcBatch(c, calls.slice(i, i + 60)); R = R.concat(r.results); rpc = r.rpc; } } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const sym = (h) => { try { const x = h.slice(2); if (x.length === 64) return new TextDecoder().decode(new Uint8Array(x.match(/../g).map((b) => parseInt(b, 16)).filter((b) => b))); const n = Number(BigInt("0x" + x.slice(64, 128))); return new TextDecoder().decode(new Uint8Array(x.slice(128, 128 + n * 2).match(/../g).map((b) => parseInt(b, 16)))); } catch { return null; } };
  const out = []; let k = 0, failed = 0; const per = 2 + S.length;
  tokens.forEach((t, ti) => { const base = ti * per; const symb = sym(R[base]), d = Number(big(R[base + 1])) || 18; S.forEach(([name, x], si) => { const h = R[base + 2 + si]; if (h == null) { failed++; return; } const al = big(h); if (al === 0n) return; const unl = al >= MAXU / 2n || al >= (1n << 160n) - 1n;
    out.push({ token: checksum(t), symbol: symb, spender: checksum(x), spender_name: isA(name) ? null : name, allowance_raw: al.toString(), allowance: unl ? "unlimited" : (Number(al) / 10 ** d).toString(), unlimited: unl, risk: unl ? "unlimited" : "limited" }); }); k++; });
  out.sort((x, y) => (y.unlimited ? 1 : 0) - (x.unlimited ? 1 : 0));
  return ok({ owner: checksum(ow), chain: c, pairs_checked: tokens.length * S.length, active: out.length, unlimited: out.filter((x) => x.unlimited).length, approvals: out, failed_calls: failed, spenders_checked: S.map(([n, x]) => ({ name: isA(n) ? null : n, address: checksum(x) })), note: "live allowance matrix (tokens x well-known routers + yours); pass tokens= and spenders= to extend; revoke via approve(spender,0)", rpc });
}

const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
export async function usdcauth(a) {
  const who = a.authorizer || a.from || a.address; if (!isA(who)) return bad("authorizer (payer address) required"); const s = String(a.chain ?? a.network ?? "base").toLowerCase(); const c = USDC[s] ? s : AL[s] || (s === "84532" ? "base-sepolia" : null); if (!c || !USDC[c]) return bad("unsupported chain");
  const nonces = (Array.isArray(a.nonces) ? a.nonces : String(a.nonces ?? a.nonce ?? "").split(/[\s,]+/)).filter(Boolean); if (nonces.length > 20) return bad("max 20 nonces"); if (nonces.some((n) => !/^0x[0-9a-fA-F]{64}$/.test(n))) return bad("nonces must be 0x + 64 hex (bytes32)");
  const to = a.to && isA(a.to) ? a.to : null; const T = USDC[c];
  const calls = [["eth_call", [{ to: T, data: "0x70a08231" + pad(who) }, "latest"]], ["eth_call", [{ to: T, data: "0xfe575a87" + pad(who) }, "latest"]], ["eth_call", [{ to: T, data: "0x5c975abb" }, "latest"]], ...(to ? [["eth_call", [{ to: T, data: "0xfe575a87" + pad(to) }, "latest"]]] : []), ...nonces.map((n) => ["eth_call", [{ to: T, data: "0xe94a0102" + pad(who) + pad(n) }, "latest"]])];
  let r; try { r = await rpcBatch(c, calls); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const R = r.results, off = to ? 4 : 3; const bal = big(R[0]); const blk = R[1] != null ? big(R[1]) === 1n : null; const paused = R[2] != null ? big(R[2]) === 1n : null; const toBlk = to ? (R[3] != null ? big(R[3]) === 1n : null) : undefined;
  const ns = nonces.map((n, i) => ({ nonce: n, used: R[off + i] == null ? null : big(R[off + i]) === 1n }));
  const amt = a.amount ? BigInt(String(a.amount).includes(".") ? Math.round(Number(a.amount) * 1e6) : a.amount) : null;
  const issues = [blk && "authorizer_blacklisted", toBlk && "recipient_blacklisted", paused && "usdc_paused", ns.some((x) => x.used) && "nonce_already_used_replay", amt != null && bal < amt && "insufficient_balance"].filter(Boolean);
  return ok({ chain: c, usdc: T, authorizer: checksum(who), balance_usdc: (Number(bal) / 1e6).toString(), balance_raw: bal.toString(), authorizer_blacklisted: blk, recipient: to ? checksum(to) : null, recipient_blacklisted: toBlk ?? null, usdc_paused: paused, nonces: ns, amount_raw: amt != null ? amt.toString() : null, can_settle: issues.length === 0, issues, rpc: r.rpc });
}
