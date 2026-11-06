// Builder B pack 2 (2026-11-02): /v1/pegcheck (stablecoin depeg monitor, DefiLlama stablecoins keyless), /v1/oracleprice (Chainlink feed read via keyless RPC,
// staleness + deviation), /v1/fxrate (ECB fiat FX via Frankfurter keyless; USD<->EUR/GBP for agent pricing). $0 upstream.
import { rpcBatch } from "./walletintel.js";
const bad = (m) => ({ status: 400, body: { error: m } }), ok = (b) => ({ status: 200, body: b });
const UA = { "user-agent": "BeggarBot/1.0", accept: "application/json" };
const getJ = async (u, ms = 10000) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(ms) }); if (!r.ok) throw new Error("upstream http " + r.status); return r.json(); };
const up = (e, m) => ({ status: 502, body: { error: m, detail: String(e.message || e).slice(0, 160) } });

// ---- /v1/pegcheck ----
const PEG = { peggedUSD: 1 };
export async function pegcheck(a) {
  const syms = String(a.symbols || a.symbol || "USDC,USDT,DAI,USDS,USDE,FDUSD,PYUSD,USD1,RLUSD,FRAX").toUpperCase().split(",").map((s) => s.trim()).filter(Boolean).slice(0, 25);
  const thr = Number(a.threshold_pct ?? 0.5);
  try { const j = await getJ("https://stablecoins.llama.fi/stablecoins?includePrices=true", 15000); const all = j.peggedAssets || [];
    const out = []; for (const s of syms) { const c = all.filter((x) => String(x.symbol).toUpperCase() === s).sort((x, y) => (y.circulating?.[y.pegType] || 0) - (x.circulating?.[x.pegType] || 0))[0]; if (!c) { out.push({ symbol: s, found: false }); continue; }
      const sup = c.circulating?.[c.pegType] || 0, d1 = c.circulatingPrevDay?.[c.pegType], d7 = c.circulatingPrevWeek?.[c.pegType], target = PEG[c.pegType] ?? null, price = c.price ?? null;
      const dev = target && price != null ? ((price - target) / target) * 100 : null; const flags = [];
      if (dev != null && Math.abs(dev) >= thr) flags.push(dev < 0 ? "DEPEG_BELOW" : "DEPEG_ABOVE"); if (price == null) flags.push("NO_PRICE"); if (d7 && sup < d7 * 0.9) flags.push("SUPPLY_DOWN_10PCT_7D");
      out.push({ symbol: c.symbol, name: c.name, found: true, peg_type: c.pegType, mechanism: c.pegMechanism, price, deviation_pct: dev != null ? Math.round(dev * 1000) / 1000 : null, circulating: Math.round(sup), supply_change_1d_pct: d1 ? Math.round(((sup - d1) / d1) * 10000) / 100 : null, supply_change_7d_pct: d7 ? Math.round(((sup - d7) / d7) * 10000) / 100 : null, top_chains: Object.entries(c.chainCirculating || {}).map(([k, v]) => [k, v?.current?.[c.pegType] || 0]).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ chain: k, circulating: Math.round(v) })), flags, status: flags.some((f) => f.startsWith("DEPEG")) ? "depegged" : "ok" }); }
    return ok({ source: "defillama stablecoins", threshold_pct: thr, any_depeg: out.some((x) => x.status === "depegged"), coins: out, fetched_at: new Date().toISOString() });
  } catch (e) { return up(e, "stablecoin upstream failed"); }
}

// ---- /v1/oracleprice (Chainlink AggregatorV3) ----
const FEEDS = { base: { "ETH/USD": "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", "BTC/USD": "0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F", "USDC/USD": "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B", "CBETH/USD": "0xd7818272B9e248357d13057AAb0B417aF31E817d", "LINK/USD": "0x17CAb8FE31E32f08326e5E27412894e49B0f9D65", "DAI/USD": "0x591e79239a7d679378eC8c847e5038150364C78F", "USDT/USD": "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9" },
  ethereum: { "ETH/USD": "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", "BTC/USD": "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", "USDC/USD": "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", "USDT/USD": "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", "LINK/USD": "0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c", "DAI/USD": "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9", "EUR/USD": "0xb49f677943BC038e9857d61E7d053CaA2C1734C1" } };
const S = { latestRoundData: "0xfeaf968c", decimals: "0x313ce567", description: "0x7284e416" };
const decStr = (h) => { try { const b = h.slice(2), off = parseInt(b.slice(0, 64), 16) * 2, len = parseInt(b.slice(off, off + 64), 16); return decodeURIComponent(b.slice(off + 64, off + 64 + len * 2).replace(/(..)/g, "%$1")); } catch { return null; } };
const sint = (h) => { let v = BigInt("0x" + h); if (v >> 255n) v -= 1n << 256n; return v; };
export async function oracleprice(a) {
  const chain = String(a.chain || "base").toLowerCase() === "ethereum" || a.chain === "1" || a.chain === "eth" ? "ethereum" : String(a.chain || "base").toLowerCase() === "base" || a.chain === "8453" ? "base" : null; if (!chain) return bad("chain: base or ethereum");
  let list = []; const maxAge = Number(a.max_age_s ?? 90000);
  if (a.feed) { if (!/^0x[0-9a-fA-F]{40}$/.test(a.feed)) return bad("feed must be 0x address"); list = [[null, a.feed]]; }
  else { const ps = String(a.pairs || a.pair || "ETH/USD,BTC/USD,USDC/USD").toUpperCase().split(",").map((s) => s.trim().replace("-", "/")).filter(Boolean).slice(0, 8); for (const p of ps) list.push([p, FEEDS[chain][p] || null]); }
  const known = list.filter((x) => x[1]); if (!known.length) return bad("no known feed; supported: " + Object.keys(FEEDS[chain]).join(", ") + " or feed=0x");
  try { const calls = known.flatMap(([, f]) => [S.latestRoundData, S.decimals, S.description].map((d) => ["eth_call", [{ to: f, data: d }, "latest"]])); const r = (await rpcBatch(chain, calls)).results; const now = Math.floor(Date.now() / 1000);
    const feeds = known.map(([p, f], i) => { const rd = r[i * 3], dc = r[i * 3 + 1], ds = r[i * 3 + 2]; if (!rd || rd.length < 322) return { pair: p, feed: f, ok: false, error: "read_failed" };
      const b = rd.slice(2), ans = sint(b.slice(64, 128)), upd = Number(BigInt("0x" + b.slice(192, 256))), dec = dc ? Number(BigInt(dc)) : 8; const age = now - upd; const price = Number(ans) / 10 ** dec;
      return { pair: p || decStr(ds), description: decStr(ds), feed: f, ok: true, price, decimals: dec, round_id: BigInt("0x" + b.slice(0, 64)).toString(), updated_at: new Date(upd * 1000).toISOString(), age_s: age, stale: age > maxAge, flags: [...(age > maxAge ? ["STALE"] : []), ...(ans <= 0n ? ["NON_POSITIVE_ANSWER"] : [])] }; });
    const unknown = list.filter((x) => !x[1]).map((x) => x[0]);
    return ok({ source: "chainlink", chain, max_age_s: maxAge, feeds, ...(unknown.length ? { unsupported: unknown } : {}) });
  } catch (e) { return up(e, "rpc failed"); }
}

// ---- /v1/fxrate ----
export async function fxrate(a) {
  const base = String(a.base || a.from || "USD").toUpperCase(), to = String(a.symbols || a.to || "EUR,GBP,JPY,CNY,INR,BRL,CAD,AUD,CHF").toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}(,[A-Z]{3})*$/.test(to)) return bad("base and symbols must be ISO 4217 codes");
  const amount = a.amount != null ? Number(a.amount) : 1; if (!(amount > 0)) return bad("amount must be > 0");
  const date = a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : "latest";
  try { const j = await getJ(`https://api.frankfurter.app/${date}?from=${base}&to=${to}`); const rates = j.rates || {};
    return ok({ source: "ECB via frankfurter", base, date: j.date, amount, rates, converted: Object.fromEntries(Object.entries(rates).map(([k, v]) => [k, Math.round(v * amount * 1e6) / 1e6])), note: "ECB reference rates, updated ~16:00 CET on TARGET business days" });
  } catch (e) { return up(e, "fx upstream failed"); }
}
