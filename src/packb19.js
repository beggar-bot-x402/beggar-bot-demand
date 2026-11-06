// packb19 (builder B, 2026-11-02): aanonce, transfersim, paused, tokenbatch. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon", "84532": "base-sepolia" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : AL[s] || null; };
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const csv = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const big = (h) => (h && h.length > 2 ? BigInt(h.length > 66 ? h.slice(0, 66) : h) : null);
const USDC = { base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", ethereum: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", optimism: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", polygon: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e" };
function str(h) {
  if (!h || h === "0x") return null;
  try {
    const b = h.slice(2);
    if (b.length === 64) return new TextDecoder().decode(Uint8Array.from(b.match(/../g), (x) => parseInt(x, 16))).replace(/\0+$/, "") || null;
    const off = Number(BigInt("0x" + b.slice(0, 64))) * 2, len = Number(BigInt("0x" + b.slice(off, off + 64)));
    return new TextDecoder().decode(Uint8Array.from(b.slice(off + 64, off + 64 + len * 2).match(/../g) || [], (x) => parseInt(x, 16)));
  } catch { return null; }
}
const EP = { "v0.7": "0x0000000071727De22E5E9d8BAf0edAc6f37da032", "v0.6": "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", "v0.8": "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" };
export async function aanonce(q) {
  if (!isA(q.sender)) return bad("sender (smart account 0x) required");
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const key = q.key != null ? String(q.key) : "0"; if (!/^(\d+|0x[0-9a-f]+)$/i.test(key)) return bad("key must be integer");
  try {
    const k = pad(BigInt(key).toString(16)), s = pad(q.sender);
    const calls = [["eth_getCode", [q.sender, "latest"]]];
    for (const a of Object.values(EP)) calls.push(["eth_call", [{ to: a, data: "0x35567e1a" + s + k }, "latest"]], ["eth_call", [{ to: a, data: "0x70a08231" + s }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    const eps = Object.keys(EP).map((v, i) => { const n = big(r[1 + 2 * i]), d = big(r[2 + 2 * i]); return { version: v, entrypoint: EP[v], nonce: n != null ? (n & ((1n << 64n) - 1n)).toString() : null, nonce_raw: n != null ? "0x" + n.toString(16) : null, deposit_native: d != null ? Number(d) / 1e18 : null, used: n != null && (n & ((1n << 64n) - 1n)) > 0n }; });
    const active = eps.filter((e) => e.used || (e.deposit_native || 0) > 0).map((e) => e.version);
    return ok({ chain: ch, sender: checksum(q.sender.toLowerCase()), deployed: !!r[0] && r[0] !== "0x", key, entrypoints: eps, active_on: active, next_nonce_hint: "use nonce_raw of the EntryPoint your account targets as UserOperation.nonce", note: "deposit = prefunded gas held by EntryPoint" });
  } catch (e) { return err(e); }
}
export async function transfersim(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const token = q.token && String(q.token).toLowerCase() !== "usdc" ? q.token : USDC[ch];
  if (!isA(token) || !isA(q.from) || !isA(q.to)) return bad("from, to (0x) and token (0x or usdc) required");
  const amt = String(q.amount ?? "1"); if (!/^\d+(\.\d+)?$/.test(amt)) return bad("amount must be decimal");
  try {
    const { results: [dec, bal, code] } = await rpcBatch(ch, [["eth_call", [{ to: token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: token, data: "0x70a08231" + pad(q.from) }, "latest"]], ["eth_getCode", [token, "latest"]]]);
    if (!code || code === "0x") return bad("token has no code on " + ch);
    const d = dec ? Number(BigInt(dec)) : 18; const [w, f = ""] = amt.split("."); const units = BigInt(w) * 10n ** BigInt(d) + BigInt((f + "0".repeat(d)).slice(0, d) || "0");
    const data = "0xa9059cbb" + pad(q.to) + pad(units.toString(16));
    let res = null, revert = null, gas = null;
    for (const url of RPCS[ch]) {
      try {
        const j = await (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: q.from, to: token, data }, "latest"] }, { jsonrpc: "2.0", id: 2, method: "eth_estimateGas", params: [{ from: q.from, to: token, data }] }]) })).json();
        const a = j.find((x) => x.id === 1), g = j.find((x) => x.id === 2);
        if (a.error) { revert = a.error.message || "reverted"; const rd = a.error.data; if (typeof rd === "string" && rd.startsWith("0x08c379a0")) revert = str("0x" + rd.slice(10)) || revert; } else res = a.result;
        gas = g && g.result ? Number(BigInt(g.result)) : null; break;
      } catch (e) { revert = null; }
    }
    const b = bal ? BigInt(bal) : null;
    const success = res != null && (res === "0x" || big(res) === 1n);
    return ok({ chain: ch, token: checksum(token.toLowerCase()), from: q.from, to: q.to, amount: amt, units: units.toString(), decimals: d, from_balance: b != null ? Number(b) / 10 ** d : null, sufficient_balance: b != null ? b >= units : null, would_succeed: success, revert_reason: success ? null : revert || (res != null ? "returned false" : "unknown"), gas_estimate: gas, source: "eth_call simulation at latest block (no tx sent)" });
  } catch (e) { return err(e); }
}
export async function paused(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const list = csv(q.contracts || q.contract || q.tokens || USDC[ch]); if (!list.length || list.length > 20 || !list.every(isA)) return bad("contracts: csv of 0x (max 20)");
  try {
    const calls = []; for (const a of list) calls.push(["eth_call", [{ to: a, data: "0x5c975abb" }, "latest"]], ["eth_call", [{ to: a, data: "0x8da5cb5b" }, "latest"]], ["eth_call", [{ to: a, data: "0x95d89b41" }, "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    const out = list.map((a, i) => { const p = r[3 * i], o = r[3 * i + 1]; return { contract: checksum(a.toLowerCase()), symbol: str(r[3 * i + 2]), pausable: p != null && p.length >= 66, paused: p != null && p.length >= 66 ? BigInt(p.slice(0, 66)) === 1n : null, owner: o && o.length >= 66 ? checksum("0x" + o.slice(26, 66)) : null }; });
    return ok({ chain: ch, any_paused: out.some((x) => x.paused), contracts: out });
  } catch (e) { return err(e); }
}
export async function tokenbatch(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const list = csv(q.tokens || q.token); if (!list.length || list.length > 25 || !list.every(isA)) return bad("tokens: csv of 0x (max 25)");
  if (q.holder && !isA(q.holder)) return bad("holder must be 0x");
  try {
    const calls = []; for (const a of list) { calls.push(["eth_call", [{ to: a, data: "0x06fdde03" }, "latest"]], ["eth_call", [{ to: a, data: "0x95d89b41" }, "latest"]], ["eth_call", [{ to: a, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: a, data: "0x18160ddd" }, "latest"]]); if (q.holder) calls.push(["eth_call", [{ to: a, data: "0x70a08231" + pad(q.holder) }, "latest"]]); }
    const { results: r } = await rpcBatch(ch, calls); const n = q.holder ? 5 : 4;
    const tokens = list.map((a, i) => { const x = r.slice(n * i, n * i + n); const d = x[2] && x[2].length >= 66 ? Number(BigInt(x[2].slice(0, 66))) : null; const ts = big(x[3]); const hb = q.holder ? big(x[4]) : null; const dv = 10 ** (d ?? 18); return { token: checksum(a.toLowerCase()), name: str(x[0]), symbol: str(x[1]), decimals: d, total_supply: ts != null ? Number(ts) / dv : null, is_erc20: d != null && ts != null, ...(q.holder ? { holder_balance: hb != null ? Number(hb) / dv : null } : {}) }; });
    return ok({ chain: ch, count: tokens.length, holder: q.holder || null, tokens });
  } catch (e) { return err(e); }
}
