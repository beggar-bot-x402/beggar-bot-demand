// /v1/fetch: public URL -> clean markdown + title + links + publish date. $0 outbound: one robots.txt GET + the page (≤4 redirect hops).
// Pure-JS streaming-free tokenizer (no deps, runs natively in Workers; no paid upstream, no keys).
export const UA = "BeggarBot-Fetch/1.0 (+https://beggar-bot-demand.beggarbot.workers.dev/llms.txt; x402 agent utility)";
const MAX_BYTES = 1_000_000, MAX_HOPS = 4, TIMEOUT_MS = 8000, MAX_MD = 100_000, MAX_LINKS = 200;

export function fetchSafeUrl(u) {
  let url; try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && !((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80"))) return null;
  const h = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!h || !h.includes(".") || /^(localhost|.*\.localhost|.*\.local|.*\.internal|.*\.home\.arpa|metadata\.google\.internal)$/.test(h)) return null;
  if (h.includes(":") || h.startsWith("[")) return null; // no IPv6 literals
  if (/^[\d.]+$/.test(h)) {
    const p = h.split(".").map(Number); if (p.length !== 4 || p.some((x) => !(x >= 0 && x <= 255))) return null;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0)) return null;
  }
  url.hash = ""; return url;
}

// Minimal robots.txt: groups for our UA token or *, longest-match Allow/Disallow.
export function robotsAllows(txt, path, token = "beggarbot") {
  const groups = []; let cur = null, lastUA = false;
  for (const raw of String(txt).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (!lastUA) groups.push(cur = { uas: [], rules: [] }); cur.uas.push(v.toLowerCase()); lastUA = true; }
    else { lastUA = false; if (cur && (k === "allow" || k === "disallow")) cur.rules.push({ allow: k === "allow", p: v }); }
  }
  const g = groups.filter((x) => x.uas.some((u) => u !== "*" && token.includes(u.replace(/[^a-z]/g, "")) && u.replace(/[^a-z]/g, "")));
  const rules = (g.length ? g : groups.filter((x) => x.uas.includes("*"))).flatMap((x) => x.rules);
  let best = null;
  for (const r of rules) {
    if (!r.p) continue;
    const re = new RegExp("^" + r.p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (re.test(path) && (!best || r.p.length > best.p.length || (r.p.length === best.p.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©" };
const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === "#" ? (() => { try { return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)); } catch { return m; } })() : ENT[e.toLowerCase()] ?? m);
const attrs = (s) => { const o = {}; for (const m of s.matchAll(/([\w:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) o[m[1].toLowerCase()] = dec(m[2] ?? m[3] ?? m[4] ?? ""); return o; };
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "iframe", "nav", "footer", "header", "aside", "form", "button", "select", "canvas", "head"]);
const BLOCK = new Set(["p", "div", "section", "article", "main", "blockquote", "ul", "ol", "table", "tr", "figure", "figcaption", "dl", "dd", "dt", "hr", "br", "pre"]);

export function extract(html, base) {
  const meta = {}; let title = "", inTitle = false, titleDone = false;
  const links = [], seen = new Set(); let out = "", skip = 0, pre = 0, href = null, list = [];
  const abs = (u) => { try { const x = new URL(u, base); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
  const push = (t) => { out += t; };
  // prefer <article> or <main> if present
  const scope = (html.match(/<article\b[\s\S]*<\/article>/i) || html.match(/<main\b[\s\S]*<\/main>/i) || [null])[0];
  const headPart = html.slice(0, 200_000);
  for (const m of headPart.matchAll(/<meta\b([^>]*)>/gi)) { const a = attrs(m[1]); const k = (a.property || a.name || a.itemprop || "").toLowerCase(); if (k && a.content && !meta[k]) meta[k] = a.content; }
  const tm = headPart.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i); if (tm) title = dec(tm[1]).replace(/\s+/g, " ").trim();
  let jsonld = null; for (const m of headPart.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const j = JSON.parse(m[1]); const arr = [j, ...(j["@graph"] || [])].flat(); jsonld = jsonld || arr.find((x) => x && x.datePublished); } catch {} }
  const timeTag = html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i);
  const body = scope || html;
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>|([^<]+)/g; let m;
  while ((m = re.exec(body))) {
    if (m[4] !== undefined) { if (skip) continue; let t = dec(m[4]); if (!pre) t = t.replace(/\s+/g, " "); push(t); continue; }
    if (!m[2]) continue;
    const close = !!m[1], tag = m[2].toLowerCase(), a = close ? {} : attrs(m[3]);
    if (SKIP.has(tag) && !(scope && (tag === "header" || tag === "footer"))) { if (/\/\s*$/.test(m[3])) continue; skip += close ? (skip ? -1 : 0) : 1; continue; }
    if (skip) continue;
    if (/^h[1-6]$/.test(tag)) { push(close ? "\n\n" : "\n\n" + "#".repeat(+tag[1]) + " "); continue; }
    if (tag === "li") { if (!close) push("\n" + "  ".repeat(Math.max(0, list.length - 1)) + (list.at(-1)?.t === "ol" ? `${++list.at(-1).n}. ` : "- ")); continue; }
    if (tag === "ul" || tag === "ol") { if (close) list.pop(); else list.push({ t: tag, n: 0 }); push("\n"); continue; }
    if (tag === "pre") { pre += close ? -1 : 1; push(close ? "\n```\n\n" : "\n\n```\n"); continue; }
    if (tag === "code" && !pre) { push("`"); continue; }
    if (tag === "strong" || tag === "b") { push("**"); continue; }
    if (tag === "em" || tag === "i") { push("_"); continue; }
    if (tag === "blockquote" && !close) { push("\n\n> "); continue; }
    if (tag === "td" || tag === "th") { if (close) push(" | "); continue; }
    if (tag === "img" && a.alt) { const s = abs(a.src || ""); push(s ? `![${a.alt}](${s})` : a.alt); continue; }
    if (tag === "a") {
      if (!close) { href = abs(a.href || ""); if (href) push("["); }
      else if (href) { push(`](${href})`); if (!seen.has(href) && links.length < MAX_LINKS) { seen.add(href); const txt = out.slice(out.lastIndexOf("[") + 1, out.lastIndexOf("](")).trim(); links.push({ text: txt.slice(0, 200), href }); } href = null; }
      continue;
    }
    if (BLOCK.has(tag)) push(tag === "br" ? "  \n" : tag === "hr" ? "\n\n---\n\n" : "\n\n");
  }
  let markdown = out.replace(/\[\s*\]\([^)]*\)/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+(?=[^-\d\s])/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  const truncated = markdown.length > MAX_MD; if (truncated) markdown = markdown.slice(0, MAX_MD);
  if (!title) title = meta["og:title"] || meta["twitter:title"] || (markdown.match(/^# (.+)$/m) || [])[1] || null;
  const published = meta["article:published_time"] || meta["og:published_time"] || meta["datepublished"] || meta["date"] || meta["dc.date"] || meta["parsely-pub-date"] || jsonld?.datePublished || timeTag?.[1] || null;
  return { title, description: meta["description"] || meta["og:description"] || null, published_at: published, author: meta["author"] || meta["article:author"] || null, site_name: meta["og:site_name"] || null, lang: (html.match(/<html\b[^>]*\blang=["']?([\w-]+)/i) || [])[1] || null, markdown, links, truncated };
}

export async function readCapped(r) {
  if (!r.body) return { text: "", bytes: 0, capped: false };
  const reader = r.body.getReader(), chunks = []; let n = 0, capped = false;
  for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.byteLength; if (n > MAX_BYTES) { chunks.push(value.slice(0, value.byteLength - (n - MAX_BYTES))); capped = true; try { await reader.cancel(); } catch {} break; } chunks.push(value); }
  const buf = new Uint8Array(Math.min(n, MAX_BYTES)); let o = 0; for (const c of chunks) { buf.set(c, o); o += c.byteLength; }
  return { text: new TextDecoder("utf-8", { fatal: false }).decode(buf), bytes: buf.byteLength, capped };
}

export async function fetchPage(input, opts = {}) {
  const url = input && fetchSafeUrl(String(input));
  if (!url) return { status: 400, body: { error: "url must be public http(s) on default port (no private/loopback/link-local/metadata IPs, no IPv6 literals, no credentials)" } };
  const signal = AbortSignal.timeout(TIMEOUT_MS), H = { "user-agent": UA, accept: "text/html,application/xhtml+xml,text/plain;q=0.8,text/markdown;q=0.9" };
  const robotsCache = opts.robotsCache || new Map(), budget = opts.budget || { left: Infinity };
  const sub = (u, init) => { if (budget.left <= 0) { const e = new Error("budget"); e.name = "BudgetError"; throw e; } budget.left--; return fetch(u, init); };
  const allowed = async (u) => {
    if (opts.ignoreRobots) return true;
    if (!robotsCache.has(u.origin)) {
      let txt = "";
      try { const r = await sub(u.origin + "/robots.txt", { signal, redirect: "follow", headers: { "user-agent": UA } }); if (r.ok) txt = (await readCapped(r)).text.slice(0, 200_000); else if (r.status === 401 || r.status === 403) txt = ""; } catch (e) { if (e.name === "BudgetError") throw e; }
      robotsCache.set(u.origin, txt);
    }
    return robotsAllows(robotsCache.get(u.origin), u.pathname + u.search);
  };
  let cur = url, r, hops = 0;
  try {
    for (;;) {
      if (!(await allowed(cur))) return { status: 403, body: { error: "blocked_by_robots_txt", url: cur.href, user_agent: UA } };
      r = await sub(cur.href, { signal, redirect: "manual", headers: H });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        if (++hops > MAX_HOPS) return { status: 502, body: { error: "too_many_redirects", url: url.href } };
        const nx = fetchSafeUrl(new URL(r.headers.get("location"), cur).href); if (!nx) return { status: 502, body: { error: "redirect_to_disallowed_target", url: url.href } };
        cur = nx; continue;
      }
      break;
    }
  } catch (e) { return { status: 502, body: { error: e.name === "BudgetError" ? "subrequest_budget_exhausted" : e.name === "TimeoutError" ? "timeout" : "fetch_failed", url: url.href } }; }
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (!r.ok) return { status: 502, body: { error: "upstream_status", upstream_status: r.status, url: cur.href } };
  if (ct && !/text\/html|application\/xhtml|text\/plain|text\/markdown/.test(ct)) return { status: 415, body: { error: "unsupported_content_type", content_type: ct, url: cur.href } };
  let got; try { got = await readCapped(r); } catch (e) { return { status: 502, body: { error: e.name === "TimeoutError" ? "timeout" : "read_failed", url: cur.href } }; }
  const isHtml = !ct || /html/.test(ct) || /^\s*<(!doctype|html)/i.test(got.text);
  const ex = isHtml ? extract(got.text, cur.href) : { title: null, description: null, published_at: null, author: null, site_name: null, lang: null, markdown: got.text.slice(0, MAX_MD), links: [], truncated: got.text.length > MAX_MD };
  const last = r.headers.get("last-modified");
  return { status: 200, body: { url: url.href, final_url: cur.href, status: r.status, content_type: ct || null, ...ex, published_at: ex.published_at || null, last_modified: last || null, word_count: (ex.markdown.match(/\S+/g) || []).length, bytes: got.bytes, truncated: ex.truncated || got.capped, redirects: hops, robots: opts.ignoreRobots ? "skipped" : "allowed", ...(opts.raw ? { _html: isHtml ? got.text : "" } : {}), user_agent: UA, fetched_at: new Date().toISOString() } };
}
