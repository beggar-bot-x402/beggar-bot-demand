// packb14 (builder B, 2026-11-02): blockbytime, supplyat, codematch, l1fee. $0 upstream (keyless archive RPCs).
import { arch, ARCH, chainOf, blockTime } from "./packb10.js";
import { rpcBatch, RPCS } from "./walletintel.js";
import { keccak } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const hx = (n) => "0x" + BigInt(n).toString(16);
const toTs = (t) => { if (t == null || t === "") return null; if (/^\d+$/.test(String(t))) { const n = Number(t); return n > 1e12 ? Math.floor(n / 1000) : n; } const d = Date.parse(t); return isNaN(d) ? null : Math.floor(d / 1000); };

async function findBlock(c, ts) {
  const [lb] = await arch(c, [["eth_getBlockByNumber", ["latest", false]]]); let hi = Number(big(lb.number)); const hiT = Number(big(lb.timestamp));
  if (ts >= hiT) return { block: hi, ts: hiT, steps: 1 };
  let lo = 0, loT = await blockTime(c, 1) ?? 0, steps = 2, hT = hiT;
  while (hi - lo > 1 && steps < 40) { // interpolation then bisection
    let m = Math.floor(lo + (hi - lo) * (ts - loT) / Math.max(1, hT - loT)); if (m <= lo || m >= hi) m = Math.floor((lo + hi) / 2);
    const mt = await blockTime(c, m); steps++; if (mt == null) throw new Error("block fetch failed");
    if (mt <= ts) { lo = m; loT = mt; } else { hi = m; hT = mt; }
    if (steps > 12 && hi - lo > 2) { const mm = Math.floor((lo + hi) / 2); const t2 = await blockTime(c, mm); steps++; if (t2 <= ts) { lo = mm; loT = t2; } else { hi = mm; hT = t2; } }
  }
  return { block: lo, ts: loT, steps };
}
export async function blockbytime(a) {
  const c = chainOf(a.chain, ARCH); if (!c) return bad("unsupported chain (base|ethereum|optimism|polygon)");
  const ts = toTs(a.time ?? a.timestamp ?? a.date); if (ts == null) return bad("time required (unix seconds/ms or ISO date)");
  try { const r = await findBlock(c, ts); return ok({ chain: c, query_time: ts, query_iso: new Date(ts * 1000).toISOString(), block: r.block, block_time: r.ts, block_iso: new Date(r.ts * 1000).toISOString(), delta_seconds: ts - r.ts, rpc_lookups: r.steps, note: "last block with timestamp <= query time" }); } catch (e) { return err(e); }
}

const SEL = { totalSupply: "0x18160ddd", decimals: "0x313ce567", symbol: "0x95d89b41", balanceOf: "0x70a08231" };
const str = (h) => { try { if (!h || h === "0x") return null; const b = h.slice(2); if (b.length >= 128) { const len = parseInt(b.slice(64, 128), 16); return Buffer.from(b.slice(128, 128 + len * 2), "hex").toString("utf8"); } return Buffer.from(b, "hex").toString("utf8").replace(/\0/g, ""); } catch { return null; } };
export async function supplyat(a) {
  const c = chainOf(a.chain, ARCH); if (!c) return bad("unsupported chain"); const t = a.token || a.contract; if (!isA(t)) return bad("token (0x address) required");
  const bl = String(a.blocks ?? a.block ?? "latest").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 6); if (!bl.length) return bad("blocks required");
  try {
    const [dec, sym] = await arch(c, [["eth_call", [{ to: t, data: SEL.decimals }, "latest"]], ["eth_call", [{ to: t, data: SEL.symbol }, "latest"]]]); const d = Number(big(dec) || 18n);
    const tags = bl.map((b) => (/^\d+$/.test(b) ? hx(b) : b)); const res = await arch(c, tags.map((g) => ["eth_call", [{ to: t, data: SEL.totalSupply }, g]]));
    const pts = tags.map((g, i) => ({ block: bl[i], raw: res[i] ? big(res[i]).toString() : null, supply: res[i] ? Number(big(res[i])) / 10 ** d : null }));
    const v = pts.filter((p) => p.supply != null); const chg = v.length > 1 ? v[v.length - 1].supply - v[0].supply : null;
    return ok({ chain: c, token: t, symbol: str(sym), decimals: d, points: pts, change: chg, change_pct: chg != null && v[0].supply ? +(chg / v[0].supply * 100).toFixed(4) : null });
  } catch (e) { return err(e); }
}

export async function codematch(a) {
  const ad = a.address || a.contract; if (!isA(ad)) return bad("address required");
  const chains = String(a.chains || "base,ethereum,optimism,arbitrum,polygon").split(",").map((s) => chainOf(s.trim(), RPCS)).filter(Boolean).slice(0, 6);
  const out = await Promise.all(chains.map(async (c) => { try { const { results: [code] } = await rpcBatch(c, [["eth_getCode", [ad, "latest"]]]); const has = code && code !== "0x"; return { chain: c, deployed: !!has, code_bytes: has ? (code.length - 2) / 2 : 0, code_hash: has ? "0x" + Buffer.from(keccak(Buffer.from(code.slice(2), "hex"))).toString("hex") : null, eip7702: has && /^0xef0100/i.test(code) ? "0x" + code.slice(8, 48) : null }; } catch (e) { return { chain: c, error: String(e.message || e) }; } }));
  const hashes = [...new Set(out.filter((o) => o.code_hash).map((o) => o.code_hash))];
  return ok({ address: ad, chains: out, deployed_on: out.filter((o) => o.deployed).map((o) => o.chain), identical_everywhere: hashes.length === 1 && out.filter((o) => o.deployed).length > 1, distinct_code_hashes: hashes.length, warning: hashes.length > 1 ? "same address has DIFFERENT code on some chains — verify source (can also be chain-specific immutables like chainId/domain separator)" : null });
}

const GPO = "0x420000000000000000000000000000000000000F";
export async function l1fee(a) {
  const c = chainOf(a.chain, { base: 1, optimism: 1, "base-sepolia": 1 }) || (String(a.chain || "").includes("sepolia") ? "base-sepolia" : null); if (!c) return bad("OP-stack chain required (base|optimism|base-sepolia)");
  let data = a.data || a.tx_data; const kind = a.kind || "erc20_transfer";
  if (!data) data = kind === "native_transfer" ? "0x02f87082210580830f4240830f4240825208" + "00".repeat(60) : "0x02f8b08221058083" + "00".repeat(160);
  if (!/^0x[0-9a-fA-F]*$/.test(data)) return bad("data must be hex (unsigned/signed tx bytes)");
  const enc = (sel) => sel + "0000000000000000000000000000000000000000000000000000000000000020" + BigInt((data.length - 2) / 2).toString(16).padStart(64, "0") + data.slice(2).padEnd(Math.ceil((data.length - 2) / 64) * 64, "0");
  try {
    const { results: R } = await rpcBatch(c, [["eth_call", [{ to: GPO, data: enc("0x49948e0e") }, "latest"]], ["eth_gasPrice", []], ["eth_call", [{ to: GPO, data: "0x519b4bd3" }, "latest"]], ["eth_call", [{ to: GPO, data: "0xf8206140" }, "latest"]]]);
    const l1 = big(R[0]); const gp = big(R[1]); const l2gas = kind === "native_transfer" ? 21000n : kind === "swap" ? 150000n : 65000n; const l2 = l2gas * gp;
    const eth = (w) => Number(w) / 1e18;
    return ok({ chain: c, kind, tx_bytes: (data.length - 2) / 2, l1_fee_eth: eth(l1), l2_execution_fee_eth: eth(l2), total_fee_eth: eth(l1 + l2), l1_share_pct: l1 + l2 > 0n ? +(Number(l1) / Number(l1 + l2) * 100).toFixed(2) : null, l2_gas_price_gwei: Number(gp) / 1e9, l1_base_fee_gwei: R[2] ? Number(big(R[2])) / 1e9 : null, blob_base_fee_gwei: R[3] ? Number(big(R[3])) / 1e9 : null });
  } catch (e) { return err(e); }
}
