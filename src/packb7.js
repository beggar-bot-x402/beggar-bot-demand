// packb7 (builder B, 2026-11-02): coinsearch, pricehistory, osvcheck, pkginfo. $0 upstream (CoinGecko public, OSV.dev, npm/PyPI registries).
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const H = { accept: "application/json", "user-agent": "BeggarBot/1.0" };
const gj = async (u, t = 10000, init = {}) => { const r = await fetch(u, { headers: { ...H, ...(init.headers || {}) }, method: init.method || "GET", body: init.body, signal: AbortSignal.timeout(t) }); return { status: r.status, j: await r.json().catch(() => null) }; };

export async function coinsearch(a) {
  const q = String(a.q ?? a.query ?? a.symbol ?? "").trim(); if (!q || q.length > 60) return bad("q (coin name or symbol) required");
  const r = await gj(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`).catch(() => null); if (!r || !r.j) return { status: 502, body: { error: "coingecko unavailable" } };
  const coins = (r.j.coins || []).slice(0, 10); const top = coins[0];
  let platforms = null; if (top && a.details !== "false") { const d = await gj(`https://api.coingecko.com/api/v3/coins/${top.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`).catch(() => null);
    if (d && d.j && d.j.id) platforms = { id: d.j.id, contracts: d.j.platforms || {}, price_usd: d.j.market_data?.current_price?.usd ?? null, market_cap_usd: d.j.market_data?.market_cap?.usd ?? null, homepage: d.j.links?.homepage?.[0] || null, categories: (d.j.categories || []).slice(0, 6) }; }
  const exact = coins.filter((c) => c.symbol.toLowerCase() === q.toLowerCase());
  return ok({ query: q, best: top ? { id: top.id, symbol: top.symbol, name: top.name, rank: top.market_cap_rank } : null, details: platforms, matches: coins.map((c) => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank })), same_symbol_count: exact.length, warning: exact.length > 1 ? "multiple coins share this symbol; use contract address" : null, source: "coingecko" });
}

export async function pricehistory(a) {
  const id = String(a.id ?? a.coin ?? "ethereum").toLowerCase().trim(); if (!/^[a-z0-9-]{1,80}$/.test(id)) return bad("id (coingecko id) invalid");
  const days = Math.min(365, Math.max(1, Number(a.days) || 30));
  const r = await gj(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`).catch(() => null);
  if (!r) return { status: 502, body: { error: "coingecko unavailable" } }; if (r.status === 404) return { status: 404, body: { error: "unknown coin id (try /v1/coinsearch)" } }; if (!r.j || !r.j.prices) return { status: 502, body: { error: "coingecko http " + r.status } };
  const P = r.j.prices.map((x) => x[1]); if (P.length < 2) return { status: 502, body: { error: "no data" } };
  let peak = P[0], mdd = 0; for (const p of P) { peak = Math.max(peak, p); mdd = Math.min(mdd, p / peak - 1); }
  const rets = P.slice(1).map((p, i) => Math.log(p / P[i])); const mean = rets.reduce((s, x) => s + x, 0) / rets.length; const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / rets.length);
  const stepH = (r.j.prices[r.j.prices.length - 1][0] - r.j.prices[0][0]) / 3.6e6 / (P.length - 1); const ann = sd * Math.sqrt((365 * 24) / stepH);
  const n = 30, step = Math.max(1, Math.floor(P.length / n));
  return ok({ id, days, start_usd: P[0], end_usd: P[P.length - 1], change_pct: +((P[P.length - 1] / P[0] - 1) * 100).toFixed(2), high_usd: Math.max(...P), low_usd: Math.min(...P), max_drawdown_pct: +(mdd * 100).toFixed(2), volatility_annualized_pct: +(ann * 100).toFixed(1), sma_usd: +(P.reduce((s, x) => s + x, 0) / P.length).toFixed(6), points: r.j.prices.filter((_, i) => i % step === 0).map(([t, p]) => [new Date(t).toISOString(), +p.toPrecision(8)]), source: "coingecko" });
}

const ECO = { npm: "npm", pypi: "PyPI", pip: "PyPI", python: "PyPI", go: "Go", cargo: "crates.io", crates: "crates.io", rust: "crates.io", maven: "Maven", rubygems: "RubyGems", gem: "RubyGems", nuget: "NuGet", packagist: "Packagist", composer: "Packagist" };
export async function osvcheck(a) {
  let pk = a.packages; if (typeof pk === "string") { try { pk = JSON.parse(pk); } catch { pk = pk.split(/[\s,]+/).filter(Boolean).map((s) => { const m = s.match(/^(.+)@([^@]+)$/); return m ? { name: m[1], version: m[2] } : { name: s }; }); } }
  if (!pk && a.name) pk = [{ name: a.name, version: a.version }]; if (!Array.isArray(pk) || !pk.length) return bad("packages (name@version list) or name+version required"); if (pk.length > 50) return bad("max 50 packages");
  const eco = ECO[String(a.ecosystem || "npm").toLowerCase()]; if (!eco) return bad("ecosystem: npm|pypi|go|cargo|maven|rubygems|nuget|packagist");
  const queries = pk.map((p) => ({ package: { name: String(p.name), ecosystem: ECO[String(p.ecosystem || "").toLowerCase()] || eco }, ...(p.version ? { version: String(p.version) } : {}) }));
  const r = await gj("https://api.osv.dev/v1/querybatch", 15000, { method: "POST", body: JSON.stringify({ queries }), headers: { "content-type": "application/json" } }).catch(() => null);
  if (!r || !r.j || !r.j.results) return { status: 502, body: { error: "osv.dev unavailable" } };
  const ids = [...new Set(r.j.results.flatMap((x) => (x.vulns || []).map((v) => v.id)))].slice(0, 25);
  const det = Object.fromEntries((await Promise.all(ids.map((id) => gj(`https://api.osv.dev/v1/vulns/${id}`, 8000).catch(() => null)))).filter((x) => x && x.j).map((x) => [x.j.id, x.j]));
  const sev = (v) => v?.database_specific?.severity || (v?.severity?.[0]?.score) || null;
  const out = queries.map((q, i) => { const vs = (r.j.results[i].vulns || []).map((v) => ({ id: v.id, summary: det[v.id]?.summary || null, severity: sev(det[v.id]), aliases: det[v.id]?.aliases || [], fixed: (det[v.id]?.affected || []).flatMap((af) => (af.ranges || []).flatMap((rg) => rg.events.filter((e) => e.fixed).map((e) => e.fixed))).slice(0, 3) }));
    return { name: q.package.name, ecosystem: q.package.ecosystem, version: q.version || null, vulnerable: vs.length > 0, vuln_count: vs.length, vulns: vs.slice(0, 15) }; });
  return ok({ checked: out.length, vulnerable_packages: out.filter((x) => x.vulnerable).length, results: out, source: "osv.dev" });
}

export async function pkginfo(a) {
  const name = String(a.name || a.package || "").trim(); if (!name || name.length > 214 || /\s/.test(name)) return bad("name (package) required");
  const eco = String(a.ecosystem || "npm").toLowerCase();
  if (eco === "npm") {
    const [m, d] = await Promise.all([gj(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, 12000, { headers: { accept: "application/vnd.npm.install-v1+json; q=1.0, application/json" } }).catch(() => null), gj(`https://api.npmjs.org/downloads/point/last-week/${name}`).catch(() => null)]);
    if (!m) return { status: 502, body: { error: "npm unavailable" } }; if (m.status === 404) return { status: 404, body: { error: "package not found", typosquat_hint: "check spelling" } };
    const j = m.j || {}; const latest = j["dist-tags"]?.latest; const lv = latest ? await gj(`https://registry.npmjs.org/${name.replace("/", "%2f")}/${latest}`).catch(() => null) : null; const v = (lv && lv.j) || j.versions?.[latest] || {};
    const times = j.time || {}; const created = times.created || null, mod = times.modified || j.modified;
    const ageD = created ? Math.floor((Date.now() - Date.parse(created)) / 864e5) : null;
    if (!v.maintainers && v._npmUser) v.maintainers = [v._npmUser];
    const flags = [ageD != null && ageD < 30 && "new_package_under_30d", (d?.j?.downloads ?? 0) < 100 && "low_downloads", v.scripts && (v.scripts.preinstall || v.scripts.postinstall || v.scripts.install) && "has_install_scripts", v.deprecated && "deprecated"].filter(Boolean);
    return ok({ ecosystem: "npm", name, latest, description: j.description || v.description || null, license: v.license || j.license || null, created, modified: mod, age_days: ageD, versions: Object.keys(j.versions || {}).length, weekly_downloads: d?.j?.downloads ?? null, repository: (v.repository && (v.repository.url || v.repository)) || null, maintainers: (j.maintainers || v.maintainers || []).map((x) => x.name).slice(0, 10), dependencies: Object.keys(v.dependencies || {}).length, install_scripts: v.scripts ? Object.keys(v.scripts).filter((k) => /install/.test(k)) : [], deprecated: v.deprecated || null, risk_flags: flags, source: "registry.npmjs.org" });
  }
  if (["pypi", "pip", "python"].includes(eco)) {
    const m = await gj(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`).catch(() => null); if (!m) return { status: 502, body: { error: "pypi unavailable" } }; if (m.status === 404) return { status: 404, body: { error: "package not found" } };
    const i = m.j.info || {}; const rel = m.j.releases || {}; const dates = Object.values(rel).flat().map((f) => f.upload_time_iso_8601).filter(Boolean).sort();
    const ageD = dates[0] ? Math.floor((Date.now() - Date.parse(dates[0])) / 864e5) : null;
    return ok({ ecosystem: "pypi", name: i.name, latest: i.version, description: i.summary, license: i.license_expression || i.license || null, created: dates[0] || null, last_release: dates[dates.length - 1] || null, age_days: ageD, versions: Object.keys(rel).length, requires_python: i.requires_python, homepage: i.home_page || i.project_urls?.Homepage || null, repository: i.project_urls?.Source || i.project_urls?.Repository || null, author: i.author || i.maintainer || null, dependencies: (i.requires_dist || []).length, yanked: !!m.j.urls?.[0]?.yanked, risk_flags: [ageD != null && ageD < 30 && "new_package_under_30d", Object.keys(rel).length < 2 && "single_release"].filter(Boolean), source: "pypi.org" });
  }
  return bad("ecosystem: npm|pypi");
}
