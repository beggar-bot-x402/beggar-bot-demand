// /v1/sigrecover (EIP-191 personal_sign / eth_sign + EIP-712 typed-data signer recovery) and /v1/svgsanitize (allowlist SVG sanitizer). Pure compute, zero outbound.
import { keccak, checksum } from "./evm.js";
import { recover, HALF_N } from "./secp.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const te = new TextEncoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h).trim().replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const w32 = (v) => unhex(BigInt.asUintN(256, v).toString(16).padStart(64, "0"));
// ---- EIP-712 ----
const deps = (t, types, s = new Set()) => { if (s.has(t) || !types[t]) return s; s.add(t); for (const f of types[t]) deps(f.type.replace(/\[\d*\]$/g, "").replace(/(\[\d*\])+$/, ""), types, s); return s; };
const encType = (t, types) => { const [p, ...r] = [...deps(t, types)]; return [p, ...r.sort()].map((n) => `${n}(${types[n].map((f) => f.type + " " + f.name).join(",")})`).join(""); };
const typeHash = (t, types) => keccak(te.encode(encType(t, types)));
function encVal(type, v, types, depth = 0) {
  if (depth > 16) throw new Error("typed data nested too deep");
  const arr = type.match(/^(.*)\[(\d*)\]$/); if (arr) { if (!Array.isArray(v)) throw new Error(type + " expects array"); if (arr[2] && v.length !== Number(arr[2])) throw new Error(type + " length mismatch"); return keccak(cat(...v.map((x) => encVal(arr[1], x, types, depth + 1)))); }
  if (types[type]) return hashStruct(type, v, types, depth + 1);
  if (type === "string") return keccak(te.encode(String(v)));
  if (type === "bytes") return keccak(unhex(v));
  if (type === "bool") return w32(v === true || v === "true" || v === 1 ? 1n : 0n);
  if (type === "address") { const h = String(v).replace(/^0x/i, ""); if (!/^[0-9a-f]{40}$/i.test(h)) throw new Error("bad address " + v); return w32(BigInt("0x" + h)); }
  let m = type.match(/^bytes(\d+)$/); if (m) { const b = unhex(v), n = +m[1]; if (n < 1 || n > 32 || b.length > n) throw new Error("bad " + type); const o = new Uint8Array(32); o.set(b); return o; }
  m = type.match(/^(u?)int(\d*)$/); if (m) { const bits = +(m[2] || 256), x = BigInt(v); if (m[1] ? (x < 0n || x >= 1n << BigInt(bits)) : (x < -(1n << BigInt(bits - 1)) || x >= 1n << BigInt(bits - 1))) throw new Error(type + " out of range"); return w32(x); }
  throw new Error("unknown type " + type);
}
function hashStruct(t, data, types, depth = 0) { if (!data || typeof data !== "object") throw new Error(t + " expects object"); return keccak(cat(typeHash(t, types), ...types[t].map((f) => { if (data[f.name] === undefined) throw new Error(`missing ${t}.${f.name}`); return encVal(f.type, data[f.name], types, depth); }))); }
export function typedDigest(td) {
  if (typeof td === "string") td = JSON.parse(td); const types = { ...(td.types || {}) }; const pt = td.primaryType; if (!pt || !types[pt]) throw new Error("primaryType missing from types");
  if (!types.EIP712Domain) { const D = [["name", "string"], ["version", "string"], ["chainId", "uint256"], ["verifyingContract", "address"], ["salt", "bytes32"]]; types.EIP712Domain = D.filter(([n]) => td.domain && td.domain[n] !== undefined).map(([name, type]) => ({ name, type })); }
  const ds = hashStruct("EIP712Domain", td.domain || {}, types), ms = pt === "EIP712Domain" ? null : hashStruct(pt, td.message, types);
  return { digest: keccak(cat(new Uint8Array([0x19, 0x01]), ds, ...(ms ? [ms] : []))), domain_separator: "0x" + hex(ds), struct_hash: ms && "0x" + hex(ms), encode_type: encType(pt, types), primaryType: pt, domain: td.domain };
}
// ---- signatures ----
export function parseSignature(sig) { const b = unhex(sig); let r, s, v;
  if (b.length === 65) { r = b.subarray(0, 32); s = b.subarray(32, 64); v = b[64]; v = v < 27 ? v : v >= 35 ? (v - 35) % 2 : v - 27; }
  else if (b.length === 64) { r = b.subarray(0, 32); const vs = b.subarray(32); v = vs[0] >> 7; s = Uint8Array.from(vs); s[0] &= 0x7f; } // EIP-2098 compact
  else throw new Error("signature must be 65 bytes (r,s,v) or 64 bytes (EIP-2098)");
  if (v > 1) throw new Error("bad recovery id"); return { r: BigInt("0x" + hex(r)), s: BigInt("0x" + hex(s)), parity: v, compact: b.length === 64 };
}
export function recoverAddress(h, sig) { const p = parseSignature(sig), [x, y] = recover(h, p.r, p.s, p.parity);
  const pub = unhex(x.toString(16).padStart(64, "0") + y.toString(16).padStart(64, "0")); return { address: checksum(hex(keccak(pub)).slice(24)), public_key: "0x04" + hex(pub), y_parity: p.parity, high_s: p.s > HALF_N, compact: p.compact }; }
export async function sigrecover(a) {
  const sig = a.signature ?? a.sig; if (!sig) return bad("signature required (0x 65-byte r||s||v or 64-byte EIP-2098)");
  const n = ["message", "typed_data", "hash"].filter((k) => a[k] !== undefined && a[k] !== ""); if (n.length !== 1) return bad("exactly one of message (EIP-191 personal_sign), typed_data (EIP-712 JSON) or hash (raw 32-byte digest) required");
  let mode, h, extra = {};
  try {
    if (a.message !== undefined) { if (String(a.message).length > 100000) return bad("message too long"); mode = "eip191_personal_sign";
      const m = a.encoding === "hex" || (a.encoding !== "utf8" && /^0x([0-9a-f]{2})*$/i.test(String(a.message))) ? unhex(a.message) : te.encode(String(a.message));
      h = keccak(cat(te.encode("\x19Ethereum Signed Message:\n" + m.length), m)); extra = { message_bytes: m.length, message_encoding: m === undefined ? null : (a.encoding || (/^0x/i.test(String(a.message)) ? "hex" : "utf8")) }; }
    else if (a.typed_data !== undefined) { const t = typeof a.typed_data === "string" ? a.typed_data : JSON.stringify(a.typed_data); if (t.length > 100000) return bad("typed_data too long"); mode = "eip712_typed_data"; const d = typedDigest(t); h = d.digest; delete d.digest; extra = d; }
    else { mode = "raw_hash"; h = unhex(a.hash); if (h.length !== 32) return bad("hash must be 32 bytes"); }
  } catch (e) { return bad(e.message); }
  try { const r = recoverAddress(h, sig), out = { valid: true, mode, signer: r.address, digest: "0x" + hex(h), ...extra, public_key: r.public_key, y_parity: r.y_parity, compact_eip2098: r.compact };
    if (r.high_s) out.warning = "high-s signature (malleable; rejected by OpenZeppelin ECDSA / ecrecover wrappers)";
    if (a.expected) { out.expected = String(a.expected); out.matches = out.expected.toLowerCase() === r.address.toLowerCase(); }
    out.note = "EOA ecrecover only; smart-contract wallets (EIP-1271/6492) need an on-chain call and are not checked"; return { status: 200, body: out };
  } catch (e) { return { status: 200, body: { valid: false, mode, digest: "0x" + hex(h), error: e.message } }; }
}
// ---- SVG sanitize (allowlist) ----
const EL = new Set("svg g defs symbol use title desc metadata path rect circle ellipse line polyline polygon text tspan textPath lineargradient radialgradient stop pattern clippath mask marker filter image a switch view fecolormatrix fecomposite feflood fegaussianblur feoffset femerge femergenode feblend femorphology feturbulence fedisplacementmap fecomponenttransfer fefunca fefuncb fefuncg fefuncr fetile fedropshadow feimage style".toLowerCase().split(" "));
const ATTR = /^(id|class|style|viewbox|width|height|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|d|points|fill|fill-opacity|fill-rule|stroke|stroke-[a-z-]+|opacity|transform|preserveaspectratio|version|xmlns(:xlink)?|offset|stop-color|stop-opacity|gradientunits|gradienttransform|spreadmethod|fx|fy|fr|patternunits|patterncontentunits|patterntransform|clip-path|clip-rule|cliprule|clippathunits|mask|maskunits|maskcontentunits|marker-(start|mid|end)|markerwidth|markerheight|markerunits|refx|refy|orient|filter|filterunits|primitiveunits|in2?|result|stddeviation|dx|dy|values|type|mode|operator|k[1-4]|flood-color|flood-opacity|radius|basefrequency|numoctaves|seed|scale|xchannelselector|ychannelselector|tablevalues|slope|intercept|amplitude|exponent|font-[a-z-]+|text-anchor|dominant-baseline|alignment-baseline|letter-spacing|word-spacing|text-decoration|lengthadjust|textlength|startoffset|rotate|visibility|display|color|overflow|vector-effect|paint-order|shape-rendering|text-rendering|image-rendering|color-interpolation(-filters)?|mix-blend-mode|isolation|href|xlink:href|xml:space|xml:lang|lang|role|aria-[a-z-]+|data-[a-z0-9-]+|target)$/i;
const BAD_URL = /^\s*(javascript|vbscript|data:(?!image\/(png|jpe?g|gif|webp);base64,)|file|blob)/i;
const deEnt = (s) => s.replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16) % 0x110000)).replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(+d % 0x110000)).replace(/&colon;/gi, ":").replace(/&tab;|&newline;/gi, "");
const cleanCss = (css, ext) => /expression\s*\(|javascript:|behavior\s*:|-moz-binding|@import/i.test(deEnt(css).replace(/\\|\/\*.*?\*\//gs, "")) ? null : ext ? css : css.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");
const esc = (s) => s.replace(/&(?![a-z]+;|#\d+;|#x[0-9a-f]+;)/gi, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
export function sanitizeSvg(src, { allowExternal = false } = {}) {
  const removed = { elements: {}, attributes: {} }, bump = (o, k) => (o[k] = (o[k] || 0) + 1);
  src = String(src).replace(/^\uFEFF/, "").replace(/<\?xml[^>]*\?>/i, "");
  if (/<!ENTITY/i.test(src)) bump(removed.elements, "!ENTITY (XXE / billion laughs)");
  src = src.replace(/<!DOCTYPE(\s[^[>]*)?(\[[\s\S]*?\])?\s*>/gi, () => (bump(removed.elements, "!DOCTYPE"), "")).replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, t) => esc(t));
  const out = []; const stack = []; let skip = 0, i = 0, root = false;
  const re = /<\/?([a-zA-Z][\w:.-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|<|[^<]+/g; let m;
  while ((m = re.exec(src))) { const tok = m[0];
    if (!m[1]) { if (!skip) out.push(tok === "<" ? "&lt;" : esc(tok.replace(/&lt;/g, "\u0000")).replace(/\u0000/g, "&lt;")); continue; }
    const name = m[1], ln = name.toLowerCase().replace(/^svg:/, ""), close = tok[1] === "/", self = !!m[3];
    if (close) { if (skip) { if (stack.length && stack[stack.length - 1].n === ln) { const s = stack.pop(); if (s.skip) skip--; } continue; } const s = stack.pop(); if (s && !s.skip) out.push(`</${s.raw}>`); continue; }
    const ok = !skip && EL.has(ln);
    if (!ok) { if (!skip) bump(removed.elements, ln); if (!self) { stack.push({ n: ln, skip: true }); skip++; } continue; }
    if (ln === "svg") root = true;
    const attrs = []; const ar = /([^\s=>\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g; let am;
    while ((am = ar.exec(m[2]))) { const an = am[1], al = an.toLowerCase(); let v = am[2] === undefined ? "" : am[2].replace(/^["']|["']$/g, "");
      if (!ATTR.test(al) || /^on/i.test(al)) { bump(removed.attributes, al); continue; }
      const dv = deEnt(v).replace(/[\u0000-\u0020]/g, "");
      if (al === "href" || al === "xlink:href") { if (BAD_URL.test(dv) || (!allowExternal && !dv.startsWith("#") && !(ln === "image" && /^data:image\//i.test(dv)))) { bump(removed.attributes, al + (BAD_URL.test(dv) ? " (script/unsafe URL)" : " (external)")); continue; } }
      if (al === "style") { const c = cleanCss(v, allowExternal); if (c === null) { bump(removed.attributes, "style (script)"); continue; } v = c; }
      if (/url\(/i.test(v) && al !== "style" && (/javascript:/i.test(dv) || (!allowExternal && /url\(\s*['"]?(?!#)/i.test(v)))) { bump(removed.attributes, al + " (external url)"); continue; }
      attrs.push(` ${an}="${esc(deEnt(v))}"`); }
    if (ln === "style") { // keep CSS text, drop on danger
      const end = src.toLowerCase().indexOf("</style", re.lastIndex); const css = src.slice(re.lastIndex, end < 0 ? src.length : end); re.lastIndex = end < 0 ? src.length : src.indexOf(">", end) + 1;
      const c = cleanCss(css, allowExternal); if (c === null) { bump(removed.elements, "style (script)"); continue; } out.push(`<style${attrs.join("")}>${c.replace(/</g, "\\3C ")}</style>`); continue; }
    out.push(`<${name}${attrs.join("")}${self ? "/" : ""}>`); if (!self) stack.push({ n: ln, raw: name, skip: false });
  }
  while (stack.length) { const s = stack.pop(); if (!s.skip) out.push(`</${s.raw}>`); }
  return { svg: out.join("").trim(), root_svg: root, removed };
}
export async function svgsanitize(a) {
  let s = a.svg ?? a.input; if (!s && a.b64) { try { s = new TextDecoder().decode(Uint8Array.from(atob(String(a.b64).replace(/^data:[^,]*,/, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0))); } catch { return bad("invalid base64"); } }
  if (!s) return bad("svg (markup) or b64 required"); s = String(s); if (s.length > 1_000_000) return bad("svg too large (max 1 MB)");
  const r = sanitizeSvg(s, { allowExternal: a.allow_external === true || a.allow_external === "true" });
  const n = Object.values(r.removed.elements).reduce((x, y) => x + y, 0) + Object.values(r.removed.attributes).reduce((x, y) => x + y, 0);
  if (!r.root_svg) return { status: 200, body: { valid: false, error: "no <svg> root element found", removed: r.removed } };
  return { status: 200, body: { valid: true, safe: true, changed: n > 0, removed_count: n, removed: r.removed, bytes_in: s.length, bytes_out: r.svg.length, svg: r.svg,
    svg_data_uri: "data:image/svg+xml;base64," + btoa(String.fromCharCode(...te.encode(r.svg)).slice(0)) , note: "allowlist sanitizer: scripts, event handlers, foreignObject, DOCTYPE/ENTITY, javascript:/external refs removed; serve with Content-Type image/svg+xml + CSP for defense in depth" } };
}
