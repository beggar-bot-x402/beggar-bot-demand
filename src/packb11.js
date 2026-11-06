// packb11 (builder B, 2026-11-02): balanceat, nftowner, mintburn, txfees. $0 upstream (keyless RPCs + DefiLlama coins).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum } from "./evm.js";
import { arch, ARCH, AL, chainOf, blockTime } from "./packb10.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const hx = (n) => "0x" + n.toString(16);
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).filter(Boolean);
const chainR = (c) => { const s = String(c ?? "base").toLowerCase(); const k = RPCS[s] ? s : AL[s]; return k && RPCS[k] ? k : null; };
const fmt = (v, d) => { const neg = v < 0n; if (neg) v = -v; const s = v.toString().padStart(d + 1, "0"); const r = (s.slice(0, -d || undefined) + (d ? "." + s.slice(-d) : "")).replace(/\.?0+$/, ""); return (neg ? "-" : "") + (r || "0"); };
const LL = { base: "base", ethereum: "ethereum", optimism: "optimism", polygon: "polygon", arbitrum: "arbitrum" };
async function llama(path) { const r = await fetch("https://coins.llama.fi" + path, { signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error("llama " + r.status); return r.json(); }

// block at or before unix ts via k-ary search on archive RPC
async function blockAt(c, ts) { const [hb] = await arch(c, [["eth_getBlockByNumber", ["latest", false]]]); let hi = Number(big(hb.number)); if (ts >= Number(big(hb.timestamp))) return hi; let lo = 0;
  for (let r = 0; r < 12 && hi - lo > 1; r++) { const step = Math.max(1, Math.floor((hi - lo) / 7)); const pr = []; for (let b = lo + step; b < hi && pr.length < 6; b += step) pr.push(b); if (!pr.length) break;
    const res = await arch(c, pr.map((b) => ["eth_getBlockByNumber", [hx(b), false]])); let nlo = lo, nhi = hi; for (let i = 0; i < pr.length; i++) { if (Number(big(res[i].timestamp)) > ts) { nhi = pr[i]; break; } nlo = pr[i]; } lo = nlo; hi = nhi; }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; const [b] = await arch(c, [["eth_getBlockByNumber", [hx(m), false]]]); if (Number(big(b.timestamp)) > ts) hi = m; else lo = m; } return lo; }

export async function balanceat(a) {
  const w = a.address || a.wallet; if (!isA(w)) return bad("address required"); const c = chainOf(a.chain, ARCH); if (!c) return bad("chain: base|ethereum|optimism|polygon");
  const toks = list(a.tokens || a.token); if (toks.some((t) => !isA(t) && t !== "native")) return bad("tokens: csv of 0x addresses or 'native'"); if (toks.length > 8) return bad("max 8 tokens");
  const T = toks.length ? toks : ["native"]; let block, ts;
  try {
    if (a.block != null && a.block !== "") block = Number(a.block); else { const d = a.date || a.timestamp || a.time; if (!d) return bad("date (ISO/unix) or block required"); ts = /^\d+$/.test(String(d)) ? Number(d) : Math.floor(Date.parse(d) / 1000); if (!Number.isFinite(ts)) return bad("bad date"); block = await blockAt(c, ts); }
    if (!Number.isInteger(block) || block < 0) return bad("bad block"); const B = hx(block);
    const calls = []; for (const t of T) { if (t === "native") calls.push(["eth_getBalance", [w, B]]); else calls.push(["eth_call", [{ to: t, data: "0x70a08231" + pad(w) }, B]], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]]); }
    calls.push(["eth_getBlockByNumber", [B, false]]); const R = await arch(c, calls); const bts = Number(big(R[R.length - 1].timestamp));
    const keys = T.map((t) => `${LL[c]}:${t === "native" ? (c === "polygon" ? "0x0000000000000000000000000000000000001010" : "0x0000000000000000000000000000000000000000") : t}`);
    let px = {}; try { px = (await llama(`/prices/historical/${bts}/${keys.join(",")}`)).coins || {}; } catch {}
    const sym = (h) => { try { const x = h.slice(2); if (x.length === 64) return new TextDecoder().decode(new Uint8Array(x.match(/../g).map((b) => parseInt(b, 16)).filter((b) => b))); const n = Number(BigInt("0x" + x.slice(64, 128))); return new TextDecoder().decode(new Uint8Array(x.slice(128, 128 + n * 2).match(/../g).map((b) => parseInt(b, 16)))); } catch { return null; } };
    let k = 0, total = 0, priced = true; const out = T.map((t, i) => { let raw, d, s; if (t === "native") { raw = big(R[k++]); d = 18; s = c === "polygon" ? "POL" : "ETH"; } else { raw = big(R[k++]); d = Number(big(R[k++])) || 18; s = sym(R[k++]); }
      const p = px[keys[i]]?.price; const amt = Number(raw) / 10 ** d; const usd = p != null ? +(amt * p).toFixed(2) : null; if (usd == null) priced = false; else total += usd;
      return { token: t === "native" ? "native" : checksum(t), symbol: s, balance: fmt(raw, d), balance_raw: raw.toString(), price_usd_then: p ?? null, value_usd_then: usd }; });
    return ok({ address: checksum(w), chain: c, block, block_time: new Date(bts * 1000).toISOString(), requested_time: ts ? new Date(ts * 1000).toISOString() : null, balances: out, total_usd_then: +total.toFixed(2), all_priced: priced, use: "historical balance snapshot for accounting/tax/audit; prices from DefiLlama at block time" });
  } catch (e) { return err(e); }
}

export async function nftowner(a) {
  const ct = a.contract || a.collection; if (!isA(ct)) return bad("contract required"); const c = chainR(a.chain); if (!c) return bad("unsupported chain");
  const ids = list(a.ids || a.id || a.tokenIds); const holder = a.holder && isA(a.holder) ? a.holder : null; if (!ids.length && !holder) return bad("ids (csv) and/or holder required"); if (ids.length > 25) return bad("max 25 ids"); if (ids.some((i) => !/^\d+$/.test(i))) return bad("ids must be decimal integers");
  const calls = [["eth_call", [{ to: ct, data: "0x01ffc9a7" + pad("80ac58cd") }, "latest"]], ["eth_call", [{ to: ct, data: "0x01ffc9a7" + pad("d9b67a26") }, "latest"]], ["eth_call", [{ to: ct, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: ct, data: "0x18160ddd" }, "latest"]]];
  if (holder) calls.push(["eth_call", [{ to: ct, data: "0x70a08231" + pad(holder) }, "latest"]]);
  for (const i of ids) { const id = pad(BigInt(i).toString(16)); calls.push(["eth_call", [{ to: ct, data: "0x6352211e" + id }, "latest"]], ["eth_call", [{ to: ct, data: "0xc87b56dd" + id }, "latest"]]); if (holder) calls.push(["eth_call", [{ to: ct, data: "0x00fdd58e" + pad(holder) + id }, "latest"]]); }
  let R; try { R = (await rpcBatch(c, calls)).results; } catch (e) { return err(e); }
  const str = (h) => { try { const x = h.slice(2); const n = Number(BigInt("0x" + x.slice(64, 128))); return new TextDecoder().decode(new Uint8Array((x.slice(128, 128 + n * 2).match(/../g) || []).map((b) => parseInt(b, 16)))); } catch { return null; } };
  const is721 = R[0] != null && big(R[0]) === 1n, is1155 = R[1] != null && big(R[1]) === 1n; let k = holder ? 5 : 4;
  const toks = ids.map((i) => { const own = R[k++], uri = R[k++], b1155 = holder ? R[k++] : null; const owner = own && own.length >= 66 ? checksum("0x" + own.slice(-40)) : null; const u = str(uri);
    return { id: i, owner, exists: owner != null || (b1155 != null && is1155), token_uri: u && u.length < 600 ? u : u ? u.slice(0, 600) + "…" : null, holder_owns: holder ? (owner ? owner.toLowerCase() === holder.toLowerCase() : b1155 != null ? big(b1155) > 0n : false) : null, holder_balance_1155: is1155 && b1155 != null ? big(b1155).toString() : null }; });
  return ok({ contract: checksum(ct), chain: c, standard: is721 || toks.some((x) => x.owner) ? "ERC721" : is1155 ? "ERC1155" : "unknown", name: str(R[2]), total_supply: R[3] != null && R[3] !== "0x" ? big(R[3]).toString() : null, holder: holder ? checksum(holder) : null, holder_balance: holder && R[4] != null && !is1155 ? big(R[4]).toString() : null, tokens: toks, use: "token-gating / ownership proof / NFT collateral check" });
}

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef", Z = "0x" + "0".repeat(64);
export async function mintburn(a) {
  const t = a.token || a.address; if (!isA(t)) return bad("token required"); const c = chainR(a.chain); if (!c) return bad("unsupported chain");
  const span = Math.min(40000, Math.max(100, Number(a.blocks) || 10000)), CH = 5000;
  try { const h = await rpcBatch(c, [["eth_blockNumber", []], ["eth_call", [{ to: t, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: t, data: "0x18160ddd" }, "latest"]], ["eth_call", [{ to: t, data: "0x95d89b41" }, "latest"]]]); const head = Number(big(h.results[0])); const d = Number(big(h.results[1])) || 18;
    const calls = []; for (let to = head; to > head - span; to -= CH) { const from = Math.max(to - CH + 1, head - span + 1); calls.push(["eth_getLogs", [{ address: t, fromBlock: hx(from), toBlock: hx(to), topics: [TRANSFER, Z] }]], ["eth_getLogs", [{ address: t, fromBlock: hx(from), toBlock: hx(to), topics: [TRANSFER, null, Z] }]]); }
    const r = await rpcBatch(c, calls); let mint = 0n, burn = 0n, failed = 0; const ev = []; const minters = {};
    r.results.forEach((L, i) => { if (L === null) { failed++; return; } for (const l of L) { if (l.topics.length !== 3) continue; const v = big(l.data); const isMint = i % 2 === 0; if (isMint) { mint += v; const to = "0x" + l.topics[2].slice(26); minters[to] = (minters[to] || 0n) + v; } else burn += v; ev.push({ type: isMint ? "mint" : "burn", amount: fmt(v, d), counterparty: checksum("0x" + l.topics[isMint ? 2 : 1].slice(26)), block: Number(big(l.blockNumber)), tx: l.transactionHash }); } });
    ev.sort((x, y) => y.block - x.block); const sup = big(h.results[2]); const net = mint - burn;
    let sym = null; try { const x = h.results[3].slice(2); const n = Number(BigInt("0x" + x.slice(64, 128))); sym = new TextDecoder().decode(new Uint8Array(x.slice(128, 128 + n * 2).match(/../g).map((b) => parseInt(b, 16)))); } catch {}
    return ok({ token: checksum(t), symbol: sym, chain: c, from_block: head - span + 1, to_block: head, total_supply: fmt(sup, d), minted: fmt(mint, d), burned: fmt(burn, d), net_supply_change: fmt(net, d), net_change_pct: sup > 0n ? +(Number(net * 1000000n / sup) / 10000).toFixed(4) : null, mint_events: ev.filter((e) => e.type === "mint").length, burn_events: ev.filter((e) => e.type === "burn").length, top_mint_recipients: Object.entries(minters).sort((x, y) => (y[1] > x[1] ? 1 : -1)).slice(0, 5).map(([k, v]) => ({ address: checksum(k), amount: fmt(v, d) })), events: ev.slice(0, Math.min(100, Number(a.limit) || 25)), partial: failed ? `${failed}/${calls.length} ranges failed` : false, rpc: r.rpc });
  } catch (e) { return err(e); }
}

const NATIVE = { base: "ethereum", ethereum: "ethereum", optimism: "ethereum", arbitrum: "ethereum", polygon: "polygon-ecosystem-token", "base-sepolia": null };
export async function txfees(a) {
  const hs = list(a.txs || a.hashes || a.tx || a.hash); if (!hs.length) return bad("txs (csv of tx hashes) required"); if (hs.length > 20) return bad("max 20 txs"); if (hs.some((x) => !/^0x[0-9a-fA-F]{64}$/.test(x))) return bad("bad tx hash");
  const c = chainR(a.chain); if (!c) return bad("unsupported chain");
  let R; try { R = (await rpcBatch(c, [["eth_blockNumber", []], ...hs.flatMap((x) => [["eth_getTransactionReceipt", [x]], ["eth_getTransactionByHash", [x]]])])).results; } catch (e) { return err(e); }
  const head = Number(big(R[0])); const blocks = [...new Set(hs.map((_, i) => R[1 + i * 2]?.blockNumber).filter(Boolean))];
  let bts = {}; try { const br = (await rpcBatch(c, blocks.map((b) => ["eth_getBlockByNumber", [b, false]]))).results; blocks.forEach((b, i) => { if (br[i]) bts[b] = Number(big(br[i].timestamp)); }); } catch {}
  const id = NATIVE[c]; let px = {}; if (id) { await Promise.all([...new Set(Object.values(bts))].map(async (ts) => { try { px[ts] = (await llama(`/prices/historical/${ts}/coingecko:${id}`)).coins[`coingecko:${id}`]?.price ?? null; } catch { px[ts] = null; } })); }
  let tw = 0n, tu = 0; const out = hs.map((x, i) => { const rc = R[1 + i * 2], tx = R[2 + i * 2]; if (!rc) return { tx: x, found: !!tx, status: tx ? "pending" : "not_found" };
    const gu = big(rc.gasUsed), gp = big(rc.effectiveGasPrice || tx?.gasPrice), l1 = big(rc.l1Fee), fee = gu * gp + l1; tw += fee; const ts = bts[rc.blockNumber]; const p = ts != null ? px[ts] : null; const usd = p != null ? +(Number(fee) / 1e18 * p).toFixed(6) : null; if (usd) tu += usd;
    return { tx: x, status: rc.status === "0x1" ? "success" : "reverted", block: Number(big(rc.blockNumber)), confirmations: head - Number(big(rc.blockNumber)) + 1, time: ts ? new Date(ts * 1000).toISOString() : null, from: rc.from && checksum(rc.from), to: rc.to ? checksum(rc.to) : null, gas_used: gu.toString(), effective_gas_price_gwei: +(Number(gp) / 1e9).toFixed(6), l2_execution_fee: fmt(gu * gp, 18), l1_data_fee: l1 > 0n ? fmt(l1, 18) : null, total_fee_native: fmt(fee, 18), native_price_usd_then: p, total_fee_usd: usd }; });
  return ok({ chain: c, count: hs.length, total_fee_native: fmt(tw, 18), total_fee_usd: +tu.toFixed(6), txs: out, use: "gas cost accounting / settlement cost reconciliation (OP-stack L1 data fee included)" });
}
