// packb13 (builder B, 2026-11-02): finality, facilitators, gasrunway, admins. $0 upstream (keyless RPCs, public x402 facilitators' /supported).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum } from "./evm.js";
import { AL } from "./packb10.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const chainR = (c) => { const s = String(c ?? "base").toLowerCase(); const k = RPCS[s] ? s : AL[s] || (s === "84532" ? "base-sepolia" : null); return k && RPCS[k] ? k : null; };
const BT = { base: 2, "base-sepolia": 2, optimism: 2, arbitrum: 0.25, polygon: 2, ethereum: 12 };

export async function finality(a) {
  const c = chainR(a.chain); if (!c) return bad("unsupported chain"); const tx = a.tx || a.hash; const blk = a.block;
  if (!tx && blk == null) return bad("tx (hash) or block required"); if (tx && !/^0x[0-9a-fA-F]{64}$/.test(tx)) return bad("bad tx hash");
  const calls = [["eth_getBlockByNumber", ["latest", false]], ["eth_getBlockByNumber", ["safe", false]], ["eth_getBlockByNumber", ["finalized", false]]]; if (tx) calls.push(["eth_getTransactionReceipt", [tx]], ["eth_getTransactionByHash", [tx]]);
  let R; try { R = (await rpcBatch(c, calls)).results; } catch (e) { return err(e); }
  const n = (b) => (b ? Number(big(b.number)) : null); const latest = n(R[0]), safe = n(R[1]), fin = n(R[2]);
  let b = blk != null ? Number(blk) : null, status, rc = null, txo = null;
  if (tx) { rc = R[3]; txo = R[4]; if (!rc) { status = txo ? "pending_mempool" : "not_found"; } else b = Number(big(rc.blockNumber)); }
  if (b != null) { let canon = true; if (rc) { try { const [bb] = (await rpcBatch(c, [["eth_getBlockByNumber", ["0x" + b.toString(16), false]]])).results; canon = !!bb && bb.hash === rc.blockHash; } catch {} }
    status = !canon ? "reorged" : b > latest ? "future" : fin != null && b <= fin ? "finalized" : safe != null && b <= safe ? "safe" : "included_unsafe"; }
  const conf = b != null && latest != null ? latest - b + 1 : null; const toFin = b != null && fin != null && b > fin ? b - fin : 0;
  return ok({ chain: c, tx: tx || null, block: b, status, success: rc ? rc.status === "0x1" : null, confirmations: conf, latest_block: latest, safe_block: safe, finalized_block: fin, blocks_until_finalized: status === "finalized" ? 0 : toFin || null, est_seconds_to_finality: status === "finalized" ? 0 : toFin && BT[c] ? Math.round(toFin * BT[c]) : null, finality_lag_blocks: latest != null && fin != null ? latest - fin : null,
    settle_advice: status === "finalized" ? "final: safe to release goods/credit" : status === "safe" ? "safe head (L1 batch posted / 2 epochs): low reorg risk" : status === "included_unsafe" ? "included but unsafe: ok for micro-payments, wait for safe for larger amounts" : status === "reorged" ? "receipt block no longer canonical — re-check" : "not yet included" });
}

const FAC = { "x402.org": "https://x402.org/facilitator", payai: "https://facilitator.payai.network", "x402.rs": "https://facilitator.x402.rs", daydreams: "https://facilitator.daydreams.systems", dexter: "https://x402.dexter.cash", corbits: "https://facilitator.corbits.dev", mogami: "https://v2.facilitator.mogami.tech", openx402: "https://open.x402.host", heurist: "https://facilitator.heurist.xyz", thirdweb: "https://api.thirdweb.com/v1/payments/x402", "questflow": "https://facilitator.questflow.ai", "kobaru": "https://gateway.kobaru.io" };
const NETS = { base: "eip155:8453", "base-sepolia": "eip155:84532", polygon: "eip155:137", avalanche: "eip155:43114", "avalanche-fuji": "eip155:43113", sei: "eip155:1329", iotex: "eip155:4689", ethereum: "eip155:1", arbitrum: "eip155:42161", optimism: "eip155:10", solana: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp", "solana-devnet": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1" };
const canon = (n) => NETS[n] || n;
export async function facilitators(a) {
  const want = a.network ? canon(String(a.network).toLowerCase()) : null; const scheme = a.scheme ? String(a.scheme).toLowerCase() : null;
  const res = await Promise.all(Object.entries(FAC).map(async ([name, url]) => { const t = Date.now(); try { const r = await fetch(url + "/supported", { signal: AbortSignal.timeout(6000), headers: { accept: "application/json" } }); const ms = Date.now() - t; if (!r.ok) return { name, url, up: false, http: r.status, latency_ms: ms };
    const j = await r.json(); const kinds = (j.kinds || []).map((k) => ({ v: k.x402Version, scheme: k.scheme, network: canon(k.network), fee_payer: k.extra?.feePayer || null })); const nets = [...new Set(kinds.map((k) => k.network))]; const schemes = [...new Set(kinds.map((k) => k.scheme))]; const vers = [...new Set(kinds.map((k) => k.v))];
    const match = kinds.filter((k) => (!want || k.network === want) && (!scheme || k.scheme === scheme)); return { name, url, up: true, latency_ms: ms, x402_versions: vers, schemes, networks: nets, network_count: nets.length, supports_query: want || scheme ? match.length > 0 : null, signers: j.signers || null, extensions: j.extensions || null }; } catch (e) { return { name, url, up: false, error: String(e.message).slice(0, 80), latency_ms: Date.now() - t }; } }));
  const up = res.filter((x) => x.up); const sel = want || scheme ? up.filter((x) => x.supports_query) : up; sel.sort((x, y) => x.latency_ms - y.latency_ms);
  return ok({ checked: res.length, up: up.length, query: { network: want, scheme }, best: sel[0] ? { name: sel[0].name, url: sel[0].url, latency_ms: sel[0].latency_ms } : null, matching: sel.map((x) => x.name), facilitators: res.sort((x, y) => (y.up - x.up) || x.latency_ms - y.latency_ms), checked_at: new Date().toISOString(), note: "live /supported probe; pick a facilitator that supports your network+scheme with lowest latency" });
}

const GAS = { native_transfer: 21000, erc20_transfer: 65000, swap: 180000, x402_settle: 90000 };
const L1EST = { base: 2e-7, optimism: 2e-7, "base-sepolia": 0, arbitrum: 0, polygon: 0, ethereum: 0 };
export async function gasrunway(a) {
  const w = a.address || a.wallet; if (!isA(w)) return bad("address required"); const chains = (a.chains ? String(a.chains).split(/[\s,]+/) : ["base", "ethereum", "optimism", "arbitrum", "polygon"]).map(chainR).filter(Boolean); if (!chains.length) return bad("no supported chains");
  const per = Number(a.daily_txs || a.dailyTxs || 0); const kind = GAS[a.kind] ? a.kind : "erc20_transfer";
  const out = await Promise.all([...new Set(chains)].map(async (c) => { try { const r = (await rpcBatch(c, [["eth_getBalance", [w, "latest"]], ["eth_gasPrice", []], ["eth_maxPriorityFeePerGas", []]])).results; const bal = big(r[0]), gp = big(r[1]) + (r[2] ? 0n : 0n);
    const costs = Object.fromEntries(Object.entries(GAS).map(([k, g]) => [k, Number(gp * BigInt(g)) / 1e18 + (L1EST[c] || 0) * (g / 65000)])); const each = costs[kind]; const n = each > 0 ? Math.floor(Number(bal) / 1e18 / each) : null;
    return { chain: c, native: c === "polygon" ? "POL" : "ETH", balance: (Number(bal) / 1e18).toString(), gas_price_gwei: +(Number(gp) / 1e9).toFixed(6), cost_native: Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, +v.toPrecision(4)])), txs_remaining: n, days_remaining: per > 0 && n != null ? +(n / per).toFixed(1) : null, status: n == null ? "unknown" : n === 0 ? "empty" : n < 10 ? "critical" : n < 100 ? "low" : "ok" }; } catch (e) { return { chain: c, error: String(e.message).slice(0, 80) }; } }));
  const low = out.filter((x) => x.status === "empty" || x.status === "critical").map((x) => x.chain);
  return ok({ address: checksum(w), kind, daily_txs: per || null, chains: out, needs_topup: low, note: "runway = native balance / (gas price x typical gas" + " + est. L1 data fee on OP-stack). Use to alert before an agent wallet runs dry." });
}

const sel = (s) => s; const CALLS = { owner: "0x8da5cb5b", pendingOwner: "0xe30c3978", admin: "0xf851a440", paused: "0x5c975abb", getMinDelay: "0xf27a0c92", getThreshold: "0xe75235b8", getOwners: "0xa0e67e2b", masterMinter: "0x35d99f35", pauser: "0x9fd0506d", blacklister: "0xbd102430", rescuer: "0x38a63183", guardian: "0x452a9320" };
const ROLE0 = "0x" + "0".repeat(64);
export async function admins(a) {
  const ct = a.contract || a.address; if (!isA(ct)) return bad("contract required"); const c = chainR(a.chain); if (!c) return bad("unsupported chain");
  const names = Object.keys(CALLS); const calls = names.map((k) => ["eth_call", [{ to: ct, data: CALLS[k] }, "latest"]]);
  calls.push(["eth_call", [{ to: ct, data: "0xca15c873" + pad(ROLE0) }, "latest"]], ["eth_getStorageAt", [ct, "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103", "latest"]], ["eth_getStorageAt", [ct, "0x10d6a54a4754c8869d6886b5f5d7fbfa5b4522237ea5c60d11bc4e7a1ff9390b", "latest"]], ["eth_getCode", [ct, "latest"]]);
  let R; try { R = (await rpcBatch(c, calls)).results; } catch (e) { return err(e); }
  if (!R[R.length - 1] || R[R.length - 1] === "0x") return ok({ contract: checksum(ct), chain: c, is_contract: false });
  const addr = (h) => (h && h.length === 66 && h.slice(2, 26) === "0".repeat(24) && big(h) > 0n ? checksum("0x" + h.slice(-40)) : null);
  const v = Object.fromEntries(names.map((k, i) => [k, R[i]])); const roles = {}; for (const k of ["owner", "pendingOwner", "admin", "masterMinter", "pauser", "blacklister", "rescuer", "guardian"]) { const x = addr(v[k]); if (x) roles[k] = x; }
  const pa = addr(R[names.length + 1]) || addr(R[names.length + 2]); if (pa) roles.proxy_admin = pa; const admCount = R[names.length] && R[names.length] !== "0x" ? Number(big(R[names.length])) : null;
  let defaultAdmins = null; if (admCount) { try { const rr = (await rpcBatch(c, Array.from({ length: Math.min(admCount, 5) }, (_, i) => ["eth_call", [{ to: ct, data: "0x9010d07c" + pad(ROLE0) + pad(i.toString(16)) }, "latest"]]))).results; defaultAdmins = rr.map(addr).filter(Boolean); } catch {} }
  const uniq = [...new Set([...Object.values(roles), ...(defaultAdmins || [])])].slice(0, 8);
  let info = []; if (uniq.length) { try { const rr = (await rpcBatch(c, uniq.flatMap((x) => [["eth_getCode", [x, "latest"]], ["eth_call", [{ to: x, data: CALLS.getThreshold }, "latest"]], ["eth_call", [{ to: x, data: CALLS.getOwners }, "latest"]], ["eth_call", [{ to: x, data: CALLS.getMinDelay }, "latest"]]]))).results;
    info = uniq.map((x, i) => { const code = rr[i * 4]; const th = rr[i * 4 + 1], ow = rr[i * 4 + 2], md = rr[i * 4 + 3]; const isC = !!code && code !== "0x" && !code.startsWith("0xef0100"); let owners = null; try { if (ow && ow.length > 130) { const n = Number(BigInt("0x" + ow.slice(66, 130))); owners = Array.from({ length: Math.min(n, 20) }, (_, j) => checksum("0x" + ow.slice(130 + j * 64 + 24, 130 + (j + 1) * 64))); } } catch {}
      const kind = !isC ? "EOA" : th && th !== "0x" && owners ? "Safe multisig" : md && md !== "0x" ? "Timelock" : "contract";
      return { address: x, kind, threshold: kind === "Safe multisig" ? `${Number(big(th))}/${owners.length}` : null, signers: kind === "Safe multisig" ? owners : null, timelock_delay_s: kind === "Timelock" ? Number(big(md)) : null }; }); } catch {} }
  const k = Object.fromEntries(info.map((x) => [x.address, x])); const flags = [];
  for (const [r, x] of Object.entries(roles)) if (k[x]?.kind === "EOA" && ["owner", "admin", "proxy_admin", "masterMinter"].includes(r)) flags.push(`${r}_is_EOA`);
  if (v.paused && v.paused !== "0x" && big(v.paused) === 1n) flags.push("currently_paused"); if (v.pendingOwner && addr(v.pendingOwner)) flags.push("ownership_transfer_pending");
  if (!Object.keys(roles).length && !defaultAdmins?.length) flags.push("no_detectable_admin (renounced or custom)");
  return ok({ contract: checksum(ct), chain: c, roles, default_admins: defaultAdmins, default_admin_count: admCount, paused: v.paused && v.paused !== "0x" ? big(v.paused) === 1n : null, own_timelock_delay_s: v.getMinDelay && v.getMinDelay !== "0x" ? Number(big(v.getMinDelay)) : null, controllers: info, risk_flags: flags, use: "who can upgrade/pause/mint/blacklist — admin-key centralization check before integrating or accepting a token" });
}
