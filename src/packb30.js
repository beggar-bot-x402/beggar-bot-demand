// packb30 (builder B, 2026-11-02): swapbuild, vaultbuild, accesslist, permit2build. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccakHex } from "./evm.js";
import { txbuild } from "./packb24.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] && s !== "base-sepolia" ? s : AL[s] || null; };
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { const s = String(h).replace(/^0x/, ""); if (!/^([0-9a-fA-F]{2})*$/.test(s)) throw new Error("bad hex"); return Uint8Array.from(s.match(/../g) || [], (x) => parseInt(x, 16)); };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const be = (v) => { v = BigInt(v); if (v === 0n) return new Uint8Array(0); let h = v.toString(16); if (h.length % 2) h = "0" + h; return unhex(h); };
const sel = (s) => keccakHex(s).slice(0, 10);
const w = (x, i) => BigInt("0x" + ((x || "0x").slice(2 + 64 * i, 66 + 64 * i) || "0"));
const toUnits = (a, dec) => { a = String(a ?? ""); if (!/^\d+(\.\d+)?$/.test(a)) return null; const [i, f = ""] = a.split("."); if (f.length > dec) return null; return BigInt(i) * 10n ** BigInt(dec) + BigInt((f + "0".repeat(dec)).slice(0, dec) || "0"); };
const WETH = { base: "0x4200000000000000000000000000000000000006", optimism: "0x4200000000000000000000000000000000000006", ethereum: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", polygon: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270" };
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" };
const tok = (ch, t) => isA(t) ? t : ({ USDC: USDC[ch], WETH: WETH[ch], ETH: WETH[ch] })[String(t || "").toUpperCase()] || null;
const tb = (t) => ({ tx: t.body.tx || null, signing_hash: t.body.signing_hash || null, unsigned_serialized: t.body.unsigned_serialized || null, gas_cost_max_eth: t.body.max_cost_eth ?? null, build_error: t.body.error || null });
const strDec = (h) => { try { const b = h.slice(2); if (b.length === 64) return new TextDecoder().decode(unhex(b)).replace(/\0+$/, ""); const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64))); return new TextDecoder().decode(unhex(b.slice(off + 64, off + 64 + len * 2))); } catch { return null; } };
// ---- swapbuild (Uniswap v3 SwapRouter02 exactInputSingle) ----
const UNI = { base: { q: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", r: "0x2626664c2603336E57B271c5C0b26F421741e481" }, ethereum: { q: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", r: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" }, arbitrum: { q: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", r: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" }, optimism: { q: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", r: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" }, polygon: { q: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", r: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45" } };
export async function swapbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.from)) return bad("from address required");
  const tin = tok(ch, q.token_in), tout = tok(ch, q.token_out); if (!tin || !tout) return bad("token_in/token_out: address, USDC or WETH"); if (tin.toLowerCase() === tout.toLowerCase()) return bad("token_in == token_out");
  const slip = Math.min(Math.max(Number(q.slippage_bps ?? 50), 1), 1000);
  const fees = q.fee ? [Number(q.fee)] : [100, 500, 3000, 10000]; if (fees.some((f) => ![100, 500, 3000, 10000].includes(f))) return bad("fee: 100|500|3000|10000");
  try {
    const { results: d } = await rpcBatch(ch, [["eth_call", [{ to: tin, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: tout, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: tin, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: tin, data: "0xdd62ed3e" + pad(q.from) + pad(UNI[ch].r) }, "latest"]], ["eth_call", [{ to: tin, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: tout, data: "0x95d89b41" }, "latest"]]]);
    if (!d[0] || !d[1]) return bad("token has no decimals() on " + ch);
    const di = Number(BigInt(d[0])), dout = Number(BigInt(d[1])); const amt = toUnits(q.amount, di); if (amt == null || amt === 0n) return bad(`amount (<= ${di} decimals, > 0) required`);
    const qs = sel("quoteExactInputSingle((address,address,uint256,uint24,uint160))");
    const { results: r } = await rpcBatch(ch, fees.map((f) => ["eth_call", [{ to: UNI[ch].q, data: qs + pad(tin) + pad(tout) + pad(amt.toString(16)) + pad(f.toString(16)) + pad("0") }, "latest"]]));
    const quotes = fees.map((f, i) => ({ fee: f, amount_out: r[i] && r[i].length >= 66 ? w(r[i], 0) : null, gas_estimate: r[i] && r[i].length >= 2 + 64 * 4 ? Number(w(r[i], 3)) : null })).filter((x) => x.amount_out && x.amount_out > 0n);
    if (!quotes.length) return bad("no Uniswap v3 pool with liquidity for this pair/amount");
    quotes.sort((a, b) => (b.amount_out > a.amount_out ? 1 : -1)); const best = quotes[0];
    const minOut = best.amount_out * BigInt(10000 - slip) / 10000n; const rcpt = isA(q.recipient) ? q.recipient : q.from;
    const data = sel("exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))") + pad(tin) + pad(tout) + pad(best.fee.toString(16)) + pad(rcpt) + pad(amt.toString(16)) + pad(minOut.toString(16)) + pad("0");
    const bal = d[2] ? w(d[2], 0) : null, alw = d[3] ? w(d[3], 0) : null; const warn = []; let approval = null;
    if (bal != null && bal < amt) warn.push("insufficient token_in balance");
    if (alw != null && alw < amt) { approval = { to: checksum(tin), data: "0x095ea7b3" + pad(UNI[ch].r) + pad(amt.toString(16)) }; warn.push("router allowance insufficient — send approval_tx first"); }
    const t = approval || warn.length ? { body: {} } : await txbuild({ chain: ch, from: q.from, to: UNI[ch].r, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    const f = (v, dc) => Number(v) / 10 ** dc;
    return ok({ chain: ch, router: checksum(UNI[ch].r), token_in: { address: checksum(tin), symbol: strDec(d[4]), decimals: di }, token_out: { address: checksum(tout), symbol: strDec(d[5]), decimals: dout }, amount_in: String(q.amount), best_fee_tier: best.fee, expected_out: f(best.amount_out, dout), min_out: f(minOut, dout), slippage_bps: slip, price: f(best.amount_out, dout) / Number(q.amount), quotes: quotes.map((x) => ({ fee: x.fee, out: f(x.amount_out, dout), gas_estimate: x.gas_estimate })), recipient: checksum(rcpt), approval_tx: approval, calldata: data, ...tb(t), safe_to_send: !warn.length && !t.body.error, warnings: warn, note: "Quote from Uniswap v3 QuoterV2 at latest block; single-pool route only. Native ETH in: wrap first (/v1/wrapbuild)." });
  } catch (e) { return err(e); }
}
// ---- vaultbuild (ERC-4626) ----
export async function vaultbuild(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.vault) || !isA(q.from)) return bad("vault and from addresses required");
  const action = String(q.action || "deposit").toLowerCase(); if (!["deposit", "redeem", "withdraw"].includes(action)) return bad("action: deposit|redeem|withdraw");
  try {
    const { results: a } = await rpcBatch(ch, [["eth_call", [{ to: q.vault, data: sel("asset()") }, "latest"]], ["eth_call", [{ to: q.vault, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: q.vault, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: q.vault, data: "0x70a08231" + pad(q.from) }, "latest"]]]);
    if (!a[0] || a[0].length < 66) return bad("not an ERC-4626 vault (asset() failed)");
    const asset = "0x" + a[0].slice(26, 66); const vdec = a[1] ? Number(BigInt(a[1])) : 18; const shares = a[3] ? w(a[3], 0) : 0n;
    const { results: b } = await rpcBatch(ch, [["eth_call", [{ to: asset, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: asset, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_call", [{ to: asset, data: "0xdd62ed3e" + pad(q.from) + pad(q.vault) }, "latest"]], ["eth_call", [{ to: asset, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: q.vault, data: sel("maxDeposit(address)") + pad(q.from) }, "latest"]], ["eth_call", [{ to: q.vault, data: sel("convertToAssets(uint256)") + pad(shares.toString(16)) }, "latest"]]]);
    const adec = b[0] ? Number(BigInt(b[0])) : 18; const max = String(q.amount).toLowerCase() === "max";
    let units; if (action === "redeem") units = max ? shares : toUnits(q.amount, vdec); else if (max) return bad("amount=max only for redeem"); else units = toUnits(q.amount, adec);
    if (units == null || units === 0n) return bad("amount required (> 0)");
    const pv = action === "deposit" ? sel("previewDeposit(uint256)") : action === "redeem" ? sel("previewRedeem(uint256)") : sel("previewWithdraw(uint256)");
    const { results: p } = await rpcBatch(ch, [["eth_call", [{ to: q.vault, data: pv + pad(units.toString(16)) }, "latest"]]]);
    const preview = p[0] && p[0].length >= 66 ? w(p[0], 0) : null;
    const data = action === "deposit" ? sel("deposit(uint256,address)") + pad(units.toString(16)) + pad(q.from) : action === "redeem" ? sel("redeem(uint256,address,address)") + pad(units.toString(16)) + pad(q.from) + pad(q.from) : sel("withdraw(uint256,address,address)") + pad(units.toString(16)) + pad(q.from) + pad(q.from);
    const warn = []; let approval = null; const abal = b[1] ? w(b[1], 0) : null, alw = b[2] ? w(b[2], 0) : null;
    if (action === "deposit") { if (abal != null && abal < units) warn.push("insufficient asset balance"); if (b[4] && w(b[4], 0) < units) warn.push("exceeds maxDeposit"); if (alw != null && alw < units) { approval = { to: checksum(asset), data: "0x095ea7b3" + pad(q.vault) + pad(units.toString(16)) }; warn.push("vault allowance insufficient — send approval_tx first"); } }
    if (action === "redeem" && shares < units) warn.push("insufficient shares");
    if (preview == null) warn.push("preview reverted — action likely fails");
    const t = approval ? { body: {} } : await txbuild({ chain: ch, from: q.from, to: q.vault, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    return ok({ chain: ch, vault: checksum(q.vault), vault_symbol: strDec(a[2]), asset: checksum(asset), asset_symbol: b[3] ? strDec(b[3]) : null, action, amount: max ? "max" : String(q.amount), amount_units: units.toString(), preview: preview == null ? null : { raw: preview.toString(), human: Number(preview) / 10 ** (action === "deposit" || action === "withdraw" ? vdec : adec), unit: action === "redeem" ? "assets" : "shares" }, position: { shares: Number(shares) / 10 ** vdec, assets: b[5] ? Number(w(b[5], 0)) / 10 ** adec : null }, wallet_asset_balance: abal == null ? null : Number(abal) / 10 ** adec, approval_tx: approval, calldata: data, ...tb(t), safe_to_send: !warn.length && !t.body.error, warnings: warn });
  } catch (e) { return err(e); }
}
// ---- accesslist ----
export async function accesslist(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  if (!isA(q.to)) return bad("to address required"); if (q.from && !isA(q.from)) return bad("from must be an address");
  let data; try { data = "0x" + hex(unhex(q.data || "0x")); } catch { return bad("data must be hex"); }
  let value; try { value = BigInt(q.value || 0); } catch { return bad("value (wei) invalid"); }
  const call = { ...(q.from ? { from: q.from } : {}), to: q.to, data, value: "0x" + value.toString(16) };
  try {
    const { results: r, rpc } = await rpcBatch(ch, [["eth_createAccessList", [call, "latest"]], ["eth_estimateGas", [call]]]);
    if (!r[0]) return ok({ chain: ch, supported: false, gas_without_list: r[1] ? Number(BigInt(r[1])) : null, note: "eth_createAccessList unavailable or call reverts on this RPC" });
    const al = r[0].accessList || []; const gWith = r[0].gasUsed ? Number(BigInt(r[0].gasUsed)) : null; const gWo = r[1] ? Number(BigInt(r[1])) : null;
    const keys = al.reduce((s, x) => s + (x.storageKeys || []).length, 0);
    return ok({ chain: ch, rpc, supported: true, access_list: al.map((x) => ({ address: checksum(x.address), storage_keys: x.storageKeys || [] })), addresses: al.length, storage_keys: keys, list_cost_gas: al.length * 2400 + keys * 1900, gas_with_list: gWith, gas_without_list: gWo, saves_gas: gWith != null && gWo != null ? gWith < gWo : null, error: r[0].error || null, note: "Include as accessList in an EIP-2930/1559 tx; worthwhile only if gas_with_list < gas_without_list." });
  } catch (e) { return err(e); }
}
// ---- permit2build ----
const P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export async function permit2build(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const token = tok(ch, q.token || "USDC"); if (!token) return bad("token: address, USDC or WETH");
  if (!isA(q.owner) || !isA(q.spender)) return bad("owner and spender addresses required");
  const days = Math.min(Math.max(Number(q.expiry_days ?? 30), 0.01), 3650);
  try {
    const { results: r } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0xdd62ed3e" + pad(q.owner) + pad(P2) }, "latest"]], ["eth_call", [{ to: P2, data: sel("allowance(address,address,address)") + pad(q.owner) + pad(token) + pad(q.spender) }, "latest"]], ["eth_getBlockByNumber", ["latest", false]]]);
    if (!r[0]) return bad("token has no decimals() on " + ch);
    const dec = Number(BigInt(r[0])); const inf = String(q.amount).toLowerCase() === "max"; const units = inf ? (1n << 160n) - 1n : toUnits(q.amount, dec); if (units == null || units >= 1n << 160n) return bad("amount: human units (fits uint160) or max");
    const now = r[3] ? Number(BigInt(r[3].timestamp)) : Math.floor(Date.now() / 1000); const exp = now + Math.round(days * 86400);
    const tokAlw = r[1] ? w(r[1], 0) : null; const p2 = r[2] && r[2].length >= 2 + 64 * 3 ? { amount: w(r[2], 0).toString(), expiration: Number(w(r[2], 1)), nonce: Number(w(r[2], 2)) } : null;
    const steps = []; if (tokAlw == null || tokAlw < units) steps.push({ step: "erc20_approve_permit2", to: checksum(token), data: "0x095ea7b3" + pad(P2) + pad(((1n << 256n) - 1n).toString(16)), note: "one-time token → Permit2 approval" });
    const data = sel("approve(address,address,uint160,uint48)") + pad(token) + pad(q.spender) + pad(units.toString(16)) + pad(exp.toString(16));
    const t = steps.length ? { body: {} } : await txbuild({ chain: ch, from: q.owner, to: P2, data, ...(q.nonce != null ? { nonce: q.nonce } : {}) });
    steps.push({ step: "permit2_approve", to: P2, data });
    return ok({ chain: ch, permit2: P2, token: checksum(token), decimals: dec, owner: checksum(q.owner), spender: checksum(q.spender), amount_units: units.toString(), expiration: exp, expiration_iso: new Date(exp * 1000).toISOString(), token_allowance_to_permit2: tokAlw == null ? null : tokAlw.toString(), current_permit2_allowance: p2, steps, calldata: data, ...tb(t), warnings: inf ? ["max uint160 allowance"] : [], note: steps.length > 1 ? "tx built after step 1 confirms; signing data for gasless variant: /v1/permit2data" : "Revoke later with Permit2.lockdown or approve amount 0." });
  } catch (e) { return err(e); }
}
