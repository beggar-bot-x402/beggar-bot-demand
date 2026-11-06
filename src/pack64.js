// pack64: pricebatchhist (DefiLlama batchHistorical: many coins x many timestamps), pricelookback (one coin's price now vs 1d/7d/30d/90d/180d/365d ago), solblockrange (Solana produced vs skipped slots over a range), soltokenacct (SPL token account balance + owner/mint/delegate/state)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const j = async (u, o) => { const r = await fetch(u, { ...o, signal: AbortSignal.timeout(25000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const rpc = async (method, params) => { let last; for (const u of RPCS) { try { const d = await j(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }); if (d.error) { const e = new Error(d.error.message); e.rpc = d.error.code; if (/Invalid param/i.test(d.error.message)) { e.rpc = -32602; throw e; } e.rpc = 0; last = e; continue; } return d.result; } catch (e) { if (e.rpc === -32602) throw e; last = e; } } throw last; };
const coinId = (c) => { c = String(c || "").trim(); if (!c) return null; if (c.includes(":")) return c; if (/^0x[0-9a-fA-F]{40}$/.test(c)) return "ethereum:" + c.toLowerCase(); if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(c)) return "solana:" + c; return "coingecko:" + c.toLowerCase(); };
const ts = (v) => { v = String(v).trim(); if (/^\d{9,10}$/.test(v)) return +v; const t = Date.parse(v); return isFinite(t) ? Math.floor(t / 1000) : null; };
const iso = (t) => new Date(t * 1000).toISOString();
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const batch = (m, w) => j("https://coins.llama.fi/batchHistorical?coins=" + encodeURIComponent(JSON.stringify(m)) + "&searchWidth=" + w);

export async function pricebatchhist(a) {
  const cs = [...new Set(String(a.coins || a.coin || "").split(/[\s,]+/).map(coinId).filter(Boolean))].slice(0, 10);
  const tsl = [...new Set(String(a.timestamps || a.dates || "").split(/[\s,]+/).filter(Boolean).map(ts).filter((x) => x && x > 1230000000 && x <= Date.now() / 1000 + 60))].slice(0, 20);
  if (!cs.length || !tsl.length) return R(400, { error: "coins (1-10: coingecko id, chain:address, 0x.. or solana mint) and timestamps (1-20: unix or ISO dates) required" });
  try { const d = await batch(Object.fromEntries(cs.map((c) => [c, tsl])), n(a.width, 6, 1, 24) + "h");
    const list = cs.map((c) => { const x = d.coins?.[c]; if (!x) return { coin: c, error: "no price" }; const ps = (x.prices || []).map((p) => ({ requested: null, timestamp: p.timestamp, time: iso(p.timestamp), price: p.price, confidence: p.confidence }));
      for (const p of ps) { let b = null; for (const t of tsl) if (b == null || Math.abs(t - p.timestamp) < Math.abs(b - p.timestamp)) b = t; p.requested = iso(b); }
      return { coin: c, symbol: x.symbol || null, points: ps.length, prices: ps.sort((u, v) => u.timestamp - v.timestamp) }; });
    return R(200, { coins: cs.length, timestamps: tsl.length, list }); } catch (e) { return bad(e); }
}

export async function pricelookback(a) {
  const c = coinId(a.coin || a.token); if (!c) return R(400, { error: "coin required: coingecko id (bitcoin), chain:address, 0x.. or solana mint" });
  const now = Math.floor(Date.now() / 1000); const L = [["1d", 1], ["7d", 7], ["30d", 30], ["90d", 90], ["180d", 180], ["365d", 365]];
  try { const [cur, h] = await Promise.all([j("https://coins.llama.fi/prices/current/" + encodeURIComponent(c)), batch({ [c]: L.map(([, d]) => now - d * 86400) }, "12h")]);
    const p = cur.coins?.[c]; if (!p) return R(404, { error: "unknown coin", coin: c }); const hp = h.coins?.[c]?.prices || [];
    const out = L.map(([k, d]) => { const t = now - d * 86400; const b = hp.reduce((x, y) => (!x || Math.abs(y.timestamp - t) < Math.abs(x.timestamp - t) ? y : x), null); const ok = b && Math.abs(b.timestamp - t) < 86400;
      return { period: k, price: ok ? b.price : null, time: ok ? iso(b.timestamp) : null, change_pct: ok && b.price ? +(((p.price - b.price) / b.price) * 100).toFixed(2) : null }; });
    return R(200, { coin: c, symbol: p.symbol, price: p.price, as_of: iso(p.timestamp), lookback: out }); } catch (e) { return bad(e); }
}

export async function solblockrange(a) {
  const lim = n(a.limit, 200, 1, 1000);
  try { let s = parseInt(a.start_slot || a.slot); const tip = await rpc("getSlot", [{ commitment: "finalized" }]); if (!(s > 0)) s = tip - lim; if (s > tip) return R(400, { error: "start_slot beyond finalized tip", tip });
    const bl = await rpc("getBlocksWithLimit", [s, lim, { commitment: "finalized" }]); if (!bl.length) return R(404, { error: "no blocks in range", start_slot: s });
    const span = bl.at(-1) - s + 1; const skipped = []; for (let i = s, k = 0; i <= bl.at(-1); i++) { if (bl[k] === i) k++; else skipped.push(i); }
    return R(200, { start_slot: s, end_slot: bl.at(-1), finalized_tip: tip, slots_spanned: span, blocks_produced: bl.length, slots_skipped: skipped.length, skip_rate_pct: +((skipped.length / span) * 100).toFixed(2), skipped_slots: skipped.slice(0, 200), first_block: bl[0], last_block: bl.at(-1) }); } catch (e) { return bad(e); }
}

export async function soltokenacct(a) {
  const ac = String(a.account || a.address || "").trim(); if (!B58.test(ac)) return R(400, { error: "account required: SPL token account address (base58)" });
  try { const [bal, info] = await Promise.all([rpc("getTokenAccountBalance", [ac]), rpc("getAccountInfo", [ac, { encoding: "jsonParsed" }]).catch(() => null)]);
    const p = info?.value?.data?.parsed?.info || {}; const prog = info?.value?.owner || null;
    return R(200, { account: ac, mint: p.mint || null, owner: p.owner || null, amount: bal.value.amount, ui_amount: bal.value.uiAmountString, decimals: bal.value.decimals, state: p.state || null, is_native: !!p.isNative, delegate: p.delegate || null, delegated_amount: p.delegatedAmount?.uiAmountString || null, close_authority: p.closeAuthority || null, token_program: prog === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" ? "token-2022" : prog ? "spl-token" : null, slot: bal.context?.slot });
  } catch (e) { return e.rpc === -32602 ? R(404, { error: "not a token account", account: ac }) : bad(e); }
}
