// Pack 9 (2026-11-02 wave 3): /v1/lstrate, /v1/lendrates, /v1/ghrepo, /v1/restaking. Keyless: public RPC, DefiLlama, GitHub public API. $0, fails soft.
import { keccakHex } from "./evm.js";
import { rpcBatch } from "./walletintel.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const call = (to, data) => ["eth_call", [{ to, data }, "latest"]];
const E18 = (10n ** 18n).toString(16).padStart(64, "0");
const r6 = (x) => (x == null || !isFinite(x) ? null : Number(Number(x).toPrecision(6)));
async function getJ(url, ms = 9000, h = {}) { const r = await fetch(url, { headers: { accept: "application/json", "user-agent": "beggar-bot/1.0", ...h }, signal: AbortSignal.timeout(ms), cf: { cacheTtl: 300, cacheEverything: true } }); if (!r.ok) throw new Error("upstream http " + r.status); return r.json(); }

// ---- /v1/lstrate ---- on-chain LST/LRT exchange rates (Ethereum mainnet)
const LST = {
  wstETH: { to: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0", data: sel("stEthPerToken()"), unit: "stETH per wstETH" },
  rETH: { to: "0xae78736Cd615f374D3085123A210448E74Fc6393", data: sel("getExchangeRate()"), unit: "ETH per rETH" },
  cbETH: { to: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704", data: sel("exchangeRate()"), unit: "ETH per cbETH" },
  sfrxETH: { to: "0xac3E018457B222d93114458476f3E3416Abbe38F", data: sel("convertToAssets(uint256)") + E18, unit: "frxETH per sfrxETH" },
  weETH: { to: "0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee", data: sel("getRate()"), unit: "eETH per weETH" },
  sDAI: { to: "0x83F20F44975D03b1b09e64809B757c47f942BEeA", data: sel("convertToAssets(uint256)") + E18, unit: "DAI per sDAI" },
  sUSDe: { to: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497", data: sel("convertToAssets(uint256)") + E18, unit: "USDe per sUSDe" },
  sUSDS: { to: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD", data: sel("convertToAssets(uint256)") + E18, unit: "USDS per sUSDS" },
};
export async function lstrate(a) {
  const want = String(a.tokens ?? Object.keys(LST).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const keys = want.map((w) => Object.keys(LST).find((k) => k.toLowerCase() === w.toLowerCase()));
  if (!keys.length || keys.some((k) => !k)) return bad("tokens: comma list of " + Object.keys(LST).join(", "));
  let r, rpc; try { ({ results: r, rpc } = await rpcBatch("ethereum", keys.map((k) => call(LST[k].to, LST[k].data)))); } catch (e) { return { status: 502, body: { error: "public rpc unavailable: " + (e.message || e) } }; }
  const rates = keys.map((k, i) => ({ token: k, contract: LST[k].to, rate: r[i] && r[i] !== "0x" ? r6(Number(big(r[i])) / 1e18) : null, unit: LST[k].unit }));
  return { status: 200, body: { chain: "ethereum", rpc, block_tag: "latest", rates, note: "Protocol redemption/exchange rate read on-chain (not market price). Compare with /v1/dexquote for discount/premium." } };
}

// ---- /v1/lendrates ---- supply/borrow APY snapshot (DefiLlama yields, keyless)
export async function lendrates(a) {
  const sym = String(a.symbol ?? "USDC").trim().toUpperCase(); if (!/^[A-Z0-9.\-]{1,15}$/.test(sym)) return bad("symbol: token symbol e.g. USDC, WETH");
  const chain = a.chain ? String(a.chain).trim().toLowerCase() : null; const proj = a.project ? String(a.project).trim().toLowerCase() : null;
  const minTvl = Number(a.min_tvl ?? 1e6), limit = Math.min(Math.max(Number(a.limit ?? 15) || 15, 1), 50);
  let pools, lb; try { [pools, lb] = await Promise.all([getJ("https://yields.llama.fi/pools", 12000), getJ("https://yields.llama.fi/lendBorrow", 12000)]); } catch (e) { return { status: 502, body: { error: "defillama unavailable: " + (e.message || e) } }; }
  const LB = new Map((Array.isArray(lb) ? lb : []).map((x) => [x.pool, x]));
  const rows = (pools.data || []).filter((p) => LB.has(p.pool) && String(p.symbol).toUpperCase().split("-").includes(sym) && (!chain || p.chain.toLowerCase() === chain) && (!proj || p.project.toLowerCase().includes(proj)) && (p.tvlUsd || 0) >= minTvl)
    .map((p) => { const b = LB.get(p.pool); const util = b.totalSupplyUsd ? b.totalBorrowUsd / b.totalSupplyUsd : null; return { project: p.project, chain: p.chain, symbol: p.symbol, pool: p.pool, supply_apy: r6(p.apy), supply_apy_base: r6(p.apyBase), borrow_apy_base: r6(b.apyBaseBorrow), borrow_apy_reward: r6(b.apyRewardBorrow), net_borrow_apy: r6((b.apyBaseBorrow || 0) - (b.apyRewardBorrow || 0)), total_supply_usd: Math.round(b.totalSupplyUsd || 0), total_borrow_usd: Math.round(b.totalBorrowUsd || 0), utilization: r6(util), ltv: b.ltv ?? null, borrowable: b.borrowable ?? null, flags: [...(util > 0.9 ? ["high_utilization_withdraw_risk"] : [])] }; })
    .sort((x, y) => (x.net_borrow_apy ?? 99) - (y.net_borrow_apy ?? 99)).slice(0, limit);
  return { status: 200, body: { symbol: sym, chain, project: proj, count: rows.length, cheapest_borrow: rows[0] || null, best_supply: [...rows].sort((x, y) => (y.supply_apy ?? 0) - (x.supply_apy ?? 0))[0] || null, markets: rows, source: "DefiLlama yields (keyless)" } };
}

// ---- /v1/ghrepo ---- public GitHub repo health + latest release/tag
export async function ghrepo(a) {
  let rp = String(a.repo ?? "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(rp)) return bad("repo: owner/name or github.com URL");
  const B = "https://api.github.com/repos/" + rp, H = { accept: "application/vnd.github+json" };
  let repo; try { repo = await getJ(B, 8000, H); } catch (e) { return { status: /404/.test(e.message) ? 404 : 502, body: { error: String(e.message), repo: rp } }; }
  const [rel, tags, commits] = await Promise.all([getJ(B + "/releases?per_page=3", 8000, H).catch(() => []), getJ(B + "/tags?per_page=3", 8000, H).catch(() => []), getJ(B + "/commits?per_page=1", 8000, H).catch(() => [])]);
  const now = Date.now(), days = (t) => (t ? Math.round((now - Date.parse(t)) / 864e5) : null);
  const last = commits[0] && commits[0].commit ? commits[0].commit.committer.date : repo.pushed_at;
  const flags = []; if (repo.archived) flags.push("archived"); if (days(last) > 365) flags.push("inactive_gt_1y"); if (repo.fork) flags.push("is_fork"); if (!repo.license) flags.push("no_license");
  return { status: 200, body: { repo: repo.full_name, url: repo.html_url, description: repo.description, stars: repo.stargazers_count, forks: repo.forks_count, open_issues: repo.open_issues_count, language: repo.language, license: repo.license && repo.license.spdx_id, default_branch: repo.default_branch, created_at: repo.created_at, pushed_at: repo.pushed_at, last_commit_at: last, days_since_commit: days(last),
    latest_release: rel[0] ? { tag: rel[0].tag_name, name: rel[0].name, published_at: rel[0].published_at, prerelease: rel[0].prerelease, url: rel[0].html_url, days_ago: days(rel[0].published_at) } : null, recent_releases: rel.slice(0, 3).map((x) => x.tag_name), latest_tags: tags.slice(0, 3).map((t) => t.name), flags, source: "GitHub public API (unauthenticated)" } };
}

// ---- /v1/restaking ---- restaking / LRT TVL leaderboard (DefiLlama keyless)
export async function restaking(a) {
  const cats = String(a.category ?? "Restaking,Liquid Restaking").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const limit = Math.min(Math.max(Number(a.limit ?? 15) || 15, 1), 50);
  let p; try { p = await getJ("https://api.llama.fi/protocols", 15000); } catch (e) { return { status: 502, body: { error: "defillama unavailable: " + (e.message || e) } }; }
  const rows = p.filter((x) => cats.includes(String(x.category).toLowerCase())).sort((x, y) => (y.tvl || 0) - (x.tvl || 0));
  const total = rows.reduce((s, x) => s + (x.tvl || 0), 0);
  return { status: 200, body: { categories: cats, protocols: rows.length, total_tvl_usd: Math.round(total), top: rows.slice(0, limit).map((x) => ({ name: x.name, slug: x.slug, category: x.category, tvl_usd: Math.round(x.tvl || 0), share_pct: total ? r6((100 * (x.tvl || 0)) / total) : null, change_1d_pct: r6(x.change_1d), change_7d_pct: r6(x.change_7d), chains: (x.chains || []).slice(0, 6), token: x.symbol && x.symbol !== "-" ? x.symbol : null })), source: "DefiLlama /protocols (keyless)" } };
}
