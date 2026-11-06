// Pack 10 (2026-11-02 wave 3b): /v1/spltoken, /v1/aavehealth, /v1/morphomarkets, /v1/tokensafety. Keyless: Solana public RPC, Jupiter lite token API, public EVM RPC, Morpho public GraphQL, DefiLlama coins. $0, fails soft.
import { keccakHex, checksum } from "./evm.js";
import { rpcBatch } from "./walletintel.js";
import { contractrisk } from "./pack6.js";
import { tokeninfo } from "./onchain.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const sel = (s) => keccakHex(s).slice(0, 10);
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const r6 = (x) => (x == null || !isFinite(x) ? null : Number(Number(x).toPrecision(6)));
const CH = { base: "base", "8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", optimism: "optimism", op: "optimism", "10": "optimism", arbitrum: "arbitrum", arb: "arbitrum", "42161": "arbitrum", polygon: "polygon", "137": "polygon" };
const chainOf = (c) => CH[String(c ?? "base").trim().toLowerCase()] || null;
const CID = { base: 8453, ethereum: 1, optimism: 10, arbitrum: 42161, polygon: 137 };
async function getJ(url, ms = 9000, init = {}) { const r = await fetch(url, { ...init, headers: { accept: "application/json", "user-agent": "beggar-bot/1.0", ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error("upstream http " + r.status); return r.json(); }

// ---- /v1/spltoken ----
const SOL_RPC = ["https://solana-rpc.publicnode.com", "https://api.mainnet-beta.solana.com"];
async function solRpc(method, params) { let last; for (const u of SOL_RPC) { try { const j = await getJ(u, 8000, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); if (j.error) throw new Error(j.error.message); return j.result; } catch (e) { last = e; } } throw last; }
export async function spltoken(a) {
  const mint = String(a.mint ?? a.address ?? "").trim(); if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return bad("mint: base58 Solana SPL mint address");
  let acct; try { acct = await solRpc("getAccountInfo", [mint, { encoding: "jsonParsed" }]); } catch (e) { return { status: 502, body: { error: "solana rpc unavailable: " + (e.message || e) } }; }
  const v = acct && acct.value; if (!v) return { status: 404, body: { error: "account not found", mint } };
  const p = v.data && v.data.parsed; if (!p || p.type !== "mint") return { status: 422, body: { error: "not an SPL mint", owner_program: v.owner } };
  const i = p.info; const ext = (i.extensions || []).map((e) => e.extension);
  let meta = null; try { const j = await getJ("https://lite-api.jup.ag/tokens/v2/search?query=" + mint, 6000); meta = (Array.isArray(j) ? j : []).find((x) => x.id === mint) || null; } catch {}
  let top = null; if (a.holders !== "false") try { const l = await solRpc("getTokenLargestAccounts", [mint]); const sup = Number(i.supply) || 0; top = (l.value || []).slice(0, 10).map((x) => ({ account: x.address, amount: x.uiAmountString, pct: sup ? r6((100 * Number(x.amount)) / sup) : null })); } catch {}
  const flags = []; if (i.mintAuthority) flags.push("mint_authority_active"); if (i.freezeAuthority) flags.push("freeze_authority_active");
  for (const e of ["transferFeeConfig", "permanentDelegate", "transferHook", "nonTransferable", "defaultAccountState", "pausableConfig"]) if (ext.includes(e)) flags.push("token2022_" + e);
  const top10 = top ? top.reduce((s, x) => s + (x.pct || 0), 0) : null; if (top10 > 80) flags.push("top10_accounts_hold_gt_80pct");
  return { status: 200, body: { mint, program: v.owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" ? "token-2022" : "spl-token", name: meta && meta.name, symbol: meta && meta.symbol, decimals: i.decimals, supply: (Number(i.supply) / 10 ** i.decimals).toString(), supply_raw: i.supply, mint_authority: i.mintAuthority, freeze_authority: i.freezeAuthority, is_initialized: i.isInitialized, extensions: ext,
    price_usd: meta ? r6(meta.usdPrice) : null, market_cap_usd: meta && meta.mcap ? Math.round(meta.mcap) : null, holders_count: meta ? meta.holderCount ?? null : null, verified: meta ? !!meta.isVerified : null, organic_score: meta ? r6(meta.organicScore) : null, top_accounts: top, top10_pct: r6(top10), flags, risk: flags.length >= 2 ? "elevated" : flags.length ? "caution" : "low", sources: ["solana public RPC", "Jupiter lite token API"] } };
}

// ---- /v1/aavehealth ----
const AAVE = { base: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", ethereum: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2", optimism: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", arbitrum: "0x794a61358D6845594F94dc1DB02A252b5b4814aD", polygon: "0x794a61358D6845594F94dc1DB02A252b5b4814aD" };
export async function aavehealth(a) {
  const ch = chainOf(a.chain); if (!ch) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  const addrs = String(a.addresses ?? a.address ?? "").split(",").map((s) => s.trim()).filter(Boolean); if (!addrs.length || addrs.length > 20 || !addrs.every(isA)) return bad("addresses: 1–20 0x addresses");
  let r, rpc; try { ({ results: r, rpc } = await rpcBatch(ch, addrs.map((x) => ["eth_call", [{ to: AAVE[ch], data: sel("getUserAccountData(address)") + x.slice(2).toLowerCase().padStart(64, "0") }, "latest"]]))); } catch (e) { return { status: 502, body: { error: "public rpc unavailable: " + (e.message || e) } }; }
  const w = (h, i) => big("0x" + h.slice(2 + 64 * i, 66 + 64 * i));
  const out = addrs.map((x, k) => { const h = r[k]; if (!h || h.length < 2 + 64 * 6) return { address: checksum(x), error: "call failed" };
    const col = Number(w(h, 0)) / 1e8, debt = Number(w(h, 1)) / 1e8, avail = Number(w(h, 2)) / 1e8, liq = Number(w(h, 3)) / 1e4, ltv = Number(w(h, 4)) / 1e4, hfRaw = w(h, 5);
    const hf = debt === 0 ? null : Number(hfRaw) / 1e18;
    const status = debt === 0 ? (col ? "no_debt" : "no_position") : hf < 1 ? "liquidatable" : hf < 1.1 ? "danger" : hf < 1.5 ? "warning" : "healthy";
    return { address: checksum(x), collateral_usd: r6(col), debt_usd: r6(debt), available_borrow_usd: r6(avail), liquidation_threshold: liq, ltv, health_factor: hf == null ? null : r6(hf), status, collateral_drop_to_liquidation_pct: hf && hf > 1 ? r6(100 * (1 - 1 / hf)) : hf ? 0 : null }; });
  return { status: 200, body: { chain: ch, rpc, pool: AAVE[ch], protocol: "aave-v3", count: out.length, at_risk: out.filter((x) => ["liquidatable", "danger", "warning"].includes(x.status)).length, results: out } };
}

// ---- /v1/morphomarkets ----
export async function morphomarkets(a) {
  const ch = chainOf(a.chain); if (!ch) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  const loan = a.loan ? String(a.loan).trim().toUpperCase() : null, coll = a.collateral ? String(a.collateral).trim().toUpperCase() : null;
  if ((loan && !/^[A-Z0-9.\-]{1,15}$/.test(loan)) || (coll && !/^[A-Z0-9.\-]{1,15}$/.test(coll))) return bad("loan/collateral: token symbols");
  const minUsd = Number(a.min_supply_usd ?? 1e6), limit = Math.min(Math.max(Number(a.limit ?? 15) || 15, 1), 50);
  const q = `{ markets(first: 200, orderBy: SupplyAssetsUsd, orderDirection: Desc, where: { chainId_in: [${CID[ch]}] }) { items { marketId lltv loanAsset { symbol address } collateralAsset { symbol address } state { borrowApy supplyApy netBorrowApy netSupplyApy utilization supplyAssetsUsd borrowAssetsUsd liquidityAssetsUsd } } } }`;
  let j; try { j = await getJ("https://blue-api.morpho.org/graphql", 12000, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q }) }); } catch (e) { return { status: 502, body: { error: "morpho api unavailable: " + (e.message || e) } }; }
  if (j.errors) return { status: 502, body: { error: "morpho api: " + j.errors[0].message } };
  const rows = ((j.data && j.data.markets && j.data.markets.items) || []).filter((m) => m.state && m.collateralAsset && (m.state.supplyAssetsUsd || 0) >= minUsd && (!loan || m.loanAsset.symbol.toUpperCase() === loan) && (!coll || m.collateralAsset.symbol.toUpperCase() === coll))
    .map((m) => { const s = m.state; const flags = []; if (s.utilization > 0.95) flags.push("utilization_gt_95pct_withdraw_risk"); if (s.borrowApy > 1) flags.push("borrow_apy_gt_100pct_anomalous");
      return { market_id: m.marketId, loan: m.loanAsset.symbol, collateral: m.collateralAsset.symbol, loan_address: m.loanAsset.address, collateral_address: m.collateralAsset.address, lltv_pct: Number(BigInt(m.lltv) / 10n ** 14n) / 100, supply_apy_pct: r6(100 * s.supplyApy), borrow_apy_pct: r6(100 * s.borrowApy), net_supply_apy_pct: r6(100 * (s.netSupplyApy ?? s.supplyApy)), net_borrow_apy_pct: r6(100 * (s.netBorrowApy ?? s.borrowApy)), utilization: r6(s.utilization), supply_usd: Math.round(s.supplyAssetsUsd || 0), borrow_usd: Math.round(s.borrowAssetsUsd || 0), liquidity_usd: Math.round(s.liquidityAssetsUsd || 0), flags }; }).slice(0, limit);
  return { status: 200, body: { chain: ch, protocol: "morpho-blue", count: rows.length, markets: rows, source: "Morpho public API (keyless)" } };
}

// ---- /v1/tokensafety ---- combined score: contract controls + token metadata + DefiLlama price/confidence
const W = { SELFDESTRUCT: 30, HIDDEN_OWNER: 20, OWNER_MINT: 15, BLACKLIST: 10, PAUSABLE: 5, UPGRADEABLE_PROXY: 10, ACTIVE_OWNER: 5, FEE_SETTER: 15, TRADING_TOGGLE: 25, MAX_TX: 10 };
export async function tokensafety(a) {
  const ch = chainOf(a.chain); if (!ch) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  const t = String(a.token ?? a.address ?? "").trim(); if (!isA(t)) return bad("token: 0x ERC-20 address");
  const [cr, ti, px] = await Promise.all([contractrisk({ address: t, chain: ch }).catch(() => null), tokeninfo({ address: t, chain: ch }).catch(() => null), getJ(`https://coins.llama.fi/prices/current/${ch}:${t}`, 6000).catch(() => null)]);
  const c = (cr && cr.body) || {}, tk = (ti && ti.body && ti.body.tokens && ti.body.tokens[0]) || {}, p = px && px.coins && px.coins[`${ch}:${t}`];
  if (c.is_contract === false) return { status: 422, body: { error: "address has no contract code", chain: ch } };
  const flags = [...new Set([...(c.flags || []), ...(tk.flags || []).map((f) => String(f).toUpperCase())])];
  if (!p) flags.push("NO_PRICE_FEED"); else if (p.confidence != null && p.confidence < 0.8) flags.push("LOW_PRICE_CONFIDENCE");
  let pen = 0; for (const f of flags) pen += W[f] ?? (f === "NO_PRICE_FEED" ? 15 : f === "LOW_PRICE_CONFIDENCE" ? 10 : 3);
  const known = !!(c.label || tk.label); if (known) pen = Math.round(pen * 0.4);
  const score = Math.max(0, 100 - pen);
  return { status: 200, body: { chain: ch, token: checksum(t), name: tk.name ?? null, symbol: tk.symbol ?? null, decimals: tk.decimals ?? null, total_supply: tk.total_supply ?? null, label: c.label || tk.label || null, safety_score: score, grade: score >= 80 ? "A" : score >= 65 ? "B" : score >= 45 ? "C" : score >= 25 ? "D" : "F",
    price_usd: p ? r6(p.price) : null, price_confidence: p ? p.confidence ?? null : null, proxy: c.proxy ?? null, owner: c.owner ?? null, owner_renounced: c.owner_renounced ?? null, paused: c.paused ?? null, contract_verdict: c.verdict ?? null, flags,
    note: "Static + on-chain heuristic (no trade simulation). Known/curated tokens get centralization flags discounted. Pair with /v1/pairliq for liquidity and /v1/mevstyle for transfer-tax evidence." } };
}
