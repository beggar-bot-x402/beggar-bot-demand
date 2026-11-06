// Sticky on-chain enrichment pack 2: /v1/tokeninfo (ERC-20 metadata batch), /v1/nftmeta (ERC-721/1155 token decode),
// /v1/txsummary (tx hash -> status, fee, method, net token flows), /v1/batchdecode (recursive multicall/Safe multiSend/Universal Router decode).
// Keyless public RPC (one batch subrequest, fails soft) or pure compute. Zero paid outbound.
import { keccakHex, checksum, decodeCall } from "./evm.js";
import { decodeLog } from "./evmlog.js";
import { rpcBatch, RPCS, LABELS } from "./walletintel.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const isA = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a.trim());
const ALIAS = { "8453": "base", "eip155:8453": "base", "1": "ethereum", mainnet: "ethereum", eth: "ethereum", "eip155:1": "ethereum", "84532": "base-sepolia", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon" };
export const chainKey = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : ALIAS[s] || null; };
const sel = (s) => keccakHex(s).slice(0, 10);
const w32 = (v) => BigInt(v).toString(16).padStart(64, "0");
const aw = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
const big = (h) => (h && h !== "0x" ? BigInt(h) : 0n);
const label = (a) => LABELS[String(a).toLowerCase()] || null;
const list = (v) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => String(x).trim()).filter(Boolean);
export const fmtUnits = (v, d) => { if (!d) return v.toString(); const neg = v < 0n; if (neg) v = -v; const s = v.toString().padStart(d + 1, "0"); const i = s.slice(0, -d), f = s.slice(-d).replace(/0+$/, ""); return (neg ? "-" : "") + (f ? `${i}.${f}` : i); };
// ABI string return (dynamic string) or legacy bytes32 (MKR-style). null if unparsable.
export function decodeStr(h) {
  if (!h || h === "0x") return null; const x = h.replace(/^0x/, "");
  try {
    if (x.length >= 128) { const off = Number(BigInt("0x" + x.slice(0, 64))); if (off === 32 || off < x.length / 2) { const n = Number(BigInt("0x" + x.slice(off * 2, off * 2 + 64))); if (n <= 1024 && x.length >= off * 2 + 64 + n * 2) return clean(x.slice(off * 2 + 64, off * 2 + 64 + n * 2)); } }
    if (x.length === 64) return clean(x.replace(/(00)+$/, ""));
  } catch {} return null;
}
const clean = (hx) => { const b = Uint8Array.from(hx.match(/../g) || [], (y) => parseInt(y, 16)); return new TextDecoder().decode(b).replace(/\u0000/g, ""); };
const SUSPECT = /[^\x20-\x7e]|https?:|www\.|\.com|\.io|claim|visit|reward|airdrop|t\.me/i;
// ---- 1. /v1/tokeninfo ----
export async function tokeninfo(a) {
  const toks = list(a.tokens ?? a.token ?? a.address); if (!toks.length) return bad("token (or tokens, ≤20 comma list / array) required");
  if (toks.length > 20) return bad("≤20 tokens per call"); const badA = toks.filter((t) => !isA(t)); if (badA.length) return bad("invalid address: " + badA[0]);
  const chain = chainKey(a.chain || a.network); if (!chain) return bad("chain: base (default), ethereum, base-sepolia, optimism, arbitrum, polygon");
  const holder = a.holder || a.owner; if (holder && !isA(holder)) return bad("holder must be an address");
  const calls = []; for (const t of toks) { const c = (d) => ["eth_call", [{ to: t, data: d }, "latest"]]; calls.push(c(sel("name()")), c(sel("symbol()")), c(sel("decimals()")), c(sel("totalSupply()")), ["eth_getCode", [t, "latest"]], c(sel("supportsInterface(bytes4)") + "80ac58cd".padEnd(64, "0")), ...(holder ? [c(sel("balanceOf(address)") + aw(holder))] : [])); }
  const per = holder ? 7 : 6; let res, rpc, live = true, err;
  try { ({ results: res, rpc } = await rpcBatch(chain, calls)); } catch (e) { live = false; err = String(e.message || e).slice(0, 160); }
  const tokens = toks.map((t, i) => {
    const o = { address: checksum(t), label: label(t) }; if (!live) return o; const r = res.slice(i * per, i * per + per);
    const code = r[4]; if (!code || code === "0x") return { ...o, standard: "none", flags: ["NO_CONTRACT_CODE"], verdict: "not a token on this chain" };
    const dec = r[2] && r[2] !== "0x" ? Number(big(r[2])) : null, ts = r[3] && r[3] !== "0x" ? big(r[3]) : null, nft = r[5] && r[5].length >= 66 && big(r[5]) === 1n;
    Object.assign(o, { name: decodeStr(r[0]), symbol: decodeStr(r[1]), decimals: dec, total_supply_raw: ts?.toString() ?? null, total_supply: ts != null && dec != null && dec <= 77 ? fmtUnits(ts, dec) : null, code_bytes: (code.length - 2) / 2, standard: nft ? "erc721" : dec != null && ts != null ? "erc20" : "unknown" });
    if (holder && r[6] && r[6] !== "0x") { const b = big(r[6]); o.holder_balance_raw = b.toString(); o.holder_balance = dec != null && !nft ? fmtUnits(b, dec) : b.toString(); }
    const f = []; if (o.symbol == null) f.push("NO_SYMBOL"); if (dec == null && !nft) f.push("NO_DECIMALS"); if (dec != null && dec > 36) f.push("ABNORMAL_DECIMALS");
    if ([o.name, o.symbol].some((s) => s && SUSPECT.test(s))) f.push("SPAM_LIKE_NAME_OR_URL"); if (ts === 0n) f.push("ZERO_SUPPLY");
    if (code.toLowerCase().startsWith("0x363d3d373d3d3d363d73")) f.push("EIP1167_CLONE"); if (o.code_bytes < 200 && !f.includes("EIP1167_CLONE")) f.push("TINY_BYTECODE_PROXY_OR_STUB");
    const lab = o.label || ""; if (o.symbol && /^(USDC|USDT|WETH|DAI|ETH|WBTC)$/i.test(o.symbol) && !lab) f.push("IMPERSONATES_MAJOR_SYMBOL_UNLABELED");
    o.flags = f; o.verdict = f.includes("IMPERSONATES_MAJOR_SYMBOL_UNLABELED") || f.includes("SPAM_LIKE_NAME_OR_URL") ? "suspicious" : f.length ? "review" : "ok"; return o;
  });
  return { status: 200, body: { chain, live, ...(rpc ? { rpc } : {}), ...(err ? { rpc_error: err, note: "public RPC unreachable; labels only" } : {}), count: tokens.length, tokens } };
}
// ---- 2. /v1/nftmeta ----
export function normUri(u, id) {
  if (!u) return null; let s = String(u).trim(); if (id != null) s = s.replace(/\{id\}/g, BigInt(id).toString(16).padStart(64, "0"));
  const o = { raw: s.length > 300 ? s.slice(0, 300) + "…" : s };
  if (s.startsWith("ipfs://")) { const p = s.slice(7).replace(/^ipfs\//, ""); o.scheme = "ipfs"; o.gateway = "https://ipfs.io/ipfs/" + p; }
  else if (s.startsWith("ar://")) { o.scheme = "arweave"; o.gateway = "https://arweave.net/" + s.slice(5); }
  else if (s.startsWith("data:")) { o.scheme = "data"; const m = s.match(/^data:([^;,]*)(;base64)?,(.*)$/s); if (m) { o.mime = m[1] || "text/plain"; try { const txt = m[2] ? new TextDecoder().decode(Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))) : decodeURIComponent(m[3]); if (/json/.test(o.mime)) { const j = JSON.parse(txt); o.json = { name: j.name, description: typeof j.description === "string" ? j.description.slice(0, 500) : undefined, image: j.image ? normUri(j.image) : undefined, attributes: Array.isArray(j.attributes) ? j.attributes.slice(0, 50) : undefined }; } else o.bytes = txt.length; } catch (e) { o.error = "data uri decode failed"; } } }
  else if (/^https?:\/\//.test(s)) { o.scheme = s.startsWith("https") ? "https" : "http"; o.centralized = true; const m = s.match(/\/ipfs\/(.+)$/); if (m) o.ipfs_path = m[1]; }
  else o.scheme = "unknown"; return o;
}
export async function nftmeta(a) {
  const c = String(a.contract || a.collection || a.address || "").trim(); if (!isA(c)) return bad("contract (0x collection address) required");
  const idS = String(a.token_id ?? a.tokenId ?? a.id ?? "").trim(); if (!/^(0x[0-9a-f]{1,64}|\d{1,78})$/i.test(idS)) return bad("token_id (decimal or 0x hex) required"); const id = BigInt(idS);
  const chain = chainKey(a.chain || a.network); if (!chain) return bad("chain: base (default), ethereum, base-sepolia, optimism, arbitrum, polygon");
  const holder = a.holder || a.owner; if (holder && !isA(holder)) return bad("holder must be an address");
  const k = (d) => ["eth_call", [{ to: c, data: d }, "latest"]];
  const calls = [k(sel("supportsInterface(bytes4)") + "80ac58cd".padEnd(64, "0")), k(sel("supportsInterface(bytes4)") + "d9b67a26".padEnd(64, "0")), k(sel("name()")), k(sel("symbol()")), k(sel("ownerOf(uint256)") + w32(id)), k(sel("tokenURI(uint256)") + w32(id)), k(sel("uri(uint256)") + w32(id)),
    k(sel("royaltyInfo(uint256,uint256)") + w32(id) + w32(10000)), k(sel("totalSupply()")), ...(holder ? [k(sel("balanceOf(address,uint256)") + aw(holder) + w32(id))] : [])];
  const out = { contract: checksum(c), chain, token_id: id.toString(), token_id_hex: "0x" + id.toString(16), label: label(c) };
  try {
    const { results: r, rpc } = await rpcBatch(chain, calls); out.rpc = rpc; out.live = true;
    const is721 = r[0] && big(r[0]) === 1n, is1155 = r[1] && big(r[1]) === 1n; out.standard = is721 ? "erc721" : is1155 ? "erc1155" : r[4] && r[4].length >= 66 ? "erc721_no_erc165" : "unknown";
    out.name = decodeStr(r[2]); out.symbol = decodeStr(r[3]);
    if (r[4] && r[4].length >= 66) { const ow = "0x" + r[4].slice(-40); out.owner = checksum(ow); if (/^0x0{40}$/.test(ow)) out.owner_note = "zero owner (burned or nonexistent)"; if (holder) out.holder_owns = ow.toLowerCase() === holder.toLowerCase(); } else if (is721 || out.standard === "unknown") out.exists = false;
    const uri = decodeStr(r[5]) || decodeStr(r[6]); out.metadata_uri = normUri(uri, is1155 ? id : null);
    if (r[7] && r[7].length >= 130) { const x = r[7].slice(2); const rec = "0x" + x.slice(24, 64), bps = Number(BigInt("0x" + x.slice(64, 128))); out.royalty = { receiver: checksum(rec), bps, percent: bps / 100 }; }
    if (r[8] && r[8] !== "0x") out.total_supply = big(r[8]).toString();
    if (holder && r[9] && r[9] !== "0x") { out.holder_balance = big(r[9]).toString(); out.holder_owns = big(r[9]) > 0n; }
    const f = []; if (out.metadata_uri?.centralized) f.push("CENTRALIZED_METADATA_HTTP"); if (!uri) f.push("NO_TOKEN_URI"); if ([out.name, out.symbol, out.metadata_uri?.json?.name].some((s) => s && SUSPECT.test(s))) f.push("SPAM_LIKE_NAME_OR_URL"); if (out.exists === false) f.push("TOKEN_NOT_FOUND"); out.flags = f;
  } catch (e) { out.live = false; out.rpc_error = String(e.message || e).slice(0, 160); out.note = "public RPC unreachable; ids only"; }
  return { status: 200, body: out };
}
// ---- 3. /v1/txsummary ----
const T_TRANSFER = keccakHex("Transfer(address,address,uint256)");
export function summarizeReceipt(tx, rc, opts = {}) {
  const o = { hash: rc?.transactionHash || tx?.hash, status: rc ? (rc.status === "0x1" ? "success" : "reverted") : "pending", block: rc?.blockNumber ? Number(big(rc.blockNumber)) : null };
  if (tx) { o.from = checksum(tx.from); o.to = tx.to ? checksum(tx.to) : null; o.to_label = tx.to ? label(tx.to) : null; o.value_native = fmtUnits(big(tx.value), 18); o.nonce = Number(big(tx.nonce)); o.type = Number(big(tx.type || "0x0"));
    if (!tx.to) o.contract_created = rc?.contractAddress ? checksum(rc.contractAddress) : true;
    const d = tx.input || tx.data || "0x"; if (d.length >= 10) { const dc = decodeCall(d, opts.sigs); o.method = dc.decoded ? dc.function : dc.selector; if (dc.summary) o.method_summary = dc.summary; } else o.method = "native_transfer"; }
  if (rc) { const gu = big(rc.gasUsed), gp = big(rc.effectiveGasPrice || tx?.gasPrice || "0x0"), l1 = big(rc.l1Fee || "0x0"); o.gas_used = gu.toString(); o.fee_native = fmtUnits(gu * gp + l1, 18); if (l1) o.l1_fee_native = fmtUnits(l1, 18);
    const logs = rc.logs || []; o.log_count = logs.length; const flows = {}, transfers = [], approvals = [], other = {};
    for (const lg of logs.slice(0, 300)) { let d; try { d = decodeLog(lg); } catch { continue; } if (!d.decoded) { other[d.topic0 || "anon"] = (other[d.topic0 || "anon"] || 0) + 1; continue; }
      const A = Object.fromEntries(d.args.map((x) => [x.name, x.value]));
      if (d.event === "Transfer" && lg.topics?.[0] === T_TRANSFER && lg.topics.length === 3) { const tk = d.address, v = BigInt(A.value ?? A.wad ?? 0); transfers.push({ token: tk, from: A.from, to: A.to, raw: v.toString(), ...(d.amount ? { amount: d.amount } : {}) });
        for (const [who, s] of [[A.from, -1n], [A.to, 1n]]) { const key = checksum(who) + "|" + tk; flows[key] = (flows[key] || 0n) + s * v; } }
      else if (d.event === "Transfer" || d.event === "TransferSingle" || d.event === "TransferBatch") transfers.push({ token: d.address, nft: true, event: d.event, from: A.from, to: A.to, id: A.tokenId ?? A.id ?? A.ids });
      else if (d.event === "Approval" || d.event === "ApprovalForAll") approvals.push({ token: d.address, event: d.event, owner: A.owner, spender: A.spender ?? A.operator, ...(d.warning ? { warning: d.warning } : {}) });
      else other[d.event] = (other[d.event] || 0) + 1; }
    o.transfers = transfers.slice(0, 100); o.approvals = approvals; o.other_events = other;
    const net = {}; for (const [k, v] of Object.entries(flows)) { if (!v) continue; const [who, tk] = k.split("|"); (net[who] ||= {})[tk] = v.toString(); } o.net_token_flows_raw = net;
    if (tx) { const me = checksum(tx.from); o.sender_net = net[me] || {}; }
    const f = []; if (o.status === "reverted") f.push("REVERTED"); if (approvals.some((x) => x.warning || x.event === "ApprovalForAll")) f.push("BROAD_APPROVAL_GRANTED"); if (transfers.length > 50) f.push("MANY_TRANSFERS"); o.flags = f;
    o.headline = `${o.status}: ${o.method || "tx"} by ${o.from || "?"}${o.to_label ? " → " + o.to_label : ""}; ${transfers.length} transfer(s), ${approvals.length} approval(s), fee ${o.fee_native}`; }
  return o;
}
export async function txsummary(a) {
  const h = String(a.tx_hash || a.hash || a.tx || "").trim(); const chain = chainKey(a.chain || a.network); if (!chain) return bad("chain: base (default), ethereum, base-sepolia, optimism, arbitrum, polygon");
  const sigs = list(a.sig || a.sigs);
  if (a.receipt) { const rc = typeof a.receipt === "string" ? JSON.parse(a.receipt) : a.receipt; const tx = a.transaction ? (typeof a.transaction === "string" ? JSON.parse(a.transaction) : a.transaction) : null; return { status: 200, body: { chain, live: false, source: "supplied", ...summarizeReceipt(tx, rc, { sigs }) } }; }
  if (!/^0x[0-9a-fA-F]{64}$/.test(h)) return bad("tx_hash (0x 32-byte) required, or supply receipt (+transaction) JSON for offline summary");
  try { const { results: [tx, rc], rpc } = await rpcBatch(chain, [["eth_getTransactionByHash", [h]], ["eth_getTransactionReceipt", [h]]]);
    if (!tx && !rc) return { status: 200, body: { chain, live: true, rpc, hash: h, found: false, note: "not found on this chain (wrong chain? try chain=ethereum)" } };
    return { status: 200, body: { chain, live: true, rpc, found: true, ...summarizeReceipt(tx, rc, { sigs }) } };
  } catch (e) { return { status: 200, body: { chain, hash: h, live: false, rpc_error: String(e.message || e).slice(0, 160), note: "public RPC unreachable; retry or pass receipt JSON" } }; }
}
// ---- 4. /v1/batchdecode ----
const UR = { 0x00: "V3_SWAP_EXACT_IN", 0x01: "V3_SWAP_EXACT_OUT", 0x02: "PERMIT2_TRANSFER_FROM", 0x03: "PERMIT2_PERMIT_BATCH", 0x04: "SWEEP", 0x05: "TRANSFER", 0x06: "PAY_PORTION", 0x08: "V2_SWAP_EXACT_IN", 0x09: "V2_SWAP_EXACT_OUT", 0x0a: "PERMIT2_PERMIT", 0x0b: "WRAP_ETH", 0x0c: "UNWRAP_WETH", 0x0d: "PERMIT2_TRANSFER_FROM_BATCH", 0x0e: "BALANCE_CHECK_ERC20", 0x10: "V4_SWAP", 0x11: "V3_POSITION_MANAGER_PERMIT", 0x12: "V3_POSITION_MANAGER_CALL", 0x13: "V4_INITIALIZE_POOL", 0x14: "V4_POSITION_MANAGER_CALL", 0x21: "EXECUTE_SUB_PLAN" };
const UR_ARGS = { 0x00: "address,uint256,uint256,bytes,bool", 0x01: "address,uint256,uint256,bytes,bool", 0x08: "address,uint256,uint256,address[],bool", 0x09: "address,uint256,uint256,address[],bool", 0x04: "address,address,uint256", 0x05: "address,address,uint256", 0x06: "address,address,uint256", 0x0b: "address,uint256", 0x0c: "address,uint256", 0x02: "address,address,uint160" };
const EXTRA = ["aggregate3Value((address,bool,uint256,bytes)[])", "multiSend(bytes)", "tryBlockAndAggregate(bool,(address,bytes)[])", "blockAndAggregate((address,bytes)[])", "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)", "execute((address,uint256,bytes)[])", "executeBatch(address[],uint256[],bytes[])", "executeBatch((address,uint256,bytes)[])", "execute(address,uint256,bytes)", "multicall(bytes32,bytes[])"];
import { decTuple, norm } from "./evm.js";
const unhex = (h) => Uint8Array.from(String(h).replace(/^0x/, "").match(/../g) || [], (x) => parseInt(x, 16));
const hx = (u) => "0x" + [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
function inner(target, data, depth, sigs, st) {
  st.n++; if (st.n > 200) return { truncated: true };
  const dc = decodeCall(data, [...sigs, ...EXTRA]); const node = { ...(target ? { target: checksum(target), target_label: label(target) } : {}), selector: dc.selector, function: dc.function || null, ...(dc.summary && !/^\w+\(\d+ args\)$/.test(dc.summary) ? { summary: dc.summary } : {}) };
  if (!dc.decoded) { node.decoded = false; return node; } const fn = dc.function, args = dc.args.map((x) => x.value); node.decoded = true;
  if (depth >= 4) { node.args = dc.args; return node; }
  const kids = [];
  if (/^multicall\((uint256,|bytes32,)?bytes\[\]\)$/.test(fn)) for (const d of args[args.length - 1]) kids.push(inner(target, d, depth + 1, sigs, st));
  else if (/^(aggregate|blockAndAggregate)\(/.test(fn)) for (const [t, d] of args[0]) kids.push(inner(t, d, depth + 1, sigs, st));
  else if (/^(tryAggregate|tryBlockAndAggregate)\(/.test(fn)) for (const [t, d] of args[1]) kids.push(inner(t, d, depth + 1, sigs, st));
  else if (fn.startsWith("aggregate3(")) for (const [t, allow, d] of args[0]) kids.push({ allow_failure: allow, ...inner(t, d, depth + 1, sigs, st) });
  else if (fn.startsWith("aggregate3Value(")) for (const [t, allow, v, d] of args[0]) kids.push({ allow_failure: allow, value: String(v), ...inner(t, d, depth + 1, sigs, st) });
  else if (fn === "execute((address,uint256,bytes)[])" || fn === "executeBatch((address,uint256,bytes)[])") for (const [t, v, d] of args[0]) kids.push({ value: String(v), ...inner(t, d, depth + 1, sigs, st) });
  else if (fn === "executeBatch(address[],uint256[],bytes[])") args[0].forEach((t, i) => kids.push({ value: String(args[1][i] ?? 0), ...inner(t, args[2][i], depth + 1, sigs, st) }));
  else if (fn === "execute(address,uint256,bytes)") kids.push({ value: String(args[1]), ...inner(args[0], args[2], depth + 1, sigs, st) });
  else if (fn.startsWith("execTransaction(")) { node.safe = { operation: Number(args[3]) === 1 ? "DELEGATECALL" : "CALL" }; if (Number(args[3]) === 1) (st.flags.add("SAFE_DELEGATECALL")); kids.push({ value: String(args[1]), ...inner(args[0], args[2], depth + 1, sigs, st) }); }
  else if (fn === "multiSend(bytes)") { const b = unhex(args[0]); let i = 0; while (i + 85 <= b.length && kids.length < 100) { const op = b[i], to = hx(b.subarray(i + 1, i + 21)), val = BigInt(hx(b.subarray(i + 21, i + 53))), len = Number(BigInt(hx(b.subarray(i + 53, i + 85)))); const d = hx(b.subarray(i + 85, i + 85 + len)); if (op === 1) st.flags.add("MULTISEND_DELEGATECALL"); kids.push({ operation: op === 1 ? "DELEGATECALL" : "CALL", value: val.toString(), ...(len ? inner(to, d, depth + 1, sigs, st) : { target: checksum(to), target_label: label(to), method: "native_transfer" }) }); i += 85 + len; } }
  else if (/^execute\(bytes,bytes\[\]/.test(fn)) { const cmds = unhex(args[0]); node.universal_router = [...cmds].map((c, i) => { const op = c & 0x3f, nm = UR[op] || "UNKNOWN_0x" + op.toString(16); const r = { command: nm, allow_revert: !!(c & 0x80) }; const ty = UR_ARGS[op]; if (ty && args[1][i]) { try { const tys = ty.split(/,(?![^(]*\))/).map(norm); r.inputs = decTuple(tys, unhex(args[1][i]), 0); } catch { r.inputs_raw_bytes = (args[1][i].length - 2) / 2; } } else if (args[1][i]) r.inputs_raw_bytes = (args[1][i].length - 2) / 2; if (op === 0x0a || op === 0x03) st.flags.add("EMBEDDED_PERMIT2_SIGNATURE"); return r; }); if (args.length > 2) node.deadline = String(args[2]); }
  else { node.args = dc.args; if (/^(approve|setApprovalForAll|increaseAllowance)\(/.test(fn) && /UNLIMITED|GRANT/.test(dc.summary || "")) st.flags.add("BROAD_APPROVAL_INSIDE_BATCH"); if (/^(transfer|transferFrom)\(/.test(fn)) st.transfers++; }
  if (kids.length) node.calls = kids; return node;
}
export async function batchdecode(a) {
  const data = a.data ?? a.calldata ?? a.input; if (!data || !/^0x[0-9a-fA-F]*$/.test(String(data).trim())) return bad("data (0x calldata hex) required; to? = target contract"); if (String(data).length > 400000) return bad("data too long (≤200KB)");
  if (a.to && !isA(a.to)) return bad("to must be an address");
  const st = { n: 0, flags: new Set(), transfers: 0 }; let tree; try { tree = inner(a.to || null, String(data).trim(), 0, list(a.sig || a.sigs), st); } catch (e) { return bad("decode failed: " + e.message); }
  const count = (n) => (n.calls || []).reduce((s, k) => s + 1 + count(k), 0);
  return { status: 200, body: { root: tree, inner_calls: count(tree), nodes_decoded: st.n, direct_token_transfers: st.transfers, flags: [...st.flags], verdict: st.flags.size ? "review: " + [...st.flags].join(", ") : "no high-risk patterns in decoded calls" } };
}
