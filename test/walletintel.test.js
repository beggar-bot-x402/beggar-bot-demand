import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { addrprofile, allowance, ens, addrpoison, classifyCode, ensNormalize } from "../src/walletintel.js";
import { PAID_PATHS } from "../src/x402.js";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3", V = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const mockRpc = (fn) => { globalThis.fetch = async (u, o) => { const calls = JSON.parse(o.body); return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: fn(c) })))); }; };
const deny = () => { globalThis.fetch = async (u) => { throw new Error("offline " + u); }; };
const W = (h) => "0x" + h.padStart(64, "0");
test("classifyCode: eoa, 7702, 1167", () => {
  assert.equal(classifyCode("0x").type, "eoa");
  const d = classifyCode("0xef0100" + P2.slice(2).toLowerCase()); assert.equal(d.type, "eip7702_delegated_eoa"); assert.equal(d.delegate, P2);
  assert.equal(classifyCode("0x363d3d373d3d3d363d73" + USDC.slice(2).toLowerCase() + "5af43d82803e903d91602b57fd5bf3").proxy, "eip1167_minimal");
});
test("addrprofile: live mock EIP-1967 proxy, fresh EOA, fail-soft offline, 400s", async () => {
  mockRpc((c) => ({ eth_getCode: "0x6080604052", eth_getTransactionCount: "0x1", eth_getBalance: "0x0", eth_call: W("4c4b40"), eth_getStorageAt: c.params[1].startsWith("0x3608") ? W(P2.slice(2)) : W("0") })[c.method]);
  const b = (await addrprofile({ address: USDC })).body; assert.equal(b.live, true); assert.equal(b.proxy, "eip1967"); assert.equal(b.implementation, P2); assert.equal(b.usdc_balance, "5"); assert.equal(b.implementation_label, "Uniswap Permit2");
  mockRpc((c) => ({ eth_getCode: "0x", eth_getTransactionCount: "0x0", eth_getBalance: "0x0", eth_call: W("0"), eth_getStorageAt: W("0") })[c.method]);
  const e = (await addrprofile({ address: "0x1111111111111111111111111111111111111111" })).body; assert.equal(e.type, "eoa"); assert.ok(e.risk.reasons.includes("fresh_eoa_no_outgoing_tx")); assert.ok(e.risk.score < 50);
  deny(); const o = await addrprofile({ address: USDC }); assert.equal(o.status, 200); assert.equal(o.body.live, false); assert.equal(o.body.label, "USDC (Base)");
  assert.equal((await addrprofile({})).status, 400); assert.equal((await addrprofile({ address: USDC, chain: "doge" })).status, 400);
});
test("allowance: approve unlimited, setApprovalForAll, Permit2 typed data, live read mock", async () => {
  deny();
  const a = (await allowance({ data: "0x095ea7b3" + P2.slice(2).toLowerCase().padStart(64, "0") + "f".repeat(64), to: USDC })).body;
  assert.equal(a.kind, "approve"); assert.ok(a.flags.includes("UNLIMITED_AMOUNT")); assert.equal(a.spender_label, "Uniswap Permit2"); assert.match(a.revoke_calldata, /^0x095ea7b3.*0{64}$/);
  const s = (await allowance({ data: "0xa22cb465" + "ab".repeat(20).padStart(64, "0") + "1".padStart(64, "0"), to: USDC })).body; assert.ok(s.flags.includes("APPROVE_ALL_NFTS")); assert.ok(s.flags.includes("SPENDER_UNLABELED"));
  const td = { primaryType: "PermitSingle", domain: { name: "Permit2", chainId: 8453, verifyingContract: P2 }, message: { details: { token: USDC, amount: "1461501637330902918203684832716283019655932542975", expiration: "0", nonce: "0" }, spender: "0x" + "cd".repeat(20), sigDeadline: "2000000000" } };
  const p = (await allowance({ typed_data: td, now: 1900000000 })).body; assert.equal(p.kind, "permit2_permit_single"); assert.ok(p.flags.includes("UNLIMITED_AMOUNT")); assert.ok(p.flags.includes("NO_EXPIRY")); assert.equal(p.verdict, "review: broad approval");
  mockRpc((c) => c.params[0].data.startsWith("0x313ce567") ? W("6") : c.params[0].to.toLowerCase() === P2.toLowerCase() ? W("0") + W("0").slice(2) + W("0").slice(2) : W("f4240"));
  const l = (await allowance({ owner: V, spender: P2, token: USDC })).body; assert.equal(l.live.erc20_allowance.formatted, "1"); assert.equal(l.live.decimals, 6);
  assert.equal((await allowance({})).status, 400); assert.equal((await allowance({ data: "0xdeadbeef" })).status, 400);
});
test("ens: namehash vectors, normalize flags, offline fail-soft, reverse mock", async () => {
  deny();
  const b = (await ens({ name: "Vitalik.eth", resolve: "false" })).body; assert.equal(b.namehash, "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835"); assert.ok(b.normalization_issues.includes("uppercase_lowered")); assert.equal(b.eth_2ld, true);
  assert.equal((await ens({ name: "eth", resolve: false })).body.namehash, "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae");
  const off = (await ens({ name: "vitalik.eth" })).body; assert.equal(off.live, false); assert.ok(off.namehash);
  assert.ok(ensNormalize("pаypal.eth").issues.includes("mixed_script_homoglyph_risk")); assert.equal((await ens({ name: "a..eth" })).status, 400); assert.equal((await ens({})).status, 400);
  const nameRet = "0x" + "20".padStart(64, "0") + "b".padStart(64, "0") + Buffer.from("vitalik.eth").toString("hex").padEnd(64, "0");
  mockRpc((c) => { const d = c.params[0].data; return d.startsWith("0x0178b8bf") ? W("aa".repeat(20)) : d.startsWith("0x691f3431") ? nameRet : W(V.slice(2).toLowerCase()); });
  const r = (await ens({ address: V })).body; assert.equal(r.primary_name, "vitalik.eth"); assert.equal(r.forward_verified, true);
});
test("addrpoison: lookalike vs intended + labels, checksum tamper, routes paid 402", async () => {
  deny();
  const b = (await addrpoison({ addresses: ["0x8335aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa2913", USDC, "0x833589FCD6eDb6E08f4c7C32D4f71b54bdA02913", "nope"], intended: USDC })).body;
  assert.equal(b.results[0].verdict, "block"); assert.ok(b.results[0].flags.includes("ADDRESS_POISONING_SUSPECT")); assert.equal(b.results[1].matches_intended, true); assert.ok(b.results[2].flags.some((f) => /bad_eip55/.test(f))); assert.equal(b.results[3].valid, false);
  assert.equal((await addrpoison({})).status, 400);
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  for (const p of ["/v1/addrprofile", "/v1/allowance", "/v1/addrpoison", "/v1/ens"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); assert.equal((await r.json()).accepts[0].maxAmountRequired, "20000"); }
  const w = await (await handle(new Request("https://w.test/.well-known/x402"), PAID)).json(); const ord = w.endpoints.map((e) => new URL(e.resource).pathname);
  assert.ok(ord.indexOf("/v1/addrprofile") < ord.indexOf("/v1/seller-health") && ord.indexOf("/v1/ens") < ord.indexOf("/v1/risk"));
});
test("rpcBatch: 429 then success on retry; failover to next URL; total failure stays honest", async () => {
  const { rpcBatch, RPCS } = await import("../src/walletintel.js");
  const hits = [];
  const orig = globalThis.fetch;
  // First URL: 429 once then OK. Prefer first RPCS.base host.
  const u0 = RPCS.base[0], u1 = RPCS.base[1];
  globalThis.fetch = async (u, o) => {
    hits.push(String(u));
    if (String(u) === u0) {
      if (hits.filter((h) => h === u0).length === 1) return new Response("nope", { status: 429 });
      const calls = JSON.parse(o.body);
      return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: "0x1" }))));
    }
    throw new Error("unexpected url " + u);
  };
  try {
    const r = await rpcBatch("base", [["eth_blockNumber", []]]);
    assert.equal(r.results[0], "0x1");
    assert.equal(r.rpc, new URL(u0).host);
    assert.ok(hits.filter((h) => h === u0).length >= 2, "expected retry on same URL after 429");
  } finally { globalThis.fetch = orig; }

  const hits2 = [];
  globalThis.fetch = async (u, o) => {
    hits2.push(String(u));
    if (String(u) === u0) return new Response("nope", { status: 500 });
    if (String(u) === u1) {
      const calls = JSON.parse(o.body);
      return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: "0xabc" }))));
    }
    throw new Error("unexpected " + u);
  };
  try {
    const r = await rpcBatch("base", [["eth_blockNumber", []]]);
    assert.equal(r.results[0], "0xabc");
    assert.equal(r.rpc, new URL(u1).host);
    assert.ok(hits2.includes(u0) && hits2.includes(u1));
  } finally { globalThis.fetch = orig; }

  globalThis.fetch = async () => { throw new Error("offline-all"); };
  try {
    await assert.rejects(() => rpcBatch("base", [["eth_blockNumber", []]]), /public rpc unavailable/);
  } finally { globalThis.fetch = orig; }
});
test("rpcBatch: per-call JSON-RPC error stays null (not fabricated); does not force failover", async () => {
  const { rpcBatch, RPCS } = await import("../src/walletintel.js");
  const orig = globalThis.fetch;
  let other = 0;
  globalThis.fetch = async (u, o) => {
    if (String(u) !== RPCS.base[0]) { other++; throw new Error("should not failover"); }
    const calls = JSON.parse(o.body);
    return new Response(JSON.stringify(calls.map((c, i) => i === 0 ? { jsonrpc: "2.0", id: c.id, error: { message: "execution reverted" } } : { jsonrpc: "2.0", id: c.id, result: "0x2" })));
  };
  try {
    const r = await rpcBatch("base", [["eth_call", [{ to: "0x1", data: "0x" }, "latest"]], ["eth_blockNumber", []]]);
    assert.equal(r.results[0], null);
    assert.equal(r.results[1], "0x2");
    assert.equal(other, 0);
  } finally { globalThis.fetch = orig; }
});
