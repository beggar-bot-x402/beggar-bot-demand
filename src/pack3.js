// Day-3 SKUs: /v1/transform (pure compute), /v1/redirects (redirect chain + security headers), /v1/sitemap (robots.txt + sitemap discovery/parse).
import { fetchSafeUrl, robotsAllows, readCapped, UA } from "./fetchpage.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const MAX_IN = 500_000, MAX_ROWS = 10_000;

// ---------- transform ----------
export function parseCsv(text, delim = ",") {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"' && f === "") q = true;
    else if (c === delim) { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; if (rows.length > MAX_ROWS) break; }
    else f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
const cell = (v, d) => { if (v === null || v === undefined) return ""; const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /["\r\n]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const infer = (s) => s === "" ? null : s === "true" ? true : s === "false" ? false : /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s) ? Number(s) : s;
export function flatten(o, sep = ".", pre = "", out = {}) {
  if (o === null || typeof o !== "object" || (Array.isArray(o) ? !o.length : !Object.keys(o).length)) { if (pre) out[pre] = o; return out; }
  for (const [k, v] of Object.entries(o)) flatten(v, sep, pre ? pre + sep + k : k, out);
  return out;
}
export function unflatten(o, sep = ".") {
  const root = {};
  for (const [k, v] of Object.entries(o)) {
    const ks = k.split(sep); let cur = root;
    ks.forEach((p, i) => { if (["__proto__", "constructor", "prototype"].includes(p)) return; if (i === ks.length - 1) cur[p] = v; else { if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = /^\d+$/.test(ks[i + 1]) ? [] : {}; cur = cur[p]; } });
  }
  return root;
}
export function getPath(o, path) { let cur = o; for (const p of String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) { if (cur === null || typeof cur !== "object" || !Object.hasOwn(cur, p)) return undefined; cur = cur[p]; } return cur; }
const parseJ = (x) => typeof x === "string" ? JSON.parse(x) : x;
export async function transform(a) {
  const op = a.op, d = (a.delimiter || ",").slice(0, 1) === "\\" ? "\t" : (a.delimiter || ",").slice(0, 1);
  const inp = a.input; if (inp === undefined || inp === null) return bad("input required");
  if (typeof inp === "string" && inp.length > MAX_IN) return bad("input > 500000 chars");
  try {
    switch (op) {
      case "csv_to_json": { const rows = parseCsv(String(inp), d); const hdr = String(a.header ?? "true") !== "false"; const typed = String(a.infer_types ?? "true") !== "false";
        if (!hdr) return { status: 200, body: { op, rows: rows.length, data: rows.map((r) => typed ? r.map(infer) : r) } };
        const [h = [], ...rest] = rows; const keys = h.map((k, i) => k.trim() || "col" + (i + 1));
        return { status: 200, body: { op, columns: keys, rows: rest.length, data: rest.map((r) => Object.fromEntries(keys.map((k, i) => [k, typed ? infer(r[i] ?? "") : (r[i] ?? "")]))) } }; }
      case "json_to_csv": { let arr = parseJ(inp); if (!Array.isArray(arr)) arr = [arr]; if (arr.length > MAX_ROWS) return bad("max 10000 rows");
        const flat = arr.map((x) => x !== null && typeof x === "object" ? flatten(x) : { value: x }); const cols = a.columns ? String(a.columns).split(",").map((s) => s.trim()) : [...new Set(flat.flatMap(Object.keys))];
        const csv = [cols.map((c) => cell(c, d)).join(d), ...flat.map((r) => cols.map((c) => cell(r[c], d)).join(d))].join("\n");
        return { status: 200, body: { op, columns: cols, rows: flat.length, csv } }; }
      case "flatten": return { status: 200, body: { op, output: flatten(parseJ(inp), a.separator || ".") } };
      case "unflatten": { const o = parseJ(inp); if (!o || typeof o !== "object" || Array.isArray(o)) return bad("input must be a flat JSON object"); return { status: 200, body: { op, output: unflatten(o, a.separator || ".") } }; }
      case "pick": { const o = parseJ(inp); const paths = (Array.isArray(a.paths) ? a.paths : String(a.paths || "").split(",")).map((s) => String(s).trim()).filter(Boolean); if (!paths.length || paths.length > 100) return bad("paths: 1-100 dot paths, e.g. a.b[0].c");
        const one = (x) => Object.fromEntries(paths.map((p) => [p, getPath(x, p) ?? null]));
        return { status: 200, body: { op, output: Array.isArray(o) && String(a.each) === "true" ? o.map(one) : one(o) } }; }
      case "sort_dedupe": { let arr = parseJ(inp); if (!Array.isArray(arr)) return bad("input must be a JSON array"); const key = a.key, kf = (x) => JSON.stringify(key ? getPath(x, key) ?? null : x);
        if (String(a.dedupe ?? "true") !== "false") { const s = new Set(); arr = arr.filter((x) => { const k = kf(x); if (s.has(k)) return false; s.add(k); return true; }); }
        if (String(a.sort ?? "true") !== "false") { const v = (x) => key ? getPath(x, key) : x; arr = [...arr].sort((x, y) => { const p = v(x), q = v(y); return typeof p === "number" && typeof q === "number" ? p - q : String(p ?? "").localeCompare(String(q ?? "")); }); if (a.order === "desc") arr.reverse(); }
        return { status: 200, body: { op, count: arr.length, output: arr } }; }
      case "stats": { const arr = parseJ(inp); if (!Array.isArray(arr)) return bad("input must be a JSON array"); const nums = arr.map((x) => a.key ? getPath(x, a.key) : x).map(Number).filter(Number.isFinite).sort((x, y) => x - y); if (!nums.length) return bad("no numeric values");
        const n = nums.length, sum = nums.reduce((s, x) => s + x, 0), mean = sum / n, q = (p) => { const i = (n - 1) * p, lo = Math.floor(i); return nums[lo] + (nums[Math.ceil(i)] - nums[lo]) * (i - lo); };
        return { status: 200, body: { op, count: n, sum, mean, min: nums[0], max: nums[n - 1], median: q(0.5), p90: q(0.9), p99: q(0.99), stddev: Math.sqrt(nums.reduce((s, x) => s + (x - mean) ** 2, 0) / n) } }; }
      default: return bad("op must be csv_to_json | json_to_csv | flatten | unflatten | pick | sort_dedupe | stats");
    }
  } catch (e) { return bad("invalid JSON input: " + String(e.message).slice(0, 80)); }
}

// ---------- redirects + security headers ----------
const SEC = ["strict-transport-security", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy"];
export function gradeHeaders(h, https) {
  const g = (k) => h.get(k), issues = []; let score = 0;
  const hsts = g("strict-transport-security"); if (hsts) { const ma = +(/max-age=(\d+)/i.exec(hsts)?.[1] || 0); score += ma >= 15552000 ? 25 : 10; if (ma < 15552000) issues.push("hsts_max_age_below_180d"); } else if (https) issues.push("missing_hsts");
  const csp = g("content-security-policy"); if (csp) { score += /unsafe-inline|unsafe-eval/.test(csp) ? 15 : 25; if (/unsafe-inline|unsafe-eval/.test(csp)) issues.push("csp_allows_unsafe"); } else issues.push("missing_csp");
  if (g("x-frame-options") || /frame-ancestors/.test(csp || "")) score += 15; else issues.push("missing_clickjacking_protection");
  if ((g("x-content-type-options") || "").toLowerCase() === "nosniff") score += 15; else issues.push("missing_nosniff");
  if (g("referrer-policy")) score += 10; else issues.push("missing_referrer_policy");
  if (g("permissions-policy")) score += 10; else issues.push("missing_permissions_policy");
  if (g("server") && /\d/.test(g("server"))) issues.push("server_version_disclosed");
  if (g("x-powered-by")) issues.push("x_powered_by_disclosed");
  if (!https) { score = Math.min(score, 30); issues.push("not_https"); }
  return { score, grade: score >= 90 ? "A" : score >= 75 ? "B" : score >= 55 ? "C" : score >= 35 ? "D" : "F", issues, present: Object.fromEntries(SEC.map((k) => [k, g(k) || null])) };
}
export async function redirects(a) {
  const start = a.url && fetchSafeUrl(String(a.url)); if (!start) return bad("url must be public http(s) on default port (no private IPs, IPv6 literals or credentials)");
  const max = Math.min(Math.max(+a.max_hops || 10, 1), 10), signal = AbortSignal.timeout(8000), hops = []; let cur = start, r, loop = false;
  const seen = new Set();
  try {
    for (let i = 0; i <= max; i++) {
      if (seen.has(cur.href)) { loop = true; break; } seen.add(cur.href);
      const t0 = Date.now(); r = await fetch(cur.href, { method: "GET", redirect: "manual", signal, headers: { "user-agent": UA, accept: "*/*" } });
      try { r.body?.cancel(); } catch {}
      const loc = r.headers.get("location"), hop = { url: cur.href, status: r.status, ms: Date.now() - t0, location: loc || null, server: r.headers.get("server") || null };
      hops.push(hop);
      if (!(r.status >= 300 && r.status < 400 && loc)) break;
      const nx = fetchSafeUrl(new URL(loc, cur).href); if (!nx) { hop.blocked = "redirect_to_disallowed_target"; break; }
      if (cur.protocol === "https:" && nx.protocol === "http:") hop.downgrade = true;
      cur = nx; if (i === max) { hop.truncated = true; }
    }
  } catch (e) { return { status: 502, body: { error: e.name === "TimeoutError" ? "timeout" : "fetch_failed", url: start.href, hops } }; }
  const last = hops[hops.length - 1], fin = last && !(last.status >= 300 && last.status < 400);
  return { status: 200, body: { url: start.href, final_url: fin ? last.url : null, final_status: fin ? last.status : null, redirect_count: hops.length - 1, loop, https_downgrade: hops.some((h) => h.downgrade), http_to_https: start.protocol === "http:" && !!fin && last.url.startsWith("https:"), hops, security_headers: fin && r ? gradeHeaders(r.headers, last.url.startsWith("https:")) : null, user_agent: UA, checked_at: new Date().toISOString() } };
}

// ---------- robots.txt + sitemap ----------
export function parseRobots(txt) {
  const sitemaps = [], groups = []; let cur = null, lastUA = false, crawlDelay = {};
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(), i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "sitemap") { if (v) sitemaps.push(v); continue; }
    if (k === "user-agent") { if (!lastUA) groups.push(cur = { user_agents: [], allow: [], disallow: [] }); cur.user_agents.push(v); lastUA = true; continue; }
    lastUA = false; if (!cur) continue;
    if (k === "allow" && v) cur.allow.push(v); else if (k === "disallow" && v) cur.disallow.push(v); else if (k === "crawl-delay") cur.crawl_delay = +v || null;
  }
  return { sitemaps: [...new Set(sitemaps)], groups };
}
export function parseSitemap(xml) {
  const tag = (s, t) => { const m = new RegExp(`<(?:\\w+:)?${t}>\\s*(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?\\s*</(?:\\w+:)?${t}>`, "i").exec(s); return m ? m[1].trim().replace(/&amp;/g, "&") : null; };
  const isIndex = /<(?:\w+:)?sitemapindex[\s>]/i.test(xml), out = [];
  for (const m of xml.matchAll(isIndex ? /<(?:\w+:)?sitemap>([\s\S]*?)<\/(?:\w+:)?sitemap>/gi : /<(?:\w+:)?url>([\s\S]*?)<\/(?:\w+:)?url>/gi)) { const loc = tag(m[1], "loc"); if (loc) out.push({ loc, lastmod: tag(m[1], "lastmod"), ...(isIndex ? {} : { changefreq: tag(m[1], "changefreq"), priority: tag(m[1], "priority") }) }); }
  return { type: isIndex ? "sitemapindex" : "urlset", entries: out };
}
export async function sitemap(a) {
  const raw = String(a.url || a.host || ""); const base = fetchSafeUrl(/^https?:\/\//i.test(raw) ? raw : "https://" + raw);
  if (!base) return bad("url/host must be a public http(s) site (no private IPs, IPv6 literals or credentials)");
  const limit = Math.min(Math.max(+a.limit || 500, 1), 5000), ua = String(a.user_agent || "*").slice(0, 60), signal = AbortSignal.timeout(9000);
  let budget = 6; const get = async (u) => { if (budget-- <= 0) return null; const s = fetchSafeUrl(u); if (!s) return { blocked: true }; const r = await fetch(s.href, { signal, redirect: "follow", headers: { "user-agent": UA } }); if (r.url && r.url !== s.href && !fetchSafeUrl(r.url)) return { blocked: true }; return { status: r.status, ok: r.ok, text: r.ok ? (await readCapped(r)).text : (r.body?.cancel(), "") }; };
  let robotsTxt = "", robotsStatus = null;
  try { const r = await get(base.origin + "/robots.txt"); robotsStatus = r?.status ?? null; if (r?.ok) robotsTxt = r.text.slice(0, 200_000); } catch (e) { return { status: 502, body: { error: e.name === "TimeoutError" ? "timeout" : "fetch_failed", url: base.origin + "/robots.txt" } }; }
  const robots = parseRobots(robotsTxt), check = a.path || (base.pathname !== "/" ? base.pathname + base.search : null);
  const token = ua === "*" ? "*" : ua.toLowerCase();
  const pathCheck = check ? { path: check, user_agent: ua, allowed: robotsAllows(robotsTxt, check, token === "*" ? "\u0000" : token) } : null;
  const cands = robots.sitemaps.length ? robots.sitemaps.slice(0, 3) : [base.origin + "/sitemap.xml"];
  const sitemaps = [], urls = []; const queue = [...cands];
  while (queue.length && budget > 0 && urls.length < limit) {
    const u = queue.shift(); let r; try { r = await get(u); } catch { sitemaps.push({ url: u, error: "fetch_failed" }); continue; }
    if (!r) break; if (r.blocked) { sitemaps.push({ url: u, error: "disallowed_target" }); continue; }
    if (!r.ok) { sitemaps.push({ url: u, status: r.status, error: "upstream_status" }); continue; }
    if (/^\s*\x1f\x8b/.test(r.text) || u.endsWith(".gz")) { sitemaps.push({ url: u, error: "gzip_not_supported" }); continue; }
    const p = parseSitemap(r.text); sitemaps.push({ url: u, status: r.status, type: p.type, entries: p.entries.length });
    if (p.type === "sitemapindex") { for (const e of p.entries) queue.push(e.loc); sitemaps[sitemaps.length - 1].children = p.entries.slice(0, 200); }
    else for (const e of p.entries) { if (urls.length >= limit) break; urls.push(e); }
  }
  const lm = urls.map((u) => u.lastmod).filter(Boolean).sort();
  return { status: 200, body: { origin: base.origin, robots: { status: robotsStatus, found: !!robotsTxt, sitemaps: robots.sitemaps, groups: robots.groups.slice(0, 50) }, path_check: pathCheck, sitemaps, url_count: urls.length, truncated: urls.length >= limit, newest_lastmod: lm[lm.length - 1] || null, oldest_lastmod: lm[0] || null, urls, user_agent: UA, fetched_at: new Date().toISOString() } };
}
