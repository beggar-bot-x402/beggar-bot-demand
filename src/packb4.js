// packb4 (builder B, 2026-11-02): stablesupply, ensexpiry, safeowners, eip712hash, feehistory. $0 upstream (DefiLlama public, keyless RPC).
import { rpcBatch, RPCS } from "./walletintel.js";
import { keccak, keccakHex, checksum } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const CH = { "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "8453": "base", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const chain = (c, d = "base") => { const s = String(c ?? d).toLowerCase(); return RPCS[s] ? s : CH[s] || null; };
const enc = new TextEncoder();
const hex = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = h.replace(/^0x/, ""); if (h.length % 2) h = "0" + h; const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u; };
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);

// 1. stablesupply
export async function stablesupply(a) {
  const r = await fetch("https://stablecoins.llama.fi/stablecoins?includePrices=true", { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) }).catch(() => null);
  if (!r || !r.ok) return { status: 502, body: { error: "defillama stablecoins unavailable" } };
  const j = await r.json(); const want = String(a.chain || "").toLowerCase(); const sym = String(a.symbol || "").toUpperCase();
  const amt = (o) => (o && (o.peggedUSD ?? 0)) || 0;
  let rows = (j.peggedAssets || []).filter((x) => x.pegType === "peggedUSD").map((x) => {
    const cc = x.chainCirculating || {}; const k = want ? Object.keys(cc).find((n) => n.toLowerCase() === want) : null;
    const src = want ? (k ? cc[k] : null) : { current: x.circulating, circulatingPrevDay: x.circulatingPrevDay, circulatingPrevWeek: x.circulatingPrevWeek, circulatingPrevMonth: x.circulatingPrevMonth };
    if (!src) return null; const now = amt(src.current), d = amt(src.circulatingPrevDay), w = amt(src.circulatingPrevWeek), m = amt(src.circulatingPrevMonth);
    const pct = (p) => (p ? +(((now - p) / p) * 100).toFixed(3) : null);
    return { symbol: x.symbol, name: x.name, mechanism: x.pegMechanism, supply_usd: Math.round(now), change_1d_pct: pct(d), change_7d_pct: pct(w), change_30d_pct: pct(m), net_7d_usd: Math.round(now - w) };
  }).filter((x) => x && x.supply_usd > 0);
  if (sym) rows = rows.filter((x) => x.symbol.toUpperCase() === sym);
  rows.sort((x, y) => y.supply_usd - x.supply_usd);
  const total = rows.reduce((s, x) => s + x.supply_usd, 0); const lim = Math.min(50, Math.max(1, Number(a.limit) || 15));
  return ok({ scope: want || "all_chains", total_supply_usd: total, net_7d_usd: rows.reduce((s, x) => s + x.net_7d_usd, 0), count: rows.length, top: rows.slice(0, lim).map((x) => ({ ...x, share_pct: total ? +((x.supply_usd / total) * 100).toFixed(2) : null })), source: "stablecoins.llama.fi" });
}

// 2. ensexpiry (.eth 2LDs via BaseRegistrar)
const REG = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85", GRACE = 90 * 86400;
export async function ensexpiry(a) {
  let L = a.names ?? a.name; if (typeof L === "string") L = L.split(/[\s,;]+/).filter(Boolean);
  if (!Array.isArray(L) || !L.length) return bad("names (comma list of .eth names, <=20) required"); if (L.length > 20) return bad("max 20 names");
  const labels = L.map((n) => String(n).toLowerCase().trim().replace(/\.eth$/, ""));
  if (labels.some((l) => !l || l.includes("."))) return bad("only second-level .eth names (e.g. vitalik.eth)");
  const calls = labels.map((l) => ["eth_call", [{ to: REG, data: "0xd6e4fa86" + keccakHex(l).slice(2) }, "latest"]]);
  let res; try { res = await rpcBatch("ethereum", calls); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const now = Math.floor(Date.now() / 1000);
  const out = labels.map((l, i) => { const ex = Number(big(res.results[i])); if (!ex) return { name: l + ".eth", registered: false, status: "available_or_never_registered" };
    const left = ex - now; const status = left > 0 ? (left < 30 * 86400 ? "expiring_soon" : "active") : left + GRACE > 0 ? "grace_period" : "expired_premium_or_available";
    return { name: l + ".eth", registered: true, expires: new Date(ex * 1000).toISOString(), days_left: Math.floor(left / 86400), grace_ends: new Date((ex + GRACE) * 1000).toISOString(), status }; });
  return ok({ count: out.length, results: out, registrar: REG, rpc: res.rpc });
}

// 3. safeowners
export async function safeowners(a) {
  const s = a.safe || a.address; if (!isA(s)) return bad("safe (0x address) required"); const c = chain(a.chain); if (!c) return bad("unsupported chain");
  const call = (d) => ["eth_call", [{ to: s, data: d }, "latest"]];
  let r; try { r = await rpcBatch(c, [call("0xa0e67e2b"), call("0xe75235b8"), call("0xaffed0e0"), call("0xffa1ad74"), ["eth_getCode", [s, "latest"]]]); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const [ow, th, nn, ver, code] = r.results;
  if (!code || code === "0x") return ok({ safe: s, chain: c, is_contract: false, is_safe: false });
  if (!ow || ow.length < 130) return ok({ safe: s, chain: c, is_contract: true, is_safe: false, note: "getOwners() not supported" });
  const h = ow.slice(2), n = Number(BigInt("0x" + h.slice(64, 128))); const owners = []; for (let i = 0; i < Math.min(n, 100); i++) owners.push(checksum("0x" + h.slice(128 + i * 64 + 24, 128 + (i + 1) * 64)));
  let version = null; try { const vh = ver.slice(2); const len = Number(BigInt("0x" + vh.slice(64, 128))); version = new TextDecoder().decode(unhex(vh.slice(128, 128 + len * 2))); } catch {}
  const t = Number(big(th));
  return ok({ safe: checksum(s), chain: c, is_safe: true, version, threshold: t, owner_count: n, policy: `${t}-of-${n}`, nonce: Number(big(nn)), owners, risk_flags: [t === 1 && n > 1 && "single_signer_can_execute", t === 1 && n === 1 && "single_owner_safe"].filter(Boolean), rpc: r.rpc });
}

// 4. eip712hash
const pad32 = (u) => { const o = new Uint8Array(32); o.set(u, 32 - u.length); return o; };
const cat = (arr) => { const o = new Uint8Array(arr.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of arr) { o.set(x, i); i += x.length; } return o; };
function deps(t, types, seen = new Set()) { if (seen.has(t) || !types[t]) return seen; seen.add(t); for (const f of types[t]) deps(f.type.replace(/\[.*$/, ""), types, seen); return seen; }
function encodeType(t, types) { const [p, ...rest] = [...deps(t, types)]; return [p, ...rest.sort()].map((n) => `${n}(${types[n].map((f) => `${f.type} ${f.name}`).join(",")})`).join(""); }
const typeHash = (t, types) => keccak(enc.encode(encodeType(t, types)));
function encVal(type, v, types) {
  if (types[type]) return hashStruct(type, v, types);
  const arr = type.match(/^(.*)\[(\d*)\]$/); if (arr) return keccak(cat((v || []).map((x) => encVal(arr[1], x, types))));
  if (type === "string") return keccak(enc.encode(String(v)));
  if (type === "bytes") return keccak(unhex(String(v)));
  if (type === "bool") return pad32(new Uint8Array([v === true || v === "true" ? 1 : 0]));
  if (type === "address") { if (!isA(v)) throw new Error("bad address " + v); return pad32(unhex(v)); }
  if (/^bytes\d+$/.test(type)) { const o = new Uint8Array(32); o.set(unhex(String(v)).slice(0, 32)); return o; }
  if (/^u?int\d*$/.test(type)) { let n = BigInt(v); if (n < 0n) n = (1n << 256n) + n; return unhex(n.toString(16).padStart(64, "0")); }
  throw new Error("unsupported type " + type);
}
function hashStruct(t, data, types) { return keccak(cat([typeHash(t, types), ...types[t].map((f) => encVal(f.type, (data || {})[f.name], types))])); }
export async function eip712hash(a) {
  let td = a.typed_data ?? a.typedData ?? a; if (typeof td === "string") { try { td = JSON.parse(td); } catch { return bad("typed_data must be JSON"); } }
  if (!td || !td.types || !td.primaryType || !td.message) return bad("typed_data {types, primaryType, domain, message} required");
  try {
    const types = { ...td.types }; if (!types.EIP712Domain) { const D = [["name", "string"], ["version", "string"], ["chainId", "uint256"], ["verifyingContract", "address"], ["salt", "bytes32"]]; types.EIP712Domain = D.filter(([k]) => td.domain && td.domain[k] !== undefined).map(([name, type]) => ({ name, type })); }
    const ds = hashStruct("EIP712Domain", td.domain || {}, types), sh = hashStruct(td.primaryType, td.message, types);
    const digest = keccak(cat([new Uint8Array([0x19, 0x01]), ds, sh]));
    const m = td.message || {}; const warn = [];
    const big2 = (x) => { try { return BigInt(x); } catch { return 0n; } };
    for (const k of ["value", "amount"]) if (m[k] !== undefined && big2(m[k]) >= (1n << 255n)) warn.push("unlimited_" + k);
    if (m.details && m.details.amount !== undefined && big2(m.details.amount) >= (1n << 159n)) warn.push("unlimited_permit2_amount");
    const dl = m.deadline ?? m.validBefore ?? m.sigDeadline ?? m.expiry; if (dl !== undefined && Number(dl) > Date.now() / 1000 + 365 * 86400) warn.push("deadline_over_1y");
    return ok({ primary_type: td.primaryType, encoded_type: encodeType(td.primaryType, types), domain_separator: hex(ds), struct_hash: hex(sh), digest: hex(digest), domain: td.domain || {}, warnings: warn });
  } catch (e) { return bad(String(e.message)); }
}

// 5. feehistory
export async function feehistory(a) {
  const c = chain(a.chain, "base"); if (!c) return bad("unsupported chain"); const n = Math.min(100, Math.max(2, Number(a.blocks) || 20));
  let r; try { r = await rpcBatch(c, [["eth_feeHistory", ["0x" + n.toString(16), "latest", [10, 50, 90]]], ["eth_gasPrice", []], ["eth_maxPriorityFeePerGas", []]]); } catch (e) { return { status: 502, body: { error: String(e.message) } }; }
  const fh = r.results[0]; if (!fh) return { status: 502, body: { error: "eth_feeHistory unsupported" } };
  const g = (h) => Number(big(h)) / 1e9; const base = (fh.baseFeePerGas || []).map(g); const blob = (fh.baseFeePerBlobGas || []).map(g);
  const st = (xs) => { if (!xs.length) return null; const s = [...xs].sort((p, q) => p - q); return { min: s[0], median: s[s.length >> 1], max: s[s.length - 1], latest: xs[xs.length - 1] }; };
  const tips = (i) => (fh.reward || []).map((x) => g(x[i]));
  const ratio = fh.gasUsedRatio || []; const nextBase = base[base.length - 1];
  const trend = base.length > 2 ? (base[base.length - 1] > base[0] * 1.1 ? "rising" : base[base.length - 1] < base[0] * 0.9 ? "falling" : "flat") : null;
  const p50 = st(tips(1)); const rec = { maxPriorityFeePerGas_gwei: p50 ? p50.median : g(r.results[2]), maxFeePerGas_gwei: +(nextBase * 2 + (p50 ? p50.median : 0)).toFixed(9) };
  return ok({ chain: c, blocks: n, oldest_block: Number(big(fh.oldestBlock)), base_fee_gwei: st(base), next_base_fee_gwei: nextBase, priority_fee_gwei: { p10: st(tips(0)), p50, p90: st(tips(2)) }, avg_gas_used_ratio: ratio.length ? +(ratio.reduce((s, x) => s + x, 0) / ratio.length).toFixed(3) : null, blob_base_fee_gwei: st(blob), trend, recommended_eip1559: rec, gas_price_gwei: g(r.results[1]), rpc: r.rpc });
}
