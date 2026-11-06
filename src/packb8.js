// packb8 (builder B, 2026-11-02): holidays, wiki, arxiv, hnsearch. $0 upstream (Nager.Date, Wikipedia REST, arXiv API, HN Algolia).
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const UA = { "user-agent": "BeggarBot/1.0 (+https://beggar-bot-demand.beggarbot.workers.dev/llms.txt; beggarbot@mail.grokbot.com)" };
const get = (u, t = 10000, acc = "application/json") => fetch(u, { headers: { ...UA, accept: acc }, signal: AbortSignal.timeout(t) });

export async function holidays(a) {
  const cc = String(a.country || "GB").toUpperCase(); if (!/^[A-Z]{2}$/.test(cc)) return bad("country (ISO-2) required");
  const today = new Date().toISOString().slice(0, 10); const year = Number(a.year) || Number(today.slice(0, 4)); if (year < 1975 || year > 2100) return bad("year out of range");
  const r = await get(`https://date.nager.at/api/v3/PublicHolidays/${year}/${cc}`).catch(() => null);
  if (!r) return { status: 502, body: { error: "nager.date unavailable" } }; if (r.status === 404 || r.status === 204) return { status: 404, body: { error: "country not supported" } };
  const L = (await r.json().catch(() => [])).filter((h) => !a.region || !h.counties || h.counties.includes(`${cc}-${String(a.region).toUpperCase()}`));
  const date = a.date ? String(a.date).slice(0, 10) : today; const d = new Date(date + "T12:00:00Z"); const wd = d.getUTCDay();
  const isHol = L.filter((h) => h.date === date);
  let next = date, steps = 0; do { const x = new Date(next + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); next = x.toISOString().slice(0, 10); steps++; } while (steps < 30 && ([0, 6].includes(new Date(next + "T12:00:00Z").getUTCDay()) || L.some((h) => h.date === next && h.global !== false)));
  return ok({ country: cc, year, date, weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd], is_weekend: wd === 0 || wd === 6, is_holiday: isHol.length > 0, holiday_today: isHol.map((h) => h.name), is_business_day: !(wd === 0 || wd === 6) && !isHol.some((h) => h.global !== false), next_business_day: next, upcoming: L.filter((h) => h.date >= date).slice(0, 5).map((h) => ({ date: h.date, name: h.name, local_name: h.localName, nationwide: h.global !== false, regions: h.counties })), all: L.map((h) => ({ date: h.date, name: h.name, nationwide: h.global !== false })), source: "date.nager.at" });
}

export async function wiki(a) {
  const q = String(a.q ?? a.title ?? "").trim(); if (!q || q.length > 200) return bad("q (topic or title) required");
  const lang = /^[a-z]{2,3}$/.test(String(a.lang || "")) ? a.lang : "en";
  const s = await get(`https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=5&format=json&origin=*`).catch(() => null);
  const sj = s && s.ok ? await s.json().catch(() => null) : null; const hits = sj?.query?.search || [];
  if (!hits.length) return { status: 404, body: { error: "no wikipedia article found" } };
  const t = hits[0].title; const r = await get(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t.replace(/ /g, "_"))}`).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => ({})) : {};
  return ok({ query: q, title: j.title || t, description: j.description || null, summary: j.extract || hits[0].snippet.replace(/<[^>]+>/g, ""), url: j.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(t)}`, thumbnail: j.thumbnail?.source || null, coordinates: j.coordinates || null, last_edited: j.timestamp || null, type: j.type || null, other_results: hits.slice(1).map((h) => h.title), source: `${lang}.wikipedia.org`, license: "CC BY-SA 4.0" });
}

const tag = (x, n) => { const m = x.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)); return m ? m[1].replace(/\s+/g, " ").trim() : null; };
export async function arxiv(a) {
  const q = String(a.q ?? a.query ?? "").trim(); const id = a.id ? String(a.id).trim() : null; if (!q && !id) return bad("q (search) or id required");
  const n = Math.min(25, Math.max(1, Number(a.limit) || 10)); const sort = a.sort === "recent" ? "submittedDate" : "relevance";
  const u = id ? `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}` : `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(/:/.test(q) ? q : q.split(/\s+/).map((w) => "all:" + w).join(" AND "))}&start=0&max_results=${n}&sortBy=${sort}&sortOrder=descending`;
  const r = await get(u, 15000, "application/atom+xml").catch(() => null); if (!r || !r.ok) return { status: 502, body: { error: "arxiv unavailable" } };
  const x = await r.text(); const ents = x.split("<entry>").slice(1).map((e) => ({ id: (tag(e, "id") || "").replace("http://arxiv.org/abs/", ""), title: tag(e, "title"), authors: [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1]).slice(0, 10), published: tag(e, "published"), updated: tag(e, "updated"), summary: (tag(e, "summary") || "").slice(0, 1200), categories: [...e.matchAll(/<category term="([^"]+)"/g)].map((m) => m[1]), pdf: (e.match(/href="([^"]+)" rel="related" type="application\/pdf"/) || e.match(/title="pdf" href="([^"]+)"/) || [])[1] || null }));
  return ok({ query: q || null, id, count: ents.length, total: Number(tag(x, "opensearch:totalResults")) || null, papers: ents, source: "arxiv.org" });
}

export async function hnsearch(a) {
  const q = String(a.q ?? a.query ?? "").trim(); const days = Math.min(365, Math.max(1, Number(a.days) || 30)); const n = Math.min(50, Math.max(1, Number(a.limit) || 15));
  const since = Math.floor(Date.now() / 1000) - days * 86400; const typ = a.type === "comment" ? "comment" : a.type === "all" ? "" : "story";
  const base = q ? "search" : "search"; const tags = q ? typ : "front_page";
  const u = `https://hn.algolia.com/api/v1/${base}?${q ? "query=" + encodeURIComponent(q) + "&" : ""}${tags ? "tags=" + tags + "&" : ""}numericFilters=created_at_i>${since}&hitsPerPage=${n}`;
  const r = await get(u).catch(() => null); if (!r || !r.ok) return { status: 502, body: { error: "hn algolia unavailable" } };
  const j = await r.json(); const hits = (j.hits || []).map((h) => ({ title: h.title || h.story_title, url: h.url || h.story_url || null, hn_url: `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points ?? null, comments: h.num_comments ?? null, author: h.author, created: h.created_at, text: h.comment_text ? h.comment_text.replace(/<[^>]+>/g, "").slice(0, 400) : undefined }));
  return ok({ query: q || null, mode: q ? "search" : "front_page", window_days: days, total_matches: j.nbHits, total_points: hits.reduce((s, h) => s + (h.points || 0), 0), results: hits, source: "hn.algolia.com" });
}
