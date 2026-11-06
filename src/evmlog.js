// /v1/evmlog: EVM event log decoder (topics + data -> named event), pure compute, zero outbound. Accepts one log or a receipt's logs[] (eth_getTransactionReceipt JSON the caller already has).
import { keccak, checksum, norm, decTuple, parseSig } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const te = new TextEncoder(), hex = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join("");
const unhex = (h) => { h = String(h).trim().replace(/^0x/i, ""); if (h.length % 2 || /[^0-9a-f]/i.test(h)) throw new Error("invalid hex"); return Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)); };
// "Name(type [indexed] name, ...)"
export const KNOWN_EVENTS = [
  "Transfer(address indexed from,address indexed to,uint256 value)", "Approval(address indexed owner,address indexed spender,uint256 value)",
  "Transfer(address indexed from,address indexed to,uint256 indexed tokenId)", "Approval(address indexed owner,address indexed approved,uint256 indexed tokenId)",
  "ApprovalForAll(address indexed owner,address indexed operator,bool approved)",
  "TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)", "TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values)",
  "Deposit(address indexed dst,uint256 wad)", "Withdrawal(address indexed src,uint256 wad)",
  "Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)", "Sync(uint112 reserve0,uint112 reserve1)",
  "Mint(address indexed sender,uint256 amount0,uint256 amount1)", "Burn(address indexed sender,uint256 amount0,uint256 amount1,address indexed to)", "PairCreated(address indexed token0,address indexed token1,address pair,uint256 index)",
  "Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)",
  "PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)",
  "OwnershipTransferred(address indexed previousOwner,address indexed newOwner)", "Upgraded(address indexed implementation)", "AdminChanged(address previousAdmin,address newAdmin)", "Initialized(uint8 version)", "Initialized(uint64 version)",
  "Paused(address account)", "Unpaused(address account)", "RoleGranted(bytes32 indexed role,address indexed account,address indexed sender)", "RoleRevoked(bytes32 indexed role,address indexed account,address indexed sender)",
  "AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)", "AuthorizationCanceled(address indexed authorizer,bytes32 indexed nonce)",
  "Permit(address indexed owner,address indexed token,address indexed spender,uint160 amount,uint48 expiration,uint48 nonce)",
  "UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)",
  "Executed(address indexed to,uint256 value,bytes data)", "ExecutionSuccess(bytes32 txHash,uint256 payment)", "ExecutionFailure(bytes32 txHash,uint256 payment)",
  "NameRegistered(string name,bytes32 indexed label,address indexed owner,uint256 baseCost,uint256 premium,uint256 expires)",
];
export function parseEvent(s) { s = String(s).replace(/^event\s+/, "").trim(); const i = s.indexOf("("); if (i < 1 || !s.endsWith(")")) throw new Error("event must look like Name(type [indexed] name,...)");
  const name = s.slice(0, i), body = s.slice(i + 1, -1).trim(); const parts = body ? body.split(/,(?![^(]*\))/) : [];
  const inputs = parts.map((p, k) => { const t = p.trim().split(/\s+/); const indexed = t.includes("indexed"); const rest = t.filter((x) => x !== "indexed"); return { type: norm(rest[0]), name: rest[1] || "arg" + k, indexed }; });
  const canon = `${name}(${inputs.map((x) => x.type).join(",")})`; return { name, inputs, signature: canon, topic0: "0x" + hex(keccak(te.encode(canon))) }; }
const BY = {}; for (const s of KNOWN_EVENTS) { const e = parseEvent(s); (BY[e.topic0] ||= []).push(e); }
const fmt = (t, v) => typeof v === "bigint" ? v.toString() : v;
function tryDecode(ev, topics, data) {
  const idx = ev.inputs.filter((x) => x.indexed); if (idx.length !== topics.length - 1) throw new Error("indexed count mismatch");
  const nonIdx = ev.inputs.filter((x) => !x.indexed); const vals = nonIdx.length ? decTuple(nonIdx.map((x) => x.type), data, 0) : [];
  if (nonIdx.length === 0 && data.length) throw new Error("unexpected data"); let k = 0, j = 1;
  const args = ev.inputs.map((x) => { if (x.indexed) { const t = topics[j++]; let value;
      if (/^(string|bytes)$|\[|^\(/.test(x.type)) value = { hashed: "0x" + hex(t) };
      else { const one = decTuple([x.type], t, 0)[0]; value = one; }
      return { name: x.name, type: x.type, indexed: true, value }; }
    return { name: x.name, type: x.type, indexed: false, value: vals[k++] }; });
  return args;
}
const TOK = { "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": ["USDC", 6, "Base"], "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ["USDC", 6, "Ethereum"], "0x4200000000000000000000000000000000000006": ["WETH", 18, "Base/OP"], "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": ["WETH", 18, "Ethereum"], "0xdac17f958d2ee523a2206206994597c13d831ec7": ["USDT", 6, "Ethereum"] };
const units = (s, d) => { const v = BigInt(s), D = 10n ** BigInt(d), fr = (v % D).toString().padStart(d, "0").replace(/0+$/, ""); return (v / D).toString() + (fr ? "." + fr : ""); };
export function decodeLog(log, extra = []) {
  const topics = (log.topics || []).map((t) => { const b = unhex(t); if (b.length !== 32) throw new Error("each topic must be 32 bytes"); return b; }); const data = unhex(log.data || "0x");
  const out = { address: log.address ? checksum(String(log.address)) : null, log_index: log.logIndex ?? log.log_index ?? undefined };
  if (!topics.length) return { ...out, decoded: false, reason: "anonymous event (no topics)" };
  const t0 = "0x" + hex(topics[0]); out.topic0 = t0; const cands = [...extra.filter((e) => e.topic0 === t0), ...(BY[t0] || [])];
  for (const ev of cands) { try { const args = tryDecode(ev, topics, data); const o = { ...out, decoded: true, event: ev.name, signature: ev.signature, source: extra.includes(ev) ? "supplied" : "builtin", args };
      const tk = out.address && TOK[out.address.toLowerCase()]; const val = args.find((x) => x.name === "value" || x.name === "wad");
      if (tk && val && /^uint/.test(val.type)) { o.token = { symbol: tk[0], decimals: tk[1], chain: tk[2] }; o.amount = units(val.value, tk[1]) + " " + tk[0]; }
      if (ev.name === "Approval" && val && BigInt(val.value) >= (1n << 255n)) o.warning = "UNLIMITED approval";
      if (ev.name === "Transfer" && args[0].value === "0x0000000000000000000000000000000000000000") o.kind = "mint"; else if (ev.name === "Transfer" && args[1].value === "0x0000000000000000000000000000000000000000") o.kind = "burn";
      return o; } catch {} }
  return { ...out, decoded: false, topics: topics.length, data_bytes: data.length, reason: cands.length ? "topic0 known but layout did not fit" : "unknown topic0 — supply event signature via events" };
}
export async function evmlog(a) {
  let logs = a.logs ?? a.receipt?.logs ?? (a.log ? [a.log] : null); if (typeof logs === "string") { try { logs = JSON.parse(logs); } catch { return bad("logs must be JSON array"); } }
  if (!logs && a.topics) logs = [{ address: a.address, topics: typeof a.topics === "string" ? a.topics.split(/[,;\s]+/).filter(Boolean) : a.topics, data: a.data }];
  if (!Array.isArray(logs) || !logs.length) return bad("provide topics (+data, address?) or logs[] / receipt.logs (eth_getTransactionReceipt JSON)"); if (logs.length > 500) return bad("max 500 logs");
  let extra = []; try { let ev = a.events ?? a.event; if (typeof ev === "string") ev = ev.split(";"); extra = (ev || []).map((s) => typeof s === "object" && s?.type === "event" ? `${s.name}(${s.inputs.map((x) => x.type + (x.indexed ? " indexed " : " ") + x.name).join(",")})` : s).filter((s) => typeof s === "string" && s.includes("(")).slice(0, 200).map(parseEvent); } catch (e) { return bad(e.message); }
  const out = []; for (const l of logs) { try { out.push(decodeLog(l, extra)); } catch (e) { out.push({ decoded: false, error: e.message }); } }
  const summary = out.filter((x) => x.decoded).map((x) => x.amount ? `${x.event} ${x.amount}${x.kind ? " (" + x.kind + ")" : ""}` : x.event);
  return { status: 200, body: { count: out.length, decoded: out.filter((x) => x.decoded).length, summary, logs: out, note: "decoded offline from supplied logs; no RPC" } };
}
