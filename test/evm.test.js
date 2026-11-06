import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { keccakHex, checksum, abidecode, evmtx, parseSig } from "../src/evm.js";
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
globalThis.fetch = async (u) => { throw new Error("no outbound allowed: " + u); };
const W = (h) => h.replace(/^0x/, "").padStart(64, "0");
const TRANSFER = "0xa9059cbb" + W("719227f384b66bfef00093d6d8d32fa9dc2b40e7") + W("2710");
const EIP155 = "0xf86c098504a817c800825208943535353535353535353535353535353535353535880de0b6b3a76400008025a028ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276a067cbe9d8997f761aecb703304b3800ccf555c9f3dc64214b297fb1966a3b6d83";
test("keccak + EIP-55 vectors", () => {
  assert.equal(keccakHex(""), "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(keccakHex("a".repeat(200)).length, 66);
  assert.equal(checksum("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed");
  assert.equal(parseSig("function transfer(address to, uint amount)").selector, "0xa9059cbb");
});
test("abidecode builtin, supplied sig, unlimited approve, dynamic types, unknown", async () => {
  const t = (await abidecode({ data: TRANSFER })).body; assert.equal(t.function, "transfer(address,uint256)"); assert.equal(t.args[1].value, "10000");
  const n = (await abidecode({ data: TRANSFER, sig: "transfer(address to,uint256 amount)" })).body; assert.equal(n.args[0].name, "to"); assert.equal(n.source, "supplied");
  const ap = (await abidecode({ data: "0x095ea7b3" + W("11") + "f".repeat(64) })).body; assert.match(ap.summary, /UNLIMITED/);
  const dyn = (await abidecode({ data: "0x" + W("40") + W("80") + W("3") + "616263".padEnd(64, "0") + W("2") + W("1") + W("2"), types: "string,uint256[]" })).body;
  assert.deepEqual(dyn.values, ["abc", ["1", "2"]]);
  const abi = (await abidecode({ data: TRANSFER, abi: [{ type: "function", name: "transfer", inputs: [{ type: "address" }, { type: "uint256" }] }] })).body; assert.equal(abi.decoded, true);
  assert.equal((await abidecode({ data: "0xdeadbeef" + W("1") })).body.decoded, false);
  assert.equal((await abidecode({})).status, 400); assert.equal((await abidecode({ data: "0xzz" })).status, 400);
  assert.equal((await abidecode({ data: "0xa9059cbb00" })).body.decoded, false);
});
test("evmtx EIP-155 legacy vector", async () => {
  const o = (await evmtx({ raw: EIP155 })).body;
  assert.equal(o.hash, "0x33469b22e9f636356c4160a87eb19df52b7412e8eac32a4a55ffe88ea8350788");
  assert.equal(o.chain_id, "1"); assert.equal(o.chain, "Ethereum"); assert.equal(o.nonce, "9"); assert.equal(o.value_eth, "1"); assert.equal(o.max_fee_gwei, "20"); assert.equal(o.gas_limit, "21000");
  assert.equal(o.to, "0x3535353535353535353535353535353535353535"); assert.match(o.call.note, /empty calldata/);
});
test("evmtx EIP-1559 on Base with USDC transfer calldata (synthetic)", async () => {
  const enc = (u) => { if (u.length === 1 && u[0] < 0x80) return u; return u.length < 56 ? [0x80 + u.length, ...u] : [0xb7 + 1, u.length, ...u]; };
  const hx = (h) => { h = h.replace(/^0x/, ""); if (h.length % 2) h = "0" + h; return h === "00" || !h ? [] : h.match(/../g).map((x) => parseInt(x, 16)); };
  const items = [hx("2105"), hx("05"), hx("3b9aca00"), hx("77359400"), hx("c350"), hx("833589fcd6edb6e08f4c7c32d4f71b54bda02913"), [], hx(TRANSFER)].map(enc).flat();
  const list = [0xc0, 0x01, 0x80, ...hx("11".repeat(32)).length ? [0xa0, ...hx("11".repeat(32))] : [], 0xa0, ...hx("22".repeat(32))];
  const body = [0xc0 + 0, ...items, ...list]; const len = body.length - 1; const full = [0xf8, len, ...body.slice(1)];
  const raw = "0x02" + full.map((x) => x.toString(16).padStart(2, "0")).join("");
  const o = (await evmtx({ raw })).body; assert.equal(o.type_name, "EIP-1559"); assert.equal(o.chain, "Base"); assert.equal(o.chain_id, "8453");
  assert.equal(o.to, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"); assert.equal(o.call.function, "transfer(address,uint256)"); assert.equal(o.max_fee_gwei, "2");
  assert.equal((await evmtx({ raw: "0x02c0ff" })).body.valid, false); assert.equal((await evmtx({})).status, 400);
});
test("/v1/abidecode + /v1/evmtx routes: free 200, paid 402, discovery + MCP", async () => {
  assert.equal((await call("/v1/abidecode?data=" + TRANSFER))[1].decoded, true);
  const [s2, b2] = await call("/v1/evmtx", { method: "POST", body: JSON.stringify({ raw: EIP155 }) }); assert.equal(s2, 200); assert.equal(b2.nonce, "9");
  for (const p of ["/v1/abidecode", "/v1/evmtx"]) {
    assert.equal((await call(p + "?data=0x&raw=0x", undefined, env(PAID)))[0], 402);
    const [, oa] = await call("/openapi.json", undefined, env(PAID)); assert.ok(oa.paths[p].get["x-payment-info"]);
    const [, wk] = await call("/.well-known/x402", undefined, env(PAID)); assert.ok(JSON.stringify(wk).includes(p));
    const r = await handle(new Request("https://w.test/llms.txt"), env(PAID)); assert.ok((await r.text()).includes(p));
  }
  const m = await handle(new Request("https://w.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env(PAID));
  const tl = JSON.stringify(await m.json()); assert.ok(tl.includes("abi_decode") && tl.includes("evm_tx_decode"));
});
// Typed-tx sender vectors signed with the publicly documented web3.py example key 0x4c0883a6…2318 (address 0x2c7536E3605D9C16a7a3D7b1898e529396a65c23)
const T2 = "0x02f8b182210505843b9aca00847735940082c35094833589fcd6edb6e08f4c7c32d4f71b54bda0291380b844a9059cbb000000000000000000000000719227f384b66bfef00093d6d8d32fa9dc2b40e70000000000000000000000000000000000000000000000000000000000002710c080a04bac95663102d20e4a98ff2995149d140d318237fa7ec1b9842cb6bace064577a02a474ae620ed184651c2eec9caa82c90a3bf09f39381fbfd3fee943ea58bbd8f";
const T1 = "0x01f8650180843b9aca008252089435353535353535353535353535353535353535350180c080a0a25746ca2ed3fd39a990813affa73231c08b0d0566f96f5a5e6f047e959ed182a00a69d4fe1c68704e4396c7482327275873be2b58581ef732f3a079699bfbcafc";
test("evmtx sender recovery: EIP-155 spec vector + EIP-1559/2930 signed vectors", async () => {
  const o = (await evmtx({ raw: EIP155 })).body;
  assert.equal(o.from, "0x9d8A62f656a8d1615C1294fd71e9CFb3E4855A4F"); assert.equal(o.sender.signing_hash, "0xdaf5a779ae972f972197303d7b574746c7ef83eadac0f2791ad23db92e4c8e53"); assert.equal(o.sender.high_s, false);
  const b2 = (await evmtx({ raw: T2 })).body; assert.equal(b2.from, "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23"); assert.equal(b2.chain, "Base"); assert.equal(b2.call.function, "transfer(address,uint256)");
  const b1 = (await evmtx({ raw: T1 })).body; assert.equal(b1.from, "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23"); assert.equal(b1.type_name, "EIP-2930");
  const tampered = (await evmtx({ raw: T2.replace("c350", "c351") })).body; assert.notEqual(tampered.from, "0x2c7536E3605D9C16a7a3D7b1898e529396a65c23");
  const badR = (await evmtx({ raw: EIP155.replace("28ef61340bd939bc2195fe537567866003e1a15d3c71ff63e1590620aa636276", "f".repeat(64)) })).body; assert.equal(badR.from, null); assert.ok(badR.sender_error);
});
