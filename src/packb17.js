// packb17 (builder B, 2026-11-02): sig1271, compound, create2, feedhealth. $0 upstream (keyless RPCs; Chainlink + Compound v3 on-chain).
import { rpcBatch, RPCS } from "./walletintel.js";
import { chainOf } from "./packb10.js";
import { keccak, checksum } from "./evm.js";
import { typedDigest, recoverAddress } from "./sig.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const pad = (h) => String(h).replace(/^0x/, "").toLowerCase().padStart(64, "0");
const word = (h, i) => (h && h.length >= 2 + 64 * (i + 1) ? BigInt("0x" + h.slice(2 + 64 * i, 2 + 64 * (i + 1))) : null);
const te = new TextEncoder();
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h).trim().replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const M6492 = "6492649264926492649264926492649264926492649264926492649264926492";

export async function sig1271(a) {
  const ad = a.address || a.signer; if (!isA(ad)) return bad("address (wallet) required"); const sig = String(a.signature || a.sig || ""); if (!/^0x[0-9a-fA-F]+$/.test(sig)) return bad("signature (0x hex) required");
  const c = chainOf(a.chain, RPCS) || null; if (!c) return bad("unsupported chain");
  let h, mode;
  try { if (a.hash) { h = unhex(a.hash); mode = "raw_hash"; if (h.length !== 32) return bad("hash must be 32 bytes"); }
    else if (a.typed_data) { h = typedDigest(typeof a.typed_data === "string" ? a.typed_data : JSON.stringify(a.typed_data)).digest; mode = "eip712_typed_data"; }
    else if (a.message != null) { const m = /^0x([0-9a-f]{2})*$/i.test(String(a.message)) && a.encoding !== "utf8" ? unhex(a.message) : te.encode(String(a.message)); h = keccak(cat(te.encode("\x19Ethereum Signed Message:\n" + m.length), m)); mode = "eip191_personal_sign"; }
    else return bad("one of hash, message or typed_data required"); } catch (e) { return bad(e.message); }
  const digest = "0x" + hex(h); const is6492 = sig.toLowerCase().endsWith(M6492);
  try {
    const { results: [code] } = await rpcBatch(c, [["eth_getCode", [ad, "latest"]]]); const deployed = !!code && code !== "0x"; const delegated = deployed && /^0xef0100/i.test(code);
    let eoa = null; if (!is6492 && (sig.length === 132 || sig.length === 130)) { try { const r = recoverAddress(h, sig); eoa = r.address; } catch {} }
    let r1271 = null, magic = null;
    if (deployed && !is6492) { const s = sig.slice(2); const len = s.length / 2; const data = "0x1626ba7e" + pad(digest) + pad("40") + pad(len.toString(16)) + s.padEnd(Math.ceil(s.length / 64) * 64, "0"); const { results: [res] } = await rpcBatch(c, [["eth_call", [{ to: ad, data }, "latest"]]]); magic = res ? res.slice(0, 10) : null; r1271 = magic === "0x1626ba7e"; }
    const eoaMatch = eoa ? eoa.toLowerCase() === ad.toLowerCase() : null;
    const valid = r1271 === true || (eoaMatch === true && (!deployed || delegated));
    return ok({ address: ad, chain: c, mode, digest, account_type: !deployed ? "eoa_or_undeployed" : delegated ? "eip7702_delegated_eoa" : "contract", valid, method: r1271 ? "eip1271" : eoaMatch ? "ecrecover" : null, eip1271_result: r1271, eip1271_return: magic, ecrecover_signer: eoa, erc6492_wrapped: is6492, note: is6492 && !deployed ? "ERC-6492 counterfactual signature: wallet not deployed; validate via universal validator after deploy" : null });
  } catch (e) { return err(e); }
}

const COMETS = { base: { USDC: "0xb125E6687d4313864e53df431d5425969c15Eb2F", WETH: "0x46e6b214b524310239732D51387075E0e70970bf", USDbC: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf" }, ethereum: { USDC: "0xc3d688B66703497DAA19211EEdff47f25384cdc3", WETH: "0xA17581A9E3356d9A858b789D68B4d866e593aE94", USDT: "0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840" }, arbitrum: { USDC: "0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf", "USDC.e": "0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA" }, optimism: { USDC: "0x2e44e174f7D53F0212823acC11C01A11d58c5bCB" }, polygon: { USDC: "0xF25212E676D1F7F89Cd72fFEe66158f541246445" } };
const YEAR = 31536000;
export async function compound(a) {
  const c = chainOf(a.chain, COMETS); if (!c) return bad("chain: base|ethereum|arbitrum|optimism|polygon"); const user = a.address; if (user && !isA(user)) return bad("bad address");
  const mk = Object.entries(COMETS[c]).filter(([k]) => !a.market || k.toLowerCase() === String(a.market).toLowerCase()); if (!mk.length) return bad("market one of " + Object.keys(COMETS[c]).join(","));
  try {
    const out = await Promise.all(mk.map(async ([name, cm]) => {
      const calls = [["eth_call", [{ to: cm, data: "0x7eb71131" }, "latest"]], ["eth_call", [{ to: cm, data: "0x18160ddd" }, "latest"]], ["eth_call", [{ to: cm, data: "0x8285ef40" }, "latest"]], ["eth_call", [{ to: cm, data: "0x313ce567" }, "latest"]]];
      if (user) calls.push(["eth_call", [{ to: cm, data: "0x70a08231" + pad(user) }, "latest"]], ["eth_call", [{ to: cm, data: "0x374c49b4" + pad(user) }, "latest"]]);
      const { results: R } = await rpcBatch(c, calls); const util = big(R[0]); const dec = Number(big(R[3])) || 6;
      const { results: [sr, br] } = await rpcBatch(c, [["eth_call", [{ to: cm, data: "0xd955759d" + pad(util.toString(16)) }, "latest"]], ["eth_call", [{ to: cm, data: "0x9fa83b5a" + pad(util.toString(16)) }, "latest"]]]);
      const apr = (r) => (r ? +(Number(big(r)) * YEAR / 1e18 * 100).toFixed(3) : null);
      const o = { market: name, comet: cm, utilization_pct: +(Number(util) / 1e16).toFixed(2), supply_apr_pct: apr(sr), borrow_apr_pct: apr(br), total_supply: Number(big(R[1])) / 10 ** dec, total_borrow: Number(big(R[2])) / 10 ** dec };
      if (user) { o.user_supplied = Number(big(R[4])) / 10 ** dec; o.user_borrowed = Number(big(R[5])) / 10 ** dec; }
      return o; }));
    return ok({ chain: c, address: user || null, markets: out, source: "Compound v3 Comet on-chain" });
  } catch (e) { return err(e); }
}

const rlpB = (b) => (b.length === 1 && b[0] < 0x80 ? b : cat(Uint8Array.of(0x80 + b.length), b));
const rlpN = (n) => { if (n === 0n) return Uint8Array.of(0x80); let h = n.toString(16); if (h.length % 2) h = "0" + h; return rlpB(unhex(h)); };
export async function create2(a) {
  const d = a.deployer || a.sender || a.factory; if (!isA(d)) return bad("deployer (0x address) required");
  let addr, mode, extra = {};
  try {
    if (a.salt != null) { const salt = unhex(pad(String(a.salt).startsWith("0x") ? a.salt : BigInt(a.salt).toString(16))); let ih;
      if (a.init_code_hash) { ih = unhex(a.init_code_hash); if (ih.length !== 32) return bad("init_code_hash must be 32 bytes"); } else if (a.init_code) ih = keccak(unhex(a.init_code)); else return bad("init_code or init_code_hash required with salt");
      addr = keccak(cat(Uint8Array.of(0xff), unhex(d), salt, ih)).slice(12); mode = "create2"; extra = { salt: "0x" + hex(salt), init_code_hash: "0x" + hex(ih) }; }
    else { if (a.nonce == null || !/^\d+$/.test(String(a.nonce))) return bad("nonce (for CREATE) or salt+init_code(_hash) (for CREATE2) required"); const body = cat(rlpB(unhex(d)), rlpN(BigInt(a.nonce))); addr = keccak(cat(Uint8Array.of(0xc0 + body.length), body)).slice(12); mode = "create"; extra = { nonce: Number(a.nonce) }; }
  } catch (e) { return bad(e.message); }
  const A = checksum("0x" + hex(addr)); let deployed = null;
  const cs = String(a.check_chains || "").split(",").map((s) => chainOf(s.trim(), RPCS)).filter(Boolean).slice(0, 5);
  if (cs.length) deployed = Object.fromEntries(await Promise.all(cs.map(async (c) => { try { const { results: [code] } = await rpcBatch(c, [["eth_getCode", [A, "latest"]]]); return [c, !!code && code !== "0x"]; } catch { return [c, null]; } })));
  return ok({ mode, deployer: d, address: A, ...extra, deployed });
}

const FEEDS = { ethereum: { "ETH/USD": ["0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", 3600], "BTC/USD": ["0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", 3600], "USDC/USD": ["0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6", 86400], "USDT/USD": ["0x3E7d1eAB13ad0104d2750B8863b489D65364e32D", 86400], "LINK/USD": ["0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c", 3600], "DAI/USD": ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9", 3600], "stETH/USD": ["0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8", 3600] }, base: { "ETH/USD": ["0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", 1200], "USDC/USD": ["0x7e860098F58bBFC8648a4311b374B1D669a2bc6B", 86400], "BTC/USD": ["0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F", 1200] } };
export async function feedhealth(a) {
  const c = chainOf(a.chain || "ethereum", FEEDS); if (!c) return bad("chain: ethereum|base");
  let list = Object.entries(FEEDS[c]); if (isA(a.feed)) list = [["custom", [a.feed, Number(a.heartbeat) || 3600]]];
  try {
    const { results: R } = await rpcBatch(c, list.flatMap(([, [f]]) => [["eth_call", [{ to: f, data: "0xfeaf968c" }, "latest"]], ["eth_call", [{ to: f, data: "0x313ce567" }, "latest"]]]));
    const now = Math.floor(Date.now() / 1000);
    const feeds = list.map(([p, [f, hb]], i) => { const r = R[2 * i], dec = Number(big(R[2 * i + 1])); const ans = word(r, 1), upd = word(r, 3); const age = upd != null ? now - Number(upd) : null; const s = age == null ? "unreachable" : age > hb * 1.5 ? "stale" : age > hb ? "late" : "fresh";
      return { pair: p, feed: f, price: ans != null ? Number(ans) / 10 ** dec : null, updated_at: upd != null ? new Date(Number(upd) * 1000).toISOString() : null, age_seconds: age, heartbeat_seconds: hb, status: s }; });
    return ok({ chain: c, checked_at: new Date(now * 1000).toISOString(), feeds, unhealthy: feeds.filter((x) => x.status !== "fresh").map((x) => x.pair) });
  } catch (e) { return err(e); }
}
