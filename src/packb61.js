// packb61 (builder B, 2026-11-02): Ethereum Attestation Service on-chain: read+decode attestation, schema, attest tx (schema-typed encoding), revoke tx. $0 upstream (keyless RPCs).
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
const EAS = { base: ["0x4200000000000000000000000000000000000021", "0x4200000000000000000000000000000000000020"], optimism: ["0x4200000000000000000000000000000000000021", "0x4200000000000000000000000000000000000020"], ethereum: ["0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587", "0xA7b39296258348C78294F95B8b25a87C6eE7c8CF"], arbitrum: ["0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458", "0xA310da9c5B885E7fb3fbA9D66E9Ba6Df512b78eB"] };
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]], W = (h, i = 0) => BigInt("0x" + h.slice(64 * i, 64 * i + 64)), ad = (h, i) => checksum("0x" + h.slice(64 * i + 24, 64 * i + 64)), B32 = (h, i) => "0x" + h.slice(64 * i, 64 * i + 64);
const chq = (q) => { if (!q.chain) return null; const c = ck(q.chain); return c && EAS[c] ? c : null; };
const uid = (x) => (/^0x[0-9a-fA-F]{64}$/.test(String(x || "")) ? x.toLowerCase() : null);
const dynAt = (h, off) => { const n = Number(W(h.slice(off * 2), 0)); return h.slice(off * 2 + 64, off * 2 + 64 + n * 2); };
const T = (s) => String(s).split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [t, ...n] = x.split(/\s+/); return { type: t, name: n.join(" ") || null }; });
const isDyn = (t) => t === "string" || t === "bytes" || t.endsWith("[]");
function decode(schema, hex) { const fs = T(schema), h = hex.replace(/^0x/, ""), out = {};
  fs.forEach((f, i) => { const k = f.name || "field" + i, word = h.slice(64 * i, 64 * i + 64); if (word.length < 64) { out[k] = null; return; } const t = f.type;
    if (t === "address") out[k] = checksum("0x" + word.slice(24)); else if (t === "bool") out[k] = BigInt("0x" + word) !== 0n; else if (/^uint\d*$/.test(t)) out[k] = BigInt("0x" + word).toString(); else if (/^int\d*$/.test(t)) out[k] = BigInt.asIntN(256, BigInt("0x" + word)).toString();
    else if (/^bytes\d+$/.test(t)) out[k] = "0x" + word.slice(0, Number(t.slice(5)) * 2); else if (t === "string") out[k] = new TextDecoder().decode(unhex(dynAt(h, Number(BigInt("0x" + word))))); else if (t === "bytes") out[k] = "0x" + dynAt(h, Number(BigInt("0x" + word)));
    else if (t.endsWith("[]") && !isDyn(t.slice(0, -2))) { const o = Number(BigInt("0x" + word)) * 2, n = Number(BigInt("0x" + h.slice(o, o + 64))); out[k] = Array.from({ length: Math.min(n, 200) }, (_, j) => { const x = h.slice(o + 64 + 64 * j, o + 128 + 64 * j), b = t.slice(0, -2); return b === "address" ? checksum("0x" + x.slice(24)) : b === "bool" ? BigInt("0x" + x) !== 0n : /^bytes\d+$/.test(b) ? "0x" + x : BigInt("0x" + x).toString(); }); }
    else out[k] = "0x" + word; });
  return out; }
function encWord(t, v) { if (t === "address") { if (!isA(v)) throw new Error("bad address " + v); return pad(v.slice(2).toLowerCase()); } if (t === "bool") return pad(v === true || v === "true" || v === 1 || v === "1" ? "1" : "0");
  if (/^uint\d*$/.test(t)) { const b = BigInt(v); if (b < 0n) throw new Error("negative uint"); return pad(b.toString(16)); } if (/^int\d*$/.test(t)) return pad(BigInt.asUintN(256, BigInt(v)).toString(16));
  if (/^bytes\d+$/.test(t)) { const x = String(v).replace(/^0x/, ""); if (!/^[0-9a-fA-F]*$/.test(x) || x.length > Number(t.slice(5)) * 2) throw new Error("bad " + t); return x.padEnd(64, "0"); } throw new Error("unsupported type " + t); }
const tail = (hx) => pad((hx.length / 2).toString(16)) + hx.padEnd(Math.ceil(hx.length / 64) * 64, "0");
function encode(schema, vals) { const fs = T(schema); if (!fs.length) throw new Error("empty schema"); let head = "", tl = "", off = 32 * fs.length;
  fs.forEach((f, i) => { const v = Array.isArray(vals) ? vals[i] : vals[f.name]; if (v === undefined) throw new Error("missing value for " + (f.name || i)); const t = f.type;
    if (t === "string" || t === "bytes") { const hx = t === "string" ? [...new TextEncoder().encode(String(v))].map((b) => b.toString(16).padStart(2, "0")).join("") : String(v).replace(/^0x/, ""); head += pad(off.toString(16)); const e = tail(hx); tl += e; off += e.length / 2; }
    else if (t.endsWith("[]")) { if (!Array.isArray(v) || isDyn(t.slice(0, -2))) throw new Error("bad array " + t); head += pad(off.toString(16)); const e = pad(v.length.toString(16)) + v.map((x) => encWord(t.slice(0, -2), x)).join(""); tl += e; off += e.length / 2; }
    else head += encWord(t, v); });
  return "0x" + head + tl; }
async function getSchema(ch, id) { const r = (await rpcBatch(ch, [call(EAS[ch][1], sel("getSchema(bytes32)") + id.slice(2))])).results[0]; if (!r || r.length < 130) return null; const h = r.slice(2 + 64); if (/^0+$/.test(h.slice(0, 64))) return null; return { uid: B32(h, 0), resolver: ad(h, 1), revocable: W(h, 2) !== 0n, schema: new TextDecoder().decode(unhex(dynAt(h, Number(W(h, 3))))) }; }
export async function easschema(q) {
  const ch = chq(q); if (!ch) return bad("chain required (base, optimism, ethereum, arbitrum)"); const id = uid(q.uid || q.schema); if (!id) return bad("schema uid (bytes32) required");
  try { const s = await getSchema(ch, id); if (!s) return bad("schema not found"); return ok({ chain: ch, ...s, fields: T(s.schema), registry: checksum(EAS[ch][1]), source: "EAS SchemaRegistry eth_call" }); } catch (e) { return err(e); }
}
export async function easattest(q) {
  const ch = chq(q); if (!ch) return bad("chain required (base, optimism, ethereum, arbitrum)"); const id = uid(q.uid); if (!id) return bad("attestation uid (bytes32) required");
  try { const r = (await rpcBatch(ch, [call(EAS[ch][0], sel("getAttestation(bytes32)") + id.slice(2))])).results[0]; if (!r || r.length < 2 + 64 * 11) return bad("attestation not found"); const h = r.slice(2 + 64); if (/^0+$/.test(h.slice(0, 64))) return bad("attestation not found");
    const a = { uid: B32(h, 0), schema: B32(h, 1), time: Number(W(h, 2)), expiration_time: Number(W(h, 3)), revocation_time: Number(W(h, 4)), ref_uid: B32(h, 5), recipient: ad(h, 6), attester: ad(h, 7), revocable: W(h, 8) !== 0n, data: "0x" + dynAt(h, Number(W(h, 9))) }, now = Date.now() / 1000;
    const s = await getSchema(ch, a.schema); let dec = null; try { dec = s ? decode(s.schema, a.data) : null; } catch { dec = null; }
    return ok({ chain: ch, ...a, revoked: a.revocation_time > 0, expired: a.expiration_time > 0 && a.expiration_time < now, valid: !(a.revocation_time > 0) && !(a.expiration_time > 0 && a.expiration_time < now), schema_definition: s ? s.schema : null, decoded: dec, explorer: `https://${ch === "ethereum" ? "" : ch + "."}easscan.org/attestation/view/${a.uid}`, source: "EAS getAttestation + SchemaRegistry eth_call" });
  } catch (e) { return err(e); }
}
export async function easattestbuild(q) {
  const ch = chq(q); if (!ch) return bad("chain required (base, optimism, ethereum, arbitrum)"); const id = uid(q.schema); if (!id) return bad("schema uid required"); if (!isA(q.from)) return bad("from address required"); if (q.values == null && !q.data) return bad("values (JSON object/array per schema) or data (hex) required");
  try { const s = await getSchema(ch, id); if (!s) return bad("schema not found"); let vals = q.values; if (typeof vals === "string") { try { vals = JSON.parse(vals); } catch { return bad("values must be JSON"); } }
    let data; try { data = q.data ? (/^0x[0-9a-fA-F]*$/.test(q.data) ? q.data : null) : encode(s.schema, vals); } catch (e) { return bad("encode: " + e.message); } if (!data) return bad("bad data hex");
    const rc = isA(q.recipient) ? q.recipient : "0x" + "0".repeat(40), exp = BigInt(q.expiration || 0), rev = q.revocable == null ? s.revocable : String(q.revocable) === "true", ref = uid(q.ref_uid) || "0x" + "0".repeat(64);
    if (rev && !s.revocable) return bad("schema is not revocable; pass revocable=false");
    const cd = sel("attest((bytes32,(address,uint64,bool,bytes32,bytes,uint256)))") + pad("20") + id.slice(2) + pad("40") + pad(rc.slice(2).toLowerCase()) + pad(exp.toString(16)) + pad(rev ? "1" : "0") + ref.slice(2) + pad("c0") + pad("0") + tail(data.slice(2));
    const t = await txbuild({ chain: ch, from: q.from, to: EAS[ch][0], data: cd, value: "0" });
    return ok({ chain: ch, eas: checksum(EAS[ch][0]), schema: id, schema_definition: s.schema, encoded_data: data, decoded_preview: decode(s.schema, data), recipient: checksum(rc), revocable: rev, expiration: Number(exp), note: "the new attestation uid is emitted in the Attested event / returned by attest()", ...pick(t) });
  } catch (e) { return err(e); }
}
export async function easrevokebuild(q) {
  const ch = chq(q); if (!ch) return bad("chain required (base, optimism, ethereum, arbitrum)"); const id = uid(q.uid); if (!id) return bad("attestation uid required"); if (!isA(q.from)) return bad("from address required");
  try { const a = await easattest({ chain: ch, uid: id }); if (a.status !== 200) return a; const b = a.body, warn = [];
    if (!b.revocable) return bad("attestation is not revocable"); if (b.revoked) return bad("already revoked"); if (b.attester.toLowerCase() !== q.from.toLowerCase()) warn.push("from is not the attester; revoke will revert");
    const cd = sel("revoke((bytes32,(bytes32,uint256)))") + b.schema.slice(2) + id.slice(2) + pad("0"), t = await txbuild({ chain: ch, from: q.from, to: EAS[ch][0], data: cd, value: "0" });
    return ok({ chain: ch, uid: id, schema: b.schema, attester: b.attester, recipient: b.recipient, warnings: warn, ...pick(t) });
  } catch (e) { return err(e); }
}
