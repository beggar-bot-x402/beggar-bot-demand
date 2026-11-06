// packb9 (builder B, 2026-11-02): transfers, ensrecords, readcontract, nativebalances. $0 upstream (keyless RPC, DefiLlama coins).
import { rpcBatch, RPCS } from "./walletintel.js";
import { keccak, keccakHex, checksum, parseSig, decTuple, norm } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "8453": "base", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const chainOf = (c, d = "base") => { const s = String(c ?? d).toLowerCase(); return RPCS[s] ? s : AL[s] || null; };
const hx = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h).replace(/^0x/, ""); const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; };
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const fmt = (v, d) => { const neg = v < 0n; if (neg) v = -v; const s = v.toString().padStart(d + 1, "0"); const i = s.slice(0, s.length - d) || "0", f = s.slice(s.length - d).replace(/0+$/, ""); return (neg ? "-" : "") + (d && f ? `${i}.${f}` : i); };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// 1. transfers: recent ERC-20 in/out for a wallet (default USDC) — settlement / payment inbox
export async function transfers(a) {
  const who = a.address || a.wallet; if (!isA(who)) return bad("address (wallet) required"); const c = chainOf(a.chain); if (!c) return bad("unsupported chain");
  const token = a.token || USDC[c]; if (!isA(token)) return bad("token (0x) required on this chain");
  const span = Math.min(40000, Math.max(100, Number(a.blocks) || 10000)), CH = 5000;
  let head; try { head = Number(big((await rpcBatch(c, [["eth_blockNumber", []]])).results[0])); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const calls = []; for (let to = head; to > head - span; to -= CH) { const from = Math.max(to - CH + 1, head - span + 1); const r = ["0x" + from.toString(16), "0x" + to.toString(16)];
    calls.push(["eth_getLogs", [{ address: token, fromBlock: r[0], toBlock: r[1], topics: [TRANSFER, "0x" + pad(who)] }]], ["eth_getLogs", [{ address: token, fromBlock: r[0], toBlock: r[1], topics: [TRANSFER, null, "0x" + pad(who)] }]]); }
  let res, dec = 6, sym = null; try { res = await rpcBatch(c, [...calls, ["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0x95d89b41" }, "latest"]]]); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const R = res.results; dec = Number(big(R[calls.length])) || (token === USDC[c] ? 6 : 18); try { const h = R[calls.length + 1].slice(2); const n = Number(BigInt("0x" + h.slice(64, 128))); sym = new TextDecoder().decode(unhex(h.slice(128, 128 + n * 2))); } catch {}
  const failed = R.slice(0, calls.length).filter((x) => x === null).length; const seen = new Set(), out = [];
  for (const L of R.slice(0, calls.length)) for (const l of L || []) { const k = l.transactionHash + l.logIndex; if (seen.has(k)) continue; seen.add(k);
    const from = checksum("0x" + l.topics[1].slice(26)), to = checksum("0x" + l.topics[2].slice(26)), v = big(l.data); const dir = to.toLowerCase() === who.toLowerCase() ? "in" : "out";
    out.push({ direction: dir, from, to, amount: fmt(v, dec), amount_raw: v.toString(), block: Number(big(l.blockNumber)), tx: l.transactionHash, log_index: Number(big(l.logIndex)) }); }
  out.sort((x, y) => y.block - x.block || y.log_index - x.log_index);
  const sum = (d) => out.filter((x) => x.direction === d).reduce((s, x) => s + BigInt(x.amount_raw), 0n);
  const cps = {}; for (const x of out) { const cp = x.direction === "in" ? x.from : x.to; cps[cp] = (cps[cp] || 0) + 1; }
  return ok({ address: checksum(who), chain: c, token: checksum(token), symbol: sym, decimals: dec, from_block: head - span + 1, to_block: head, count: out.length, total_in: fmt(sum("in"), dec), total_out: fmt(sum("out"), dec), net: fmt(sum("in") - sum("out"), dec), top_counterparties: Object.entries(cps).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([address, n]) => ({ address, transfers: n })), transfers: out.slice(0, Math.min(200, Number(a.limit) || 50)), partial: failed > 0 ? `${failed}/${calls.length} log ranges failed` : false, rpc: res.rpc });
}

// 2. ensrecords: forward resolve + text records (ENS on L1, Basenames on Base)
const namehash = (n) => { let node = new Uint8Array(32); if (!n) return node; for (const l of n.split(".").reverse()) { const lh = keccak(new TextEncoder().encode(l)); const b = new Uint8Array(64); b.set(node); b.set(lh, 32); node = keccak(b); } return node; };
const KEYS = ["avatar", "description", "url", "email", "com.twitter", "com.github", "com.discord", "org.telegram", "xyz.farcaster", "header", "location"];
const encStr = (s) => { const u = new TextEncoder().encode(s); const p = Math.ceil(u.length / 32) * 32; return pad((32 * 2).toString(16)) + pad(u.length.toString(16)) + hx(u).padEnd(p * 2, "0"); };
const decStr = (h) => { try { h = h.slice(2); const off = Number(BigInt("0x" + h.slice(0, 64))) * 2; const n = Number(BigInt("0x" + h.slice(off, off + 64))); return new TextDecoder().decode(unhex(h.slice(off + 64, off + 64 + n * 2))) || null; } catch { return null; } };
export async function ensrecords(a) {
  const name = String(a.name || "").toLowerCase().trim(); if (!/^[a-z0-9\-_.]+\.[a-z]+$/.test(name) || name.length > 255) return bad("name (e.g. vitalik.eth or jesse.base.eth) required");
  const isBase = name.endsWith(".base.eth"); const c = isBase ? "base" : "ethereum"; const REG = isBase ? "0xb94704422c2a1e396835a571837aa5ae53285a95" : "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
  const node = hx(namehash(name)); const keys = a.keys ? String(a.keys).split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) : KEYS;
  let r; try { r = await rpcBatch(c, [["eth_call", [{ to: REG, data: "0x0178b8bf" + node }, "latest"]], ["eth_call", [{ to: REG, data: "0x02571be3" + node }, "latest"]]]); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const resolver = r.results[0] && big(r.results[0]) ? checksum("0x" + r.results[0].slice(26)) : null, owner = r.results[1] && big(r.results[1]) ? checksum("0x" + r.results[1].slice(26)) : null;
  if (!resolver) return ok({ name, chain: c, registered: !!owner, owner, resolver: null, note: "no resolver set (or offchain/CCIP name not supported)" });
  const calls = [["eth_call", [{ to: resolver, data: "0x3b3b57de" + node }, "latest"]], ["eth_call", [{ to: resolver, data: "0xbc1c58d1" + node }, "latest"]], ...keys.map((k) => ["eth_call", [{ to: resolver, data: "0x59d1d43c" + node + encStr(k) }, "latest"]])];
  let q; try { q = await rpcBatch(c, calls); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const addr = q.results[0] && big(q.results[0]) ? checksum("0x" + q.results[0].slice(26)) : null; const ch = q.results[1] && q.results[1].length > 130 ? "0x" + (decStr(q.results[1]) !== null ? hx(unhex(q.results[1].slice(2)).slice(64, 64 + Number(BigInt("0x" + q.results[1].slice(66, 130))))) : "") : null;
  const texts = {}; keys.forEach((k, i) => { const v = q.results[2 + i]; const s = v && v.length > 2 ? decStr(v) : null; if (s) texts[k] = s; });
  return ok({ name, chain: c, registered: true, owner, resolver, address: addr, contenthash: ch && ch.length > 2 ? ch : null, records: texts, record_count: Object.keys(texts).length, socials: { twitter: texts["com.twitter"] || null, github: texts["com.github"] || null, farcaster: texts["xyz.farcaster"] || null, telegram: texts["org.telegram"] || null }, rpc: q.rpc });
}

// 3. readcontract: batch view calls by human signature, ABI-encode args, decode returns
const encArg = (t, v) => { if (t === "address") { if (!isA(v)) throw new Error("bad address arg " + v); return pad(v); } if (t === "bool") return pad(v === true || v === "true" ? "1" : "0");
  if (/^uint\d*$/.test(t)) return pad(BigInt(v).toString(16)); if (/^int\d*$/.test(t)) { let n = BigInt(v); if (n < 0n) n += 1n << 256n; return pad(n.toString(16)); }
  if (/^bytes\d+$/.test(t)) return String(v).replace(/^0x/, "").padEnd(64, "0"); throw new Error("only static arg types supported (address,uint,int,bool,bytesN): " + t); };
export async function readcontract(a) {
  let calls = a.calls; if (typeof calls === "string") { try { calls = JSON.parse(calls); } catch { return bad("calls must be JSON array"); } }
  if (!calls && a.to && a.sig) calls = [{ to: a.to, sig: a.sig, args: a.args ? (Array.isArray(a.args) ? a.args : String(a.args).split(",")) : [] }];
  if (!Array.isArray(calls) || !calls.length) return bad("calls [{to, sig:'balanceOf(address)(uint256)', args:[...]}] or to+sig+args required"); if (calls.length > 25) return bad("max 25 calls");
  const c = chainOf(a.chain); if (!c) return bad("unsupported chain"); const prep = [];
  try { for (const x of calls) { if (!isA(x.to)) throw new Error("bad to: " + x.to); const s = String(x.sig).trim(); const m = s.match(/^(.+?\))\s*(?:returns\s*)?(\(.*\))?$/); if (!m) throw new Error("bad sig " + s);
    const fn = parseSig(m[1]); const outs = m[2] ? (m[2].slice(1, -1).trim() ? m[2].slice(1, -1).split(",").map((t) => norm(t.trim().split(/\s+/)[0])) : []) : null; const args = x.args || [];
    if (args.length !== fn.params.length) throw new Error(`${fn.canonical}: expected ${fn.params.length} args`);
    prep.push({ to: x.to, fn, outs, data: fn.selector + fn.params.map((p, i) => encArg(p.type, args[i])).join("") }); } } catch (e) { return bad(String(e.message)); }
  let r; try { r = await rpcBatch(c, [...prep.map((p) => ["eth_call", [{ to: p.to, data: p.data }, a.block ? "0x" + Number(a.block).toString(16) : "latest"]]), ["eth_blockNumber", []]]); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const results = prep.map((p, i) => { const raw = r.results[i]; if (raw == null) return { to: p.to, sig: p.fn.canonical, success: false, error: "reverted or rpc error" };
    let decoded = null, err; if (p.outs && raw !== "0x") { try { decoded = decTuple(p.outs, unhex(raw), 0); if (decoded.length === 1) decoded = decoded[0]; } catch (e) { err = String(e.message); } }
    return { to: p.to, sig: p.fn.canonical, success: true, raw, decoded, ...(err ? { decode_error: err } : {}) }; });
  return ok({ chain: c, block: Number(big(r.results[prep.length])), count: results.length, results, rpc: r.rpc });
}

// 4. nativebalances: native coin balance across 5 chains + USD
const NATIVE = { ethereum: ["ETH", "coingecko:ethereum"], base: ["ETH", "coingecko:ethereum"], optimism: ["ETH", "coingecko:ethereum"], arbitrum: ["ETH", "coingecko:ethereum"], polygon: ["POL", "coingecko:polygon-ecosystem-token"] };
export async function nativebalances(a) {
  let L = a.addresses ?? a.address; if (typeof L === "string") L = L.split(/[\s,;]+/).filter(Boolean); if (!Array.isArray(L) || !L.length) return bad("address (or addresses <=10) required"); if (L.length > 10) return bad("max 10 addresses");
  if (L.some((x) => !isA(x))) return bad("invalid address");
  const chains = Object.keys(NATIVE); let px = {}; try { const p = await (await fetch("https://coins.llama.fi/prices/current/coingecko:ethereum,coingecko:polygon-ecosystem-token", { signal: AbortSignal.timeout(6000) })).json(); for (const [k, v] of Object.entries(p.coins || {})) px[k] = v.price; } catch {}
  const per = await Promise.all(chains.map(async (c) => { try { const r = await rpcBatch(c, L.flatMap((x) => [["eth_getBalance", [x, "latest"]], ["eth_getTransactionCount", [x, "latest"]]])); return { c, r: r.results }; } catch { return { c, r: null }; } }));
  const out = L.map((addr, i) => { let usd = 0; const by = {}; for (const { c, r } of per) { if (!r) { by[c] = { error: "rpc unavailable" }; continue; } const w = big(r[i * 2]), n = Number(big(r[i * 2 + 1])); const amt = Number(fmt(w, 18)); const u = px[NATIVE[c][1]] ? amt * px[NATIVE[c][1]] : null; if (u) usd += u; by[c] = { symbol: NATIVE[c][0], balance: fmt(w, 18), usd: u != null ? +u.toFixed(2) : null, tx_count: n }; }
    const active = Object.entries(by).filter(([, v]) => v.tx_count > 0).map(([k]) => k); return { address: checksum(addr), total_usd: +usd.toFixed(2), active_chains: active, chains: by }; });
  return ok({ count: out.length, prices_usd: { ETH: px["coingecko:ethereum"] ?? null, POL: px["coingecko:polygon-ecosystem-token"] ?? null }, results: out });
}
