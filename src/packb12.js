// packb12 (builder B, 2026-11-02): permit2, storageslot, cctpstatus, bridgequote. $0 upstream (keyless RPCs, Circle Iris, Across public API).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum, keccak } from "./evm.js";
import { AL } from "./packb10.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).filter(Boolean);
const chainR = (c) => { const s = String(c ?? "base").toLowerCase(); const k = RPCS[s] ? s : AL[s] || (s === "84532" ? "base-sepolia" : null); return k && RPCS[k] ? k : null; };
const h2b = (h) => Uint8Array.from(h.replace(/^0x/, "").match(/../g).map((x) => parseInt(x, 16)));
const b2h = (b) => "0x" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fmt = (v, d) => { const s = v.toString().padStart(d + 1, "0"); return (s.slice(0, -d) + "." + s.slice(-d)).replace(/\.?0+$/, "") || "0"; };

const P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
export async function permit2(a) {
  const ow = a.owner || a.address; if (!isA(ow)) return bad("owner required"); const c = chainR(a.chain); if (!c) return bad("unsupported chain");
  const toks = list(a.tokens || a.token), sps = list(a.spenders || a.spender); if (!toks.length || !sps.length) return bad("tokens and spenders (csv) required"); if (toks.length * sps.length > 40) return bad("max 40 token x spender pairs"); if ([...toks, ...sps].some((x) => !isA(x))) return bad("addresses only");
  const calls = [["eth_getCode", [P2, "latest"]], ["eth_getBlockByNumber", ["latest", false]]]; for (const t of toks) { calls.push(["eth_call", [{ to: t, data: "0xdd62ed3e" + pad(ow) + pad(P2) }, "latest"]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]]); for (const s of sps) calls.push(["eth_call", [{ to: P2, data: "0x927da105" + pad(ow) + pad(t) + pad(s) }, "latest"]]); }
  let R; try { R = (await rpcBatch(c, calls)).results; } catch (e) { return err(e); }
  if (!R[0] || R[0] === "0x") return ok({ chain: c, permit2_deployed: false, note: "Permit2 not deployed on this chain" });
  const now = Number(big(R[1]?.timestamp)) || Math.floor(Date.now() / 1000); let k = 2; const out = [];
  for (const t of toks) { const erc = big(R[k++]); const d = Number(big(R[k++])) || 18; for (const s of sps) { const h = R[k++]; if (h == null) { out.push({ token: checksum(t), spender: checksum(s), error: "call failed" }); continue; } const x = h.slice(2); const amt = BigInt("0x" + x.slice(0, 64)), exp = Number(BigInt("0x" + x.slice(64, 128))), nonce = Number(BigInt("0x" + x.slice(128, 192)));
    const unl = amt >= (1n << 160n) - 1n; const live = amt > 0n && exp > now; const ercUnl = erc >= (1n << 255n);
    out.push({ token: checksum(t), spender: checksum(s), permit2_amount: unl ? "unlimited" : fmt(amt, d), permit2_amount_raw: amt.toString(), expiration: exp ? new Date(exp * 1000).toISOString() : null, expired: exp > 0 && exp <= now, nonce, active: live, token_to_permit2_allowance: ercUnl ? "unlimited" : fmt(erc, d), spendable_now: live && erc > 0n, risk: live && unl ? "unlimited_active" : live ? "active" : "inactive" }); } }
  return ok({ owner: checksum(ow), chain: c, permit2: P2, active: out.filter((x) => x.active).length, allowances: out, revoke_hint: "Permit2.lockdown([(token,spender)]) or approve(token,spender,0,0)" });
}

const wordHex = (v) => { if (isA(v)) return pad(v); if (/^0x[0-9a-fA-F]{1,64}$/.test(v)) return pad(v); if (/^\d+$/.test(v)) return pad(BigInt(v).toString(16)); throw new Error("keys must be address, 0x hex or decimal"); };
export async function storageslot(a) {
  const ct = a.contract || a.address; if (!isA(ct)) return bad("contract required"); const c = chainR(a.chain); if (!c) return bad("unsupported chain");
  let slots = list(a.slots || a.slot); const base = a.mapping_slot ?? a.mappingSlot; const keys = list(a.keys || a.key);
  let derived = []; try { if (base != null && base !== "") { if (!keys.length) return bad("keys required with mapping_slot"); let s = wordHex(String(base)); for (const k of keys) s = b2h(keccak(h2b(wordHex(k) + s))).slice(2); derived = ["0x" + s]; } } catch (e) { return bad(e.message); }
  const NAMED = { eip1967_impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", eip1967_admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103", eip1967_beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50", zos_impl: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3", zos_admin: "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b" };
  slots = slots.map((s) => NAMED[s] || s); if (a.proxy === "1" || a.proxy === true || (!slots.length && !derived.length)) slots.push(...Object.values(NAMED));
  const all = [...slots.map((s) => { try { return "0x" + wordHex(s); } catch { return null; } }), ...derived]; if (all.some((x) => !x)) return bad("slots must be decimal or 0x hex (or eip1967_impl/admin/beacon)"); if (all.length > 30) return bad("max 30 slots");
  const blk = a.block ? "0x" + Number(a.block).toString(16) : "latest";
  let R; try { R = (await rpcBatch(c, all.map((s) => ["eth_getStorageAt", [ct, s, blk]]))).results; } catch (e) { return err(e); }
  const name = Object.fromEntries(Object.entries(NAMED).map(([k, v]) => [v, k]));
  const out = all.map((s, i) => { const v = R[i]; if (v == null) return { slot: s, error: "rpc failed" }; const n = big(v); const asAddr = v.slice(2, 26) === "0".repeat(24) && n > 0n && n < (1n << 160n) ? checksum("0x" + v.slice(-40)) : null;
    return { slot: s, label: name[s] || (derived.includes(s) ? `mapping[${keys.join("][")}] @ slot ${base}` : null), value: v, as_uint: n.toString(), as_address: asAddr, is_zero: n === 0n }; });
  return ok({ contract: checksum(ct), chain: c, block: blk, slots: out, mapping_slot_derived: derived[0] || null, use: "raw state reads: proxy impl/admin, mapping balances, packed vars" });
}

const DOM = { ethereum: 0, avalanche: 1, optimism: 2, arbitrum: 3, solana: 5, base: 6, polygon: 7, unichain: 10, linea: 11, sonic: 13, worldchain: 14 };
const DOMN = Object.fromEntries(Object.entries(DOM).map(([k, v]) => [v, k]));
export async function cctpstatus(a) {
  const src = String(a.source ?? a.chain ?? "base").toLowerCase(); const d = /^\d+$/.test(src) ? Number(src) : DOM[src] ?? DOM[AL[src]]; if (d == null) return bad("source chain: " + Object.keys(DOM).join("|") + " or domain id");
  const tx = a.tx || a.hash || a.transactionHash; if (!tx || !/^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{60,100})$/.test(tx)) return bad("tx (source burn tx hash) required");
  const net = a.testnet ? "iris-api-sandbox" : "iris-api";
  try { const r = await fetch(`https://${net}.circle.com/v2/messages/${d}?transactionHash=${tx}`, { signal: AbortSignal.timeout(8000) }); const j = await r.json().catch(() => ({}));
    if (r.status === 404 || !j.messages) return ok({ source: DOMN[d] || d, source_domain: d, tx, found: false, status: "not_found", note: j.error || "no CCTP message for this tx yet (may be indexing; retry in ~30s) or not a CCTP burn" });
    const msgs = j.messages.map((m) => { const dm = m.decodedMessage || {}; const body = dm.decodedMessageBody || {};
      return { status: m.status, attested: m.status === "complete" && !!m.attestation && m.attestation !== "PENDING", destination: DOMN[dm.destinationDomain] || dm.destinationDomain || null, destination_domain: dm.destinationDomain != null ? Number(dm.destinationDomain) : null, nonce: dm.nonce || m.eventNonce || null, amount_usdc: body.amount ? fmt(BigInt(body.amount), 6) : null, mint_recipient: body.mintRecipient || null, burn_token: body.burnToken || null, max_fee: body.maxFee ?? null, fee_executed: body.feeExecuted ?? null, finality_threshold: dm.minFinalityThreshold ?? null, finality_executed: dm.finalityThresholdExecuted ?? null, fast_transfer: dm.minFinalityThreshold != null ? Number(dm.minFinalityThreshold) <= 1000 : null, cctp_version: m.cctpVersion ?? null, delay_reason: m.delayReason || null, message: m.message, attestation: m.attestation && m.attestation !== "PENDING" ? m.attestation : null }; });
    return ok({ source: DOMN[d] || d, source_domain: d, tx, found: true, count: msgs.length, ready_to_mint: msgs.every((m) => m.attested), messages: msgs, next: "call MessageTransmitter.receiveMessage(message, attestation) on the destination chain" });
  } catch (e) { return err(e); }
}

const CID = { ethereum: 1, optimism: 10, polygon: 137, base: 8453, arbitrum: 42161, linea: 59144, unichain: 130, worldchain: 480, zksync: 324, scroll: 534352 };
const USDC = { 1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 10: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 137: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", 8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 59144: "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", 130: "0x078D782b760474a361dDA0AF3839290b0EF57AD6", 480: "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1" };
const WETH = { 1: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", 10: "0x4200000000000000000000000000000000000006", 8453: "0x4200000000000000000000000000000000000006", 42161: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", 59144: "0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f", 130: "0x4200000000000000000000000000000000000006", 480: "0x4200000000000000000000000000000000000006" };
const cid = (x) => { const s = String(x ?? "").toLowerCase(); return /^\d+$/.test(s) ? Number(s) : CID[s] ?? CID[AL[s]]; };
export async function bridgequote(a) {
  const o = cid(a.from ?? a.origin ?? "base"), dst = cid(a.to ?? a.destination); if (!o || !dst || o === dst) return bad("from and to chains required and different: " + Object.keys(CID).join("|"));
  const asset = String(a.asset ?? "usdc").toLowerCase(); const M = asset === "weth" || asset === "eth" ? WETH : USDC; const dec = M === WETH ? 18 : 6; const it = M[o], ot = M[dst]; if (!it || !ot) return bad(`${asset} not supported on that route`);
  const amt = Number(a.amount ?? 100); if (!(amt > 0)) return bad("amount > 0 required"); const raw = BigInt(Math.round(amt * 10 ** Math.min(dec, 9))) * 10n ** BigInt(dec - Math.min(dec, 9));
  const q = `inputToken=${it}&outputToken=${ot}&originChainId=${o}&destinationChainId=${dst}&amount=${raw}`;
  try { const [f, l] = await Promise.all(["suggested-fees", "limits"].map(async (p) => { const r = await fetch(`https://app.across.to/api/${p}?${q}`, { signal: AbortSignal.timeout(8000) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(`across ${p}: ${j.message || r.status}`); return j; }));
    const fee = BigInt(f.relayGasFeeTotal ?? f.relayerGasFee?.total ?? 0) + BigInt(f.capitalFeeTotal ?? f.relayerCapitalFee?.total ?? 0) + BigInt(f.lpFee?.total ?? 0); const out = raw - fee;
    return ok({ provider: "Across", asset: asset.toUpperCase(), from_chain_id: o, to_chain_id: dst, amount_in: fmt(raw, dec), amount_out: fmt(out > 0n ? out : 0n, dec), total_fee: fmt(fee, dec), fee_pct: +(Number(fee * 1000000n / raw) / 10000).toFixed(4), relay_gas_fee: fmt(BigInt(f.relayGasFeeTotal ?? f.relayerGasFee?.total ?? 0), dec), capital_fee: fmt(BigInt(f.capitalFeeTotal ?? f.relayerCapitalFee?.total ?? 0), dec), lp_fee: fmt(BigInt(f.lpFee?.total ?? 0), dec), est_fill_seconds: f.estimatedFillTimeSec ?? null, amount_too_low: !!f.isAmountTooLow, min_deposit: l.minDeposit ? fmt(BigInt(l.minDeposit), dec) : null, max_deposit_instant: l.maxDepositInstant ? fmt(BigInt(l.maxDepositInstant), dec) : null, max_deposit: l.maxDeposit ? fmt(BigInt(l.maxDeposit), dec) : null, spoke_pool: f.spokePoolAddress || null, quote_timestamp: f.timestamp ? Number(f.timestamp) : null, exclusive_relayer: f.exclusiveRelayer || null, alt: "for USDC also consider CCTP (native burn/mint, no LP fee) — track with /v1/cctpstatus" });
  } catch (e) { return err(e); }
}
