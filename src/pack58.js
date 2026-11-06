// pack58: solshield (Jupiter Shield token risk warnings), jupholdings (wallet holdings via Jupiter Ultra + USD values), juplimitorders (Jupiter trigger/limit orders for a wallet), jupdca (Jupiter recurring/DCA orders for a wallet)
const R = (status, body) => ({ status, body });
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d) || d));
const bad = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const J = "https://lite-api.jup.ag";
const j = async (u) => { const r = await fetch(J + u, { signal: AbortSignal.timeout(25000) }); if (!r.ok) { const e = new Error("upstream " + r.status); e.st = r.status; throw e; } return r.json(); };
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const r2 = (x) => (x == null || !isFinite(x) ? null : +(+x).toFixed(2));
const SOL = "So11111111111111111111111111111111111111112";

export async function solshield(a) {
  const m = String(a.mints || a.mint || "").split(/[\s,]+/).filter(Boolean).slice(0, 50); if (!m.length || !m.every((x) => B58.test(x))) return R(400, { error: "mints required: base58 SPL mint(s), comma-separated, max 50" });
  try { const d = await j("/ultra/v1/shield?mints=" + m.join(",")); const w = d.warnings || {};
    const l = m.map((x) => { const ws = w[x] || []; const crit = ws.filter((y) => y.severity === "critical").length, warn = ws.filter((y) => y.severity === "warning").length; return { mint: x, risk: crit ? "critical" : warn ? "warning" : ws.length ? "info" : "none", critical: crit, warnings: warn, flags: ws.map((y) => ({ type: y.type, severity: y.severity, message: y.message })) }; });
    return R(200, { chain: "solana", source: "jupiter shield", checked: l.length, critical: l.filter((x) => x.risk === "critical").length, list: l }); } catch (e) { return bad(e); }
}

export async function jupholdings(a) {
  const w = String(a.wallet || a.address || ""); if (!B58.test(w)) return R(400, { error: "wallet required: base58 Solana address" });
  try { const d = await j("/ultra/v1/holdings/" + w); const t = Object.entries(d.tokens || {}).map(([mint, accs]) => ({ mint, accounts: accs.length, amount: accs.reduce((s, x) => s + (x.uiAmount || 0), 0), frozen: accs.some((x) => x.isFrozen), program: accs[0]?.programId?.startsWith("TokenzQd") ? "token-2022" : "spl-token" })).filter((x) => x.amount > 0 || a.include_zero === "true");
    const ids = [SOL, ...t.map((x) => x.mint)].slice(0, 50); let px = {}; try { px = await j("/price/v3?ids=" + ids.join(",")); } catch {}
    const sol = d.uiAmount || 0; const solusd = px[SOL]?.usdPrice ?? null;
    t.forEach((x) => { const p = px[x.mint]?.usdPrice; x.price_usd = p ?? null; x.value_usd = p != null ? r2(p * x.amount) : null; }); t.sort((x, y) => (y.value_usd || 0) - (x.value_usd || 0));
    const tv = t.reduce((s, x) => s + (x.value_usd || 0), 0) + (solusd ? sol * solusd : 0);
    return R(200, { chain: "solana", wallet: w, sol: sol, sol_usd: solusd ? r2(sol * solusd) : null, token_count: t.length, priced_tokens: t.filter((x) => x.value_usd != null).length, total_value_usd: r2(tv), list: t.slice(0, n(a.limit, 50, 1, 500)) }); }
  catch (e) { return e.st >= 400 && e.st < 500 ? R(404, { error: "wallet not found" }) : bad(e); }
}

export async function juplimitorders(a) {
  const w = String(a.wallet || a.user || ""); if (!B58.test(w)) return R(400, { error: "wallet required: base58 Solana address" });
  const st = a.status === "history" ? "history" : "active";
  try { const d = await j("/trigger/v1/getTriggerOrders?user=" + w + "&orderStatus=" + st + "&page=" + n(a.page, 1, 1, 1000)); const o = d.orders || [];
    return R(200, { chain: "solana", source: "jupiter trigger", wallet: w, status: st, total: d.totalItems ?? o.length, page: d.page, pages: d.totalPages, list: o.map((x) => ({ order: x.orderKey, input_mint: x.inputMint, output_mint: x.outputMint, making_amount: x.makingAmount, taking_amount: x.takingAmount, remaining_making: x.remainingMakingAmount, remaining_taking: x.remainingTakingAmount, status: x.status, created_at: x.createdAt, expired_at: x.expiredAt, updated_at: x.updatedAt, trades: (x.trades || []).length })) }); } catch (e) { return bad(e); }
}

export async function jupdca(a) {
  const w = String(a.wallet || a.user || ""); if (!B58.test(w)) return R(400, { error: "wallet required: base58 Solana address" });
  const st = a.status === "history" ? "history" : "active";
  try { const d = await j("/recurring/v1/getRecurringOrders?user=" + w + "&orderStatus=" + st + "&recurringType=all&includeFailedTx=false&page=" + n(a.page, 1, 1, 1000)); const o = [...(d.all || []), ...(d.time || []), ...(d.price || [])];
    return R(200, { chain: "solana", source: "jupiter recurring", wallet: w, status: st, total: d.totalItems ?? o.length, page: d.page, pages: d.totalPages, list: o.map((x) => ({ order: x.orderKey, type: x.recurringType || (x.cycleFrequency ? "time" : "price"), input_mint: x.inputMint, output_mint: x.outputMint, in_deposited: x.inDeposited, in_used: x.inUsed, in_left: x.inAmountLeft ?? x.inLeft, out_received: x.outReceived, per_cycle: x.inAmountPerCycle, cycle_seconds: x.cycleFrequency, status: x.status, created_at: x.createdAt, updated_at: x.updatedAt, trades: (x.trades || []).length })) }); } catch (e) { return bad(e); }
}
