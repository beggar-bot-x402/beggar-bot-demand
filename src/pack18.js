// pack18: proxyinfo, hotcontracts (Base), builders (Ethereum), newcontracts (Base)
const R = (status, body) => ({ status, body });
const CH = { base: ["https://base.drpc.org", "https://base-rpc.publicnode.com", "https://mainnet.base.org"], ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"], arbitrum: ["https://arbitrum-one-rpc.publicnode.com"], optimism: ["https://optimism-rpc.publicnode.com"], polygon: ["https://polygon-bor-rpc.publicnode.com"] };
async function rpc(chain, method, params) { let last; for (const u of CH[chain]) for (let k = 0; k < 2; k++) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (j.error) { last = new Error(j.error.message); if (/limit/i.test(j.error.message)) { await new Promise((z) => setTimeout(z, 800)); continue; } break; } return j.result; } catch (e) { last = e; } } throw last || new Error("rpc failed"); }
const err = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
const slotAddr = (v) => (v && v !== "0x" && BigInt(v) !== 0n ? "0x" + v.slice(-40) : null);
const hx = (n) => "0x" + n.toString(16);
const dec = (h) => { try { const b = Uint8Array.from((h.slice(2).match(/../g) || []).map((x) => parseInt(x, 16))); return new TextDecoder().decode(b).replace(/[^\x20-\x7e]/g, "") || null; } catch { return null; } };
const n = (v, d, lo, hi) => Math.max(lo, Math.min(hi, parseInt(v || d, 10) || d));

export async function proxyinfo(a) {
  const chain = (a.chain || "base").toLowerCase(); if (!CH[chain]) return R(400, { error: "chain must be one of " + Object.keys(CH).join(",") }); if (!isAddr(a.address)) return R(400, { error: "address required (0x…40 hex)" });
  try {
    const ad = a.address.toLowerCase(); const S = { impl: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", admin: "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103", beacon: "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeee59ff6cb3582b35133d50", oz: "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3" };
    const code = await rpc(chain, "eth_getCode", [ad, "latest"]); if (!code || code === "0x") return R(200, { chain, address: ad, is_contract: false, note: "EOA or undeployed (or EIP-7702 delegation absent)" });
    const [impl, admin, beacon, oz] = []; const v = {}; for (const [k, s] of Object.entries(S)) v[k] = await rpc(chain, "eth_getStorageAt", [ad, s, "latest"]).catch(() => null);
    let beaconImpl = null; const b = slotAddr(v.beacon); if (b) { const r = await rpc(chain, "eth_call", [{ to: b, data: "0x5c60da1b" }, "latest"]).catch(() => null); beaconImpl = slotAddr(r); }
    const minimal = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i.exec(code);
    const own = await rpc(chain, "eth_call", [{ to: ad, data: "0x8da5cb5b" }, "latest"]).catch(() => null);
    const del7702 = /^0xef0100([0-9a-f]{40})$/i.exec(code);
    const implementation = slotAddr(v.impl) || slotAddr(v.oz) || beaconImpl || (minimal ? "0x" + minimal[1] : null) || (del7702 ? "0x" + del7702[1] : null);
    const type = del7702 ? "eip7702-delegation" : minimal ? "eip1167-minimal-clone" : slotAddr(v.impl) ? "eip1967-proxy" : b ? "eip1967-beacon-proxy" : slotAddr(v.oz) ? "oz-legacy-proxy" : "not-a-standard-proxy";
    let implCodeSize = null; if (implementation) { const c = await rpc(chain, "eth_getCode", [implementation, "latest"]).catch(() => null); implCodeSize = c ? (c.length - 2) / 2 : null; }
    const owner = own && own.length === 66 ? slotAddr(own) : null; const adm = slotAddr(v.admin);
    return R(200, { chain, address: ad, is_contract: true, code_size: (code.length - 2) / 2, proxy_type: type, is_proxy: type !== "not-a-standard-proxy", implementation, implementation_code_size: implCodeSize, admin: adm, beacon: b, owner,
      upgradeable: ["eip1967-proxy", "eip1967-beacon-proxy", "oz-legacy-proxy"].includes(type), risk_note: type.includes("proxy") && type !== "not-a-standard-proxy" ? "logic can be upgraded by admin/owner; verify who controls " + (adm || owner || "the upgrade path") : null });
  } catch (e) { return err(e); }
}

export async function hotcontracts(a) {
  const chain = (a.chain || "base").toLowerCase(); if (!CH[chain]) return R(400, { error: "chain must be one of " + Object.keys(CH).join(",") });
  try {
    const blocks = n(a.blocks, 20, 1, 50); const tip = parseInt(await rpc(chain, "eth_blockNumber", []), 16); const by = {}; let txs = 0, t0 = 0, t1 = 0;
    for (let i = 0; i < blocks; i++) { const b = await rpc(chain, "eth_getBlockByNumber", [hx(tip - i), true]); if (!b) continue; if (i === 0) t1 = parseInt(b.timestamp, 16); t0 = parseInt(b.timestamp, 16);
      for (const t of b.transactions) { txs++; if (!t.to || t.type === "0x7e") continue; const k = t.to.toLowerCase(); const x = (by[k] = by[k] || { txs: 0, senders: new Set(), gas: 0n, value: 0n, sel: {} }); x.txs++; x.senders.add(t.from.toLowerCase()); x.gas += BigInt(t.gas); x.value += BigInt(t.value); const s = (t.input || "0x").slice(0, 10); x.sel[s] = (x.sel[s] || 0) + 1; } }
    const top = Object.entries(by).sort((p, q) => q[1].txs - p[1].txs).slice(0, n(a.limit, 20, 1, 50));
    return R(200, { chain, from_block: tip - blocks + 1, to_block: tip, seconds: t1 - t0, txs, unique_targets: Object.keys(by).length,
      hot: top.map(([to, x]) => ({ address: to, txs: x.txs, share_pct: +((100 * x.txs) / txs).toFixed(2), unique_senders: x.senders.size, gas_limit_sum: x.gas.toString(), eth_value: +(Number(x.value) / 1e18).toFixed(6), top_selectors: Object.entries(x.sel).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([s, c]) => ({ selector: s === "0x" ? "native-transfer" : s, count: c })) })) });
  } catch (e) { return err(e); }
}

const KNOWN = { "0x95222290dd7278aa3ddd389cc1e1d165cc4bafe5": "beaverbuild", "0x4838b106fce9647bdf1e7877bf73ce8b0bad5f97": "Titan Builder", "0x1f9090aae28b8a3dceadf281b0f12828e676c326": "rsync-builder", "0xdadb0d80178819f2319190d340ce9a924f783711": "BuilderNet", "0x388c818ca8b9251b393131c08a736a67ccb19297": "Lido Execution Layer Rewards Vault" };
export async function builders(a) {
  try {
    const blocks = n(a.blocks, 50, 5, 100); const tip = parseInt(await rpc("ethereum", "eth_blockNumber", []), 16); const by = {}; let gasUsed = 0;
    for (let i = 0; i < blocks; i++) { const b = await rpc("ethereum", "eth_getBlockByNumber", [hx(tip - i), false]); if (!b) continue; const tag = dec(b.extraData) || "(empty)"; const fr = b.miner.toLowerCase(); const k = KNOWN[fr] && KNOWN[fr] !== "Lido Execution Layer Rewards Vault" ? KNOWN[fr] : tag;
      const x = (by[k] = by[k] || { blocks: 0, fee_recipients: new Set(), txs: 0, gas: 0 }); x.blocks++; x.fee_recipients.add(fr); x.txs += b.transactions.length; x.gas += parseInt(b.gasUsed, 16); gasUsed += parseInt(b.gasUsed, 16); }
    const list = Object.entries(by).sort((p, q) => q[1].blocks - p[1].blocks).map(([builder, x]) => ({ builder, blocks: x.blocks, share_pct: +((100 * x.blocks) / blocks).toFixed(1), avg_txs: Math.round(x.txs / x.blocks), avg_gas_used: Math.round(x.gas / x.blocks), fee_recipients: [...x.fee_recipients].slice(0, 3).map((f) => ({ address: f, label: KNOWN[f] || null })) }));
    const hhi = list.reduce((s, x) => s + x.share_pct ** 2, 0);
    return R(200, { chain: "ethereum", from_block: tip - blocks + 1, to_block: tip, blocks, builders: list.length, top3_share_pct: +list.slice(0, 3).reduce((s, x) => s + x.share_pct, 0).toFixed(1), hhi: Math.round(hhi), concentration: hhi > 2500 ? "high" : hhi > 1500 ? "moderate" : "low", list });
  } catch (e) { return err(e); }
}

export async function newcontracts(a) {
  const chain = (a.chain || "base").toLowerCase(); if (!CH[chain]) return R(400, { error: "chain must be one of " + Object.keys(CH).join(",") });
  try {
    const blocks = n(a.blocks, 10, 1, 30); const tip = parseInt(await rpc(chain, "eth_blockNumber", []), 16); const out = []; const dep = {};
    for (let i = 0; i < blocks; i++) { const rs = await rpc(chain, "eth_getBlockReceipts", [hx(tip - i)]); for (const r of rs || []) if (r.contractAddress && r.status === "0x1") { const f = r.from.toLowerCase(); dep[f] = (dep[f] || 0) + 1; out.push({ address: r.contractAddress.toLowerCase(), deployer: f, tx: r.transactionHash, block: parseInt(r.blockNumber, 16), gas_used: parseInt(r.gasUsed, 16), logs: r.logs.length }); } }
    const lim = out.slice(0, n(a.limit, 25, 1, 50)); const ERC20 = ["0x95d89b41", "0x313ce567", "0x18160ddd"];
    for (const c of lim) { const [sym, decs, sup] = await Promise.all(ERC20.map((d) => rpc(chain, "eth_call", [{ to: c.address, data: d }, "latest"]).catch(() => null))); const code = await rpc(chain, "eth_getCode", [c.address, "latest"]).catch(() => "0x");
      c.code_size = (code.length - 2) / 2; c.minimal_clone = /^0x363d3d373d3d3d363d73/.test(code); c.looks_erc20 = !!(decs && decs.length === 66 && sup && sup.length === 66);
      if (c.looks_erc20) { c.decimals = parseInt(decs, 16); c.symbol = sym && sym.length > 130 ? dec("0x" + sym.slice(130, 130 + parseInt(sym.slice(66, 130), 16) * 2)) : sym ? dec(sym) : null; c.total_supply = Number(BigInt(sup)) / 10 ** Math.min(c.decimals, 36); } }
    return R(200, { chain, from_block: tip - blocks + 1, to_block: tip, deployments: out.length, unique_deployers: Object.keys(dep).length, top_deployers: Object.entries(dep).sort((p, q) => q[1] - p[1]).slice(0, 5).map(([address, c]) => ({ address, count: c })), new_tokens: lim.filter((c) => c.looks_erc20).length, contracts: lim });
  } catch (e) { return err(e); }
}
