import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { tokeninfo, nftmeta, txsummary, batchdecode, decodeStr, normUri } from "../src/onchain.js";
import { PAID_PATHS } from "../src/x402.js";
import { keccakHex } from "../src/evm.js";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", P2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3", MC3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const W = (h) => h.replace(/^0x/, "").padStart(64, "0");
const S = (str) => { const b = Buffer.from(str).toString("hex"); return "0x" + W("20") + W(Buffer.from(str).length.toString(16)) + b.padEnd(Math.ceil(b.length / 64) * 64 || 64, "0"); };
const mockRpc = (fn) => { globalThis.fetch = async (u, o) => { const calls = JSON.parse(o.body); return new Response(JSON.stringify(calls.map((c) => ({ jsonrpc: "2.0", id: c.id, result: fn(c) })))); }; };
const deny = () => { globalThis.fetch = async (u) => { throw new Error("offline " + u); }; };
const sel = (s) => keccakHex(s).slice(0, 10);
test("decodeStr string + bytes32", () => { assert.equal(decodeStr(S("USD Coin")), "USD Coin"); assert.equal(decodeStr("0x" + Buffer.from("MKR").toString("hex").padEnd(64, "0")), "MKR"); assert.equal(decodeStr("0x"), null); });
test("tokeninfo: live mock, impersonator flag, offline, 400s", async () => {
  const FAKE = "0x" + "12".repeat(20);
  mockRpc((c) => { if (c.method === "eth_getCode") return "0x" + "60".repeat(500); const d = c.params[0].data; const isFake = c.params[0].to === FAKE;
    if (d.startsWith(sel("name()"))) return S(isFake ? "USDC claim at usdc-airdrop.com" : "USD Coin"); if (d.startsWith(sel("symbol()"))) return S("USDC"); if (d.startsWith(sel("decimals()"))) return "0x" + W("6");
    if (d.startsWith(sel("totalSupply()"))) return "0x" + W("3b9aca00"); if (d.startsWith(sel("balanceOf(address)"))) return "0x" + W("1e8480"); return null; });
  const b = (await tokeninfo({ tokens: `${USDC},${FAKE}`, holder: P2 })).body; assert.equal(b.count, 2);
  assert.equal(b.tokens[0].symbol, "USDC"); assert.equal(b.tokens[0].total_supply, "1000"); assert.equal(b.tokens[0].holder_balance, "2"); assert.equal(b.tokens[0].verdict, "ok");
  assert.equal(b.tokens[1].verdict, "suspicious"); assert.ok(b.tokens[1].flags.includes("IMPERSONATES_MAJOR_SYMBOL_UNLABELED"));
  deny(); const o = (await tokeninfo({ token: USDC })).body; assert.equal(o.live, false); assert.equal(o.tokens[0].label, "USDC (Base)");
  assert.equal((await tokeninfo({})).status, 400); assert.equal((await tokeninfo({ token: "0x12" })).status, 400);
});
test("normUri: ipfs, data json, {id}", () => {
  assert.equal(normUri("ipfs://Qm1/1.json").gateway, "https://ipfs.io/ipfs/Qm1/1.json");
  const j = normUri("data:application/json;base64," + Buffer.from(JSON.stringify({ name: "X #1", image: "ipfs://Qimg", attributes: [{ trait_type: "a", value: 1 }] })).toString("base64"));
  assert.equal(j.json.name, "X #1"); assert.equal(j.json.image.gateway, "https://ipfs.io/ipfs/Qimg"); assert.match(normUri("https://x/{id}.json", 1n).raw, /0{63}1\.json/);
});
test("nftmeta: erc721 live mock + royalty, 400s", async () => {
  mockRpc((c) => { const d = c.params[0].data;
    if (d.startsWith(sel("supportsInterface(bytes4)"))) return "0x" + W(d.slice(10).startsWith("80ac58cd") ? "1" : "0"); if (d.startsWith(sel("name()"))) return S("Punks"); if (d.startsWith(sel("symbol()"))) return S("P");
    if (d.startsWith(sel("ownerOf(uint256)"))) return "0x" + W(P2.slice(2)); if (d.startsWith(sel("tokenURI(uint256)"))) return S("ipfs://Qm/7"); if (d.startsWith(sel("royaltyInfo(uint256,uint256)"))) return "0x" + W(P2.slice(2)) + W("1f4"); return null; });
  const b = (await nftmeta({ contract: USDC, token_id: "7", holder: P2 })).body; assert.equal(b.standard, "erc721"); assert.equal(b.owner, P2); assert.equal(b.holder_owns, true); assert.equal(b.royalty.percent, 5); assert.equal(b.metadata_uri.scheme, "ipfs");
  assert.equal((await nftmeta({ contract: USDC })).status, 400);
});
test("txsummary: supplied receipt -> transfers, net flows, approval flag; live mock; 400", async () => {
  const T = keccakHex("Transfer(address,address,uint256)"), A = keccakHex("Approval(address,address,uint256)"), me = "0x" + "aa".repeat(20), dex = "0x" + "bb".repeat(20);
  const rc = { transactionHash: "0x" + "11".repeat(32), status: "0x1", blockNumber: "0x10", gasUsed: "0x5208", effectiveGasPrice: "0x3b9aca00", logs: [
    { address: USDC, topics: [T, "0x" + W(me.slice(2)), "0x" + W(dex.slice(2))], data: "0x" + W("f4240") },
    { address: USDC, topics: [A, "0x" + W(me.slice(2)), "0x" + W(dex.slice(2))], data: "0x" + "f".repeat(64) }] };
  const tx = { hash: rc.transactionHash, from: me, to: USDC, value: "0x0", nonce: "0x1", input: "0xa9059cbb" + W(dex.slice(2)) + W("f4240") };
  const b = (await txsummary({ receipt: rc, transaction: tx })).body; assert.equal(b.status, "success"); assert.equal(b.transfers.length, 1); assert.equal(b.transfers[0].amount, "1 USDC");
  assert.ok(b.flags.includes("BROAD_APPROVAL_GRANTED")); assert.equal(Object.values(b.sender_net)[0], "-1000000"); assert.equal(b.fee_native, "0.000021"); assert.match(b.method, /^transfer\(/);
  mockRpc((c) => (c.method === "eth_getTransactionByHash" ? tx : rc)); const l = (await txsummary({ tx_hash: rc.transactionHash })).body; assert.equal(l.live, true); assert.equal(l.found, true);
  deny(); assert.equal((await txsummary({ tx_hash: rc.transactionHash })).body.live, false); assert.equal((await txsummary({})).status, 400);
});
test("batchdecode: multicall(bytes[]) with nested unlimited approve; multiSend delegatecall", async () => {
  const appr = "0x095ea7b3" + W(P2.slice(2)) + "f".repeat(64), xfer = "0xa9059cbb" + W(P2.slice(2)) + W("1");
  const enc = (arr) => { const bs = arr.map((h) => h.slice(2)); let head = W("20") + W(bs.length.toString(16)), off = bs.length * 32, tail = ""; for (const b of bs) { head += W(off.toString(16)); const len = b.length / 2, pad = b.padEnd(Math.ceil(len / 32) * 64, "0"); tail += W(len.toString(16)) + pad; off += 32 + pad.length / 2; } return head + tail; };
  const b = (await batchdecode({ data: "0xac9650d8" + enc([appr, xfer]), to: USDC })).body;
  assert.equal(b.inner_calls, 2); assert.ok(b.flags.includes("BROAD_APPROVAL_INSIDE_BATCH")); assert.equal(b.direct_token_transfers, 1);
  const pk = "01" + USDC.slice(2).toLowerCase() + W("0") + W((xfer.length / 2 - 1).toString(16)) + xfer.slice(2); const bytesArg = W("20") + W((pk.length / 2).toString(16)) + pk.padEnd(Math.ceil(pk.length / 64) * 64, "0");
  const m = (await batchdecode({ data: sel("multiSend(bytes)") + bytesArg })).body; assert.ok(m.flags.includes("MULTISEND_DELEGATECALL")); assert.equal(m.root.calls[0].operation, "DELEGATECALL");
  assert.equal((await batchdecode({})).status, 400);
});
test("new routes are paid 402 at $0.02 and discoverable", async () => {
  const PAID = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  for (const p of ["/v1/tokeninfo", "/v1/nftmeta", "/v1/txsummary", "/v1/batchdecode"]) { assert.ok(PAID_PATHS.has(p)); const r = await handle(new Request("https://w.test" + p, { method: "POST", body: "{}" }), PAID); assert.equal(r.status, 402, p); assert.equal((await r.json()).accepts[0].maxAmountRequired, "20000"); }
});
