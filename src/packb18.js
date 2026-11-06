// packb18 (builder B, 2026-11-02): eip7702, accountkind, erc165, blockhash. $0 upstream (keyless public RPCs).
import { rpcBatch, RPCS } from "./walletintel.js";
import { checksum } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const err = (e) => ({ status: 502, body: { error: String(e && e.message || e) } });
const isA = (x) => /^0x[0-9a-fA-F]{40}$/.test(String(x));
const AL = { "8453": "base", "1": "ethereum", eth: "ethereum", mainnet: "ethereum", "10": "optimism", op: "optimism", "42161": "arbitrum", arb: "arbitrum", "137": "polygon", "84532": "base-sepolia" };
const ck = (c) => { const s = String(c ?? "base").trim().toLowerCase(); return RPCS[s] ? s : AL[s] || null; };
const chainsOf = (v, def) => { const l = String(v || def).split(",").map(ck); return l.includes(null) ? null : [...new Set(l)]; };
const KNOWN7702 = { "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b": "MetaMask EIP7702StatelessDeleGator", "0x000000009b1d0af20d8c6d0a44e162d11f9b8f00": "Uniswap Calibur", "0xe6cae83bde06e4c305530e199d7217f42808555b": "Simple7702Account (eth-infinitism)", "0x4cd241e8d1510e30b2076397afc7508ae59c66c9": "Simple7702Account v0.8", "0x7702cb554e6bfb442cb743a7df23154544a7176c": "Coinbase EIP7702Proxy", "0x5a7fc11397e9a8ad41bf10bf13f22b0a63f96f6d": "Ambire 7702" };
const SAFE_SINGLETONS = ["0xd9db270c1b5e3bd161e8c8503c55ceabee709552", "0x3e5c63644e683549055b9be8653de26e0b4cd36e", "0x41675c099f32341bf84bfc5382af534df5c7461a", "0x29fcb43b46531bca003ddc8fcb67ffe91900c762"];
function kindOf(code) {
  if (!code || code === "0x") return { kind: "eoa" };
  const c = code.toLowerCase();
  if (c.startsWith("0xef0100") && c.length === 48) { const d = "0x" + c.slice(8); return { kind: "eip7702_delegated_eoa", delegate: checksum(d), delegate_label: KNOWN7702[d] || null }; }
  if (/^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/.test(c)) return { kind: "minimal_proxy_1167", implementation: checksum("0x" + c.slice(22, 62)) };
  if (c.length < 300 && c.includes("a619486e")) return { kind: "safe_proxy" };
  return { kind: "contract", code_bytes: (c.length - 2) / 2 };
}
export async function eip7702(q) {
  if (!isA(q.address)) return bad("address required (0x…40 hex)");
  const chains = chainsOf(q.chains || q.chain, "base,ethereum,optimism,arbitrum"); if (!chains) return bad("unknown chain");
  const out = await Promise.all(chains.map(async (ch) => { try { const { results: [code, nonce] } = await rpcBatch(ch, [["eth_getCode", [q.address, "latest"]], ["eth_getTransactionCount", [q.address, "latest"]]]); const k = kindOf(code); return { chain: ch, delegated: k.kind === "eip7702_delegated_eoa", delegate: k.delegate || null, delegate_label: k.delegate_label || null, kind: k.kind, nonce: nonce ? Number(BigInt(nonce)) : null }; } catch (e) { return { chain: ch, error: String(e.message || e) }; } }));
  const d = out.filter((x) => x.delegated);
  return ok({ address: checksum(q.address.toLowerCase()), delegated_on: d.map((x) => x.chain), unknown_delegates: d.filter((x) => !x.delegate_label).map((x) => ({ chain: x.chain, delegate: x.delegate })), risk: d.some((x) => !x.delegate_label) ? "review: delegated to unrecognized code (possible drainer)" : d.length ? "delegated to known smart-account impl" : "none", chains: out, source: "eth_getCode 0xef0100 designator (EIP-7702)" });
}
export async function accountkind(q) {
  const list = String(q.addresses || q.address || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.length > 20 || !list.every(isA)) return bad("address or addresses (csv, max 20) required");
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  try {
    const calls = []; for (const a of list) calls.push(["eth_getCode", [a, "latest"]], ["eth_getTransactionCount", [a, "latest"]], ["eth_getBalance", [a, "latest"]], ["eth_getStorageAt", [a, "0x0", "latest"]]);
    const { results: r } = await rpcBatch(ch, calls);
    const accounts = list.map((a, i) => { const [code, n, b, s0] = r.slice(4 * i, 4 * i + 4); let k = kindOf(code); if (k.kind === "safe_proxy" || (s0 && SAFE_SINGLETONS.includes("0x" + s0.slice(-40)))) k = { kind: "safe", singleton: s0 ? checksum("0x" + s0.slice(-40)) : null }; return { address: checksum(a.toLowerCase()), ...k, nonce: n ? Number(BigInt(n)) : null, native_balance: b ? Number(BigInt(b)) / 1e18 : null, can_sign_ecdsa: k.kind === "eoa" || k.kind === "eip7702_delegated_eoa", verify_with: k.kind === "eoa" ? "ecrecover" : k.kind === "eip7702_delegated_eoa" ? "ecrecover or EIP-1271" : "EIP-1271" }; });
    return ok({ chain: ch, accounts, counts: accounts.reduce((m, x) => ((m[x.kind] = (m[x.kind] || 0) + 1), m), {}) });
  } catch (e) { return err(e); }
}
const IFACES = { erc165: "0x01ffc9a7", erc721: "0x80ac58cd", erc721_metadata: "0x5b5e139f", erc721_enumerable: "0x780e9d63", erc1155: "0xd9b67a26", erc1155_metadata_uri: "0x0e89341c", erc2981_royalties: "0x2a55205a", erc4906_metadata_update: "0x49064906", erc5192_soulbound: "0xb45a3c0e", erc1271: "0x1626ba7e", erc4907_rental: "0xad092b5c", access_control: "0x7965db0b", erc1363: "0xb0202a11", erc6551_account: "0x6faff5f1" };
export async function erc165(q) {
  if (!isA(q.address)) return bad("address required");
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const extra = String(q.interface_ids || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!extra.every((x) => /^0x[0-9a-f]{8}$/.test(x))) return bad("interface_ids must be csv of 0x 4-byte ids");
  const ids = { ...IFACES, ...Object.fromEntries(extra.map((x) => [x, x])), _invalid_ffffffff: "0xffffffff" };
  try {
    const names = Object.keys(ids);
    const { results: r } = await rpcBatch(ch, [["eth_getCode", [q.address, "latest"]], ...names.map((n) => ["eth_call", [{ to: q.address, data: "0x01ffc9a7" + ids[n].slice(2).padEnd(64, "0") }, "latest"]])]);
    if (!r[0] || r[0] === "0x") return ok({ chain: ch, address: q.address, is_contract: false, erc165_compliant: false, supports: {} });
    const res = Object.fromEntries(names.map((n, i) => [n, r[i + 1] && r[i + 1].length >= 66 ? BigInt(r[i + 1].slice(0, 66)) === 1n : null]));
    const compliant = res.erc165 === true && res._invalid_ffffffff === false; delete res._invalid_ffffffff;
    const standard = res.erc721 ? "ERC-721" : res.erc1155 ? "ERC-1155" : res.erc6551_account ? "ERC-6551 account" : null;
    return ok({ chain: ch, address: checksum(q.address.toLowerCase()), is_contract: true, erc165_compliant: compliant, likely_standard: standard, supported: Object.keys(res).filter((k) => res[k]), supports: res });
  } catch (e) { return err(e); }
}
export async function blockhash(q) {
  const ch = ck(q.chain); if (!ch) return bad("unknown chain");
  const nums = String(q.blocks || q.block || "latest").split(",").map((s) => s.trim()).filter(Boolean);
  if (nums.length > 20 || !nums.every((n) => /^(latest|finalized|safe|\d+|0x[0-9a-f]+)$/i.test(n))) return bad("block(s): csv of numbers or latest|safe|finalized (max 20)");
  if (q.hash && !/^0x[0-9a-fA-F]{64}$/.test(q.hash)) return bad("hash must be 0x 32-byte");
  try {
    const tag = (n) => /^\d+$/.test(n) ? "0x" + BigInt(n).toString(16) : n.toLowerCase();
    const { results: r } = await rpcBatch(ch, [["eth_blockNumber", []], ["eth_getBlockByNumber", ["finalized", false]], ...nums.map((n) => ["eth_getBlockByNumber", [tag(n), false]])]);
    const head = r[0] ? Number(BigInt(r[0])) : null, fin = r[1] ? Number(BigInt(r[1].number)) : null;
    const blocks = nums.map((n, i) => { const b = r[i + 2]; if (!b) return { block: n, found: false }; const num = Number(BigInt(b.number)); return { block: num, hash: b.hash, parent_hash: b.parentHash, timestamp: Number(BigInt(b.timestamp)), iso: new Date(Number(BigInt(b.timestamp)) * 1000).toISOString(), tx_count: b.transactions.length, confirmations: head != null ? head - num : null, finalized: fin != null ? num <= fin : null, ...(q.hash ? { matches: b.hash.toLowerCase() === q.hash.toLowerCase() } : {}) }; });
    return ok({ chain: ch, head, finalized_head: fin, blocks, ...(q.hash ? { hash_verified: blocks.some((b) => b.matches) } : {}), note: "Use matches=false on a recorded block to detect a reorg of a settlement." });
  } catch (e) { return err(e); }
}
