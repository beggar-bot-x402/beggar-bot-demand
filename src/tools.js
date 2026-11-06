// /v1/util (pure compute, zero outbound), /v1/contacts (page-public business contacts), /v1/batch (N fetches/contacts, one payment).
import { fetchPage } from "./fetchpage.js";

const enc = new TextEncoder();
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const MAX_INPUT = 100_000;
export const UTIL_OPS = ["hash", "uuid", "base64_encode", "base64_decode", "json_validate", "json_diff", "timezone_convert", "unit_convert", "regex_match"];
const ALGS = { sha1: "SHA-1", "sha-1": "SHA-1", sha256: "SHA-256", "sha-256": "SHA-256", sha384: "SHA-384", "sha-384": "SHA-384", sha512: "SHA-512", "sha-512": "SHA-512" };
const b64e = (s, url) => { let bin = ""; for (const c of enc.encode(s)) bin += String.fromCharCode(c); const o = btoa(bin); return url ? o.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : o; };
const b64d = (s) => { const t = String(s).replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/"); const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4)); return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
const parseJ = (v) => (typeof v === "string" ? JSON.parse(v) : v);
export function jsonDiff(a, b, path = "", out = []) {
  if (out.length >= 500) return out;
  const ta = Array.isArray(a) ? "array" : a === null ? "null" : typeof a, tb = Array.isArray(b) ? "array" : b === null ? "null" : typeof b;
  if (ta !== tb || (ta !== "object" && ta !== "array")) { if (ta !== tb || a !== b) out.push({ op: a === undefined ? "add" : b === undefined ? "remove" : "replace", path: path || "/", ...(a !== undefined ? { from: a } : {}), ...(b !== undefined ? { to: b } : {}) }); return out; }
  const keys = ta === "array" ? [...Array(Math.max(a.length, b.length)).keys()] : [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const k of keys) jsonDiff(a[k], b[k], path + "/" + String(k).replace(/~/g, "~0").replace(/\//g, "~1"), out);
  return out;
}
// linear units -> base factor; temperature handled separately
const UNITS = {
  length: { m: 1, km: 1000, cm: 0.01, mm: 0.001, um: 1e-6, nm: 1e-9, mi: 1609.344, yd: 0.9144, ft: 0.3048, in: 0.0254, nmi: 1852 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, t: 1000, lb: 0.45359237, oz: 0.028349523125, st: 6.35029318 },
  volume: { l: 1, ml: 0.001, m3: 1000, gal: 3.785411784, qt: 0.946352946, pt: 0.473176473, cup: 0.2365882365, floz: 0.0295735295625, "gal_uk": 4.54609 },
  time: { s: 1, ms: 0.001, min: 60, h: 3600, d: 86400, wk: 604800 },
  data: { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1048576, gib: 1073741824, tib: 1099511627776, bit: 0.125 },
  speed: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, kn: 0.514444 },
  area: { m2: 1, km2: 1e6, ha: 1e4, acre: 4046.8564224, ft2: 0.09290304, mi2: 2589988.110336 },
};
const TEMP = { c: [(x) => x, (x) => x], f: [(x) => (x - 32) * 5 / 9, (x) => x * 9 / 5 + 32], k: [(x) => x - 273.15, (x) => x + 273.15] };
const tzParts = (d, tz) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value])); return p; };
const tzOffsetMin = (d, tz) => { const p = tzParts(d, tz); return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000); };
const fmtOff = (m) => (m < 0 ? "-" : "+") + String(Math.floor(Math.abs(m) / 60)).padStart(2, "0") + ":" + String(Math.abs(m) % 60).padStart(2, "0");
const localIso = (d, tz) => { const p = tzParts(d, tz); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${fmtOff(tzOffsetMin(d, tz))}`; };

export async function util(a) {
  const op = a.op, E = (m) => ({ status: 400, body: { error: m, op: op || null, ops: UTIL_OPS } });
  if (!UTIL_OPS.includes(op)) return E("op must be one of " + UTIL_OPS.join(", "));
  const big = Object.values(a).some((v) => (typeof v === "string" ? v : JSON.stringify(v ?? "")).length > MAX_INPUT); if (big) return E("input too large (100KB per field)");
  try {
    switch (op) {
      case "hash": {
        const alg = String(a.algorithm || "sha256").toLowerCase(); if (!ALGS[alg]) return E("algorithm: sha1|sha256|sha384|sha512");
        const data = a.encoding === "base64" ? Uint8Array.from(atob(String(a.input ?? "")), (c) => c.charCodeAt(0)) : enc.encode(String(a.input ?? ""));
        const d = await crypto.subtle.digest(ALGS[alg], data); let b = ""; for (const c of new Uint8Array(d)) b += String.fromCharCode(c);
        return { status: 200, body: { op, algorithm: ALGS[alg], hex: hex(d), base64: btoa(b), bytes: data.byteLength } };
      }
      case "uuid": { const n = Math.min(Math.max(parseInt(a.count || "1", 10) || 1, 1), 100); return { status: 200, body: { op, version: 4, uuids: Array.from({ length: n }, () => crypto.randomUUID()) } }; }
      case "base64_encode": return { status: 200, body: { op, output: b64e(String(a.input ?? ""), a.url_safe === true || a.url_safe === "true") } };
      case "base64_decode": try { return { status: 200, body: { op, output: b64d(a.input ?? "") } }; } catch { return E("input is not valid base64 of UTF-8 text"); }
      case "json_validate": try { const v = parseJ(a.input ?? ""); return { status: 200, body: { op, valid: true, type: Array.isArray(v) ? "array" : v === null ? "null" : typeof v, canonical: JSON.stringify(v) } }; } catch (e) { return { status: 200, body: { op, valid: false, error: String(e.message).slice(0, 200) } }; }
      case "json_diff": { let x, y; try { x = parseJ(a.a); y = parseJ(a.b); } catch { return E("a and b must be JSON (string or value)"); } const d = jsonDiff(x, y); return { status: 200, body: { op, equal: d.length === 0, changes: d, count: d.length, format: "JSON-Pointer paths; op add|remove|replace" } }; }
      case "timezone_convert": {
        const to = a.to || "UTC", from = a.from || "UTC"; try { new Intl.DateTimeFormat("en", { timeZone: to }); new Intl.DateTimeFormat("en", { timeZone: from }); } catch { return E("from/to must be IANA time zones, e.g. Europe/London"); }
        const t = a.time ? String(a.time) : new Date().toISOString(); let d;
        if (/[zZ]|[+-]\d\d:?\d\d$/.test(t) || /^\d+$/.test(t)) d = new Date(/^\d+$/.test(t) ? +t * (t.length <= 10 ? 1000 : 1) : t);
        else { const m = t.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d)(?::(\d\d))?)?$/); if (!m) return E("time: ISO 8601 (local wall time interpreted in `from`) or unix seconds/ms");
          const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)); d = new Date(guess - tzOffsetMin(new Date(guess), from) * 60000); d = new Date(guess - tzOffsetMin(d, from) * 60000); }
        if (isNaN(d)) return E("unparseable time");
        return { status: 200, body: { op, utc: d.toISOString(), unix: Math.floor(d / 1000), from: { tz: from, local: localIso(d, from) }, to: { tz: to, local: localIso(d, to), offset: fmtOff(tzOffsetMin(d, to)) } } };
      }
      case "unit_convert": {
        const v = Number(a.value), f = String(a.from || "").toLowerCase(), t = String(a.to || "").toLowerCase(); if (!isFinite(v)) return E("value must be a number");
        if (TEMP[f] && TEMP[t]) return { status: 200, body: { op, value: v, from: f, to: t, result: +TEMP[t][1](TEMP[f][0](v)).toPrecision(12), dimension: "temperature" } };
        const dim = Object.keys(UNITS).find((k) => UNITS[k][f] !== undefined && UNITS[k][t] !== undefined); if (!dim) return E("unknown or incompatible units; supported: " + Object.entries(UNITS).map(([k, u]) => k + "(" + Object.keys(u).join(",") + ")").join("; ") + "; temperature(c,f,k)");
        return { status: 200, body: { op, value: v, from: f, to: t, result: +(v * UNITS[dim][f] / UNITS[dim][t]).toPrecision(12), dimension: dim } };
      }
      case "regex_match": {
        const pat = String(a.pattern ?? ""), flags = String(a.flags ?? "").replace(/[^imsuy]/g, ""), input = String(a.input ?? "");
        if (pat.length > 1000) return E("pattern too long (1000)"); if (input.length > 20000) return E("input too long for regex (20000)");
        let re; try { re = new RegExp(pat, flags + "g"); } catch (e) { return E("invalid regex: " + String(e.message).slice(0, 120)); }
        const matches = []; for (const m of input.matchAll(re)) { matches.push({ match: m[0], index: m.index, groups: m.slice(1), named: m.groups || null }); if (matches.length >= 1000 || m[0] === "" && matches.length > 100) break; }
        return { status: 200, body: { op, matched: matches.length > 0, count: matches.length, matches } };
      }
    }
  } catch (e) { return E(String(e.message || e).slice(0, 160)); }
}

const SOCIAL = [["x", /^(?:www\.)?(?:twitter|x)\.com$/], ["linkedin", /(?:^|\.)linkedin\.com$/], ["facebook", /(?:^|\.)facebook\.com$|^fb\.com$/], ["instagram", /(?:^|\.)instagram\.com$/], ["github", /^(?:www\.)?github\.com$/], ["youtube", /(?:^|\.)youtube\.com$|^youtu\.be$/], ["tiktok", /(?:^|\.)tiktok\.com$/], ["threads", /(?:^|\.)threads\.net$/], ["bluesky", /^bsky\.app$/], ["discord", /^(?:discord\.gg|discord\.com)$/], ["telegram", /^t\.me$/], ["pinterest", /(?:^|\.)pinterest\.[a-z.]+$/], ["mastodon", /^(?:mastodon\.social|fosstodon\.org|hachyderm\.io)$/]];
const SHARE = /\/(?:share|sharer|intent|hashtag|search|login|signup)(?:[/.?]|$)|[?&](?:url|u|text)=/i;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.)+[A-Za-z]{2,24}/g;
const BAD_EMAIL = /\.(?:png|jpe?g|gif|webp|svg|css|js)$|@(?:example\.(?:com|org)|sentry\.io|.*wixpress\.com|2x\.png)$|^(?:u00|x22)/i;
const ATTR = { "&#64;": "@", "&#x40;": "@", "&#46;": ".", "&amp;": "&" };
const unent = (s) => s.replace(/&#64;|&#x40;|&#46;|&amp;/gi, (m) => ATTR[m.toLowerCase()]);
export function extractContacts(html, base) {
  const emails = new Map(), phones = new Map(), social = new Map(); const h = unent(String(html).slice(0, 1_000_000));
  const addE = (e, src) => { e = e.trim().replace(/^mailto:/i, "").split("?")[0].toLowerCase(); try { e = decodeURIComponent(e); } catch {} if (/^[^@\s]+@[^@\s]+\.[a-z]{2,24}$/i.test(e) && !BAD_EMAIL.test(e) && emails.size < 50 && !emails.has(e)) emails.set(e, src); };
  const addP = (p, src) => { const raw = p.replace(/^tel:/i, "").trim(); try { p = decodeURIComponent(raw); } catch { p = raw; } const n = p.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, ""); if (n.replace("+", "").length >= 7 && n.replace("+", "").length <= 15 && phones.size < 30 && !phones.has(n)) phones.set(n, { display: p.trim().slice(0, 40), source: src }); };
  for (const m of h.matchAll(/href\s*=\s*["']\s*mailto:([^"'>]+)["']/gi)) addE(m[1], "mailto");
  for (const m of h.matchAll(/href\s*=\s*["']\s*tel:([^"'>]+)["']/gi)) addP(m[1], "tel");
  let org = null;
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const j = JSON.parse(m[1]); for (const x of [j, ...(j["@graph"] || [])].flat()) { if (!x || typeof x !== "object") continue; const pts = [x, ...[x.contactPoint || []].flat()];
    for (const c of pts) { if (typeof c?.email === "string") addE(c.email, "json-ld"); if (typeof c?.telephone === "string") addP(c.telephone, "json-ld"); }
    for (const s of [x.sameAs || []].flat()) if (typeof s === "string") addS(s, "json-ld");
    if (!org && /Organization|LocalBusiness|Corporation|Store|Restaurant/.test(String(x["@type"]))) org = { name: x.name || null, type: String(x["@type"]), url: x.url || null, address: typeof x.address === "string" ? x.address : x.address ? [x.address.streetAddress, x.address.addressLocality, x.address.addressRegion, x.address.postalCode, x.address.addressCountry?.name || x.address.addressCountry].filter((v) => typeof v === "string").join(", ") || null : null }; } } catch {} }
  function addS(u, src) { let x; try { x = new URL(u, base); } catch { return; } if (!/^https?:$/.test(x.protocol)) return; const hn = x.hostname.toLowerCase(); const k = SOCIAL.find(([, re]) => re.test(hn)); if (!k || SHARE.test(x.pathname + x.search) || x.pathname.replace(/\/+$/, "") === "") return; x.hash = ""; const href = x.href.replace(/\/$/, ""); if (!social.has(href) && social.size < 40) social.set(href, { platform: k[0], url: href, source: src }); }
  for (const m of h.matchAll(/href\s*=\s*["']([^"'>]+)["']/gi)) addS(m[1], "link");
  const text = h.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  for (const m of text.matchAll(EMAIL)) addE(m[0], "text");
  return { organization: org, emails: [...emails].map(([email, source]) => ({ email, source })), phones: [...phones].map(([e164ish, v]) => ({ number: e164ish, ...v })), social: [...social.values()] };
}
export async function contacts(target, opts = {}) {
  const o = await fetchPage(target, { ...opts, raw: true }); if (o.status !== 200) return o;
  const c = extractContacts(o.body._html, o.body.final_url);
  return { status: 200, body: { url: o.body.url, final_url: o.body.final_url, title: o.body.title, ...c, counts: { emails: c.emails.length, phones: c.phones.length, social: c.social.length }, scope: "page-public data only: mailto/tel links, JSON-LD Organization contactPoint/sameAs, visible emails, social profile links on this one page; no crawling, no enrichment", robots: o.body.robots, user_agent: o.body.user_agent, fetched_at: o.body.fetched_at } };
}

export const BATCH_MAX = 10, BATCH_SUBREQUESTS = 40; // Free plan cap is 50/invocation; 2 reserved for x402 verify+settle, rest headroom
export async function batch(b) {
  if (!b || !Array.isArray(b.urls) && !Array.isArray(b.items)) return { status: 400, body: { error: `body: {urls:[...], mode?: "fetch"|"contacts"|"both"} or {items:[{url, mode?}]}; max ${BATCH_MAX}` } };
  const def = ["fetch", "contacts", "both"].includes(b.mode) ? b.mode : "fetch";
  const items = (b.items || b.urls.map((url) => ({ url }))).map((x) => (typeof x === "string" ? { url: x } : x || {}));
  if (!items.length) return { status: 400, body: { error: "empty batch" } };
  if (items.length > BATCH_MAX) return { status: 400, body: { error: `max ${BATCH_MAX} items per batch`, got: items.length } };
  const robotsCache = new Map(), budget = { left: BATCH_SUBREQUESTS }, maxMd = Math.min(Math.max(parseInt(b.max_markdown_chars || "20000", 10) || 20000, 0), 100000);
  const results = [];
  for (const it of items) { // sequential: deterministic budget, shared robots.txt cache
    const mode = ["fetch", "contacts", "both"].includes(it.mode) ? it.mode : def;
    const o = await fetchPage(it.url, { robotsCache, budget, raw: mode !== "fetch" });
    if (o.status !== 200) { results.push({ url: it.url ?? null, mode, ok: false, status: o.status, ...o.body }); continue; }
    const { _html, ...page } = o.body, r = { url: it.url, mode, ok: true, status: 200 };
    if (mode !== "contacts") { r.fetch = { ...page, markdown: page.markdown.slice(0, maxMd), truncated: page.truncated || page.markdown.length > maxMd }; }
    if (mode !== "fetch") { const c = extractContacts(_html, page.final_url); r.contacts = { ...c, counts: { emails: c.emails.length, phones: c.phones.length, social: c.social.length } }; }
    if (mode === "contacts") Object.assign(r, { final_url: page.final_url, title: page.title });
    results.push(r);
  }
  return { status: 200, body: { count: results.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, subrequests_used: BATCH_SUBREQUESTS - budget.left, subrequest_budget: BATCH_SUBREQUESTS, max_items: BATCH_MAX, results, billed: "one x402 payment for the whole batch (charged only if the batch request returns 200)" } };
}
