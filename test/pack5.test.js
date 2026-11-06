import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { userop, evmaddr } from "../src/aa.js";
import { soltx, b58enc } from "../src/soltx.js";
import { subtitle } from "../src/subtitle.js";
import { PAID_PATHS } from "../src/x402.js";
globalThis.fetch = async (u) => { throw new Error("no outbound allowed: " + u); };
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
const NEW = ["/v1/userop", "/v1/evmaddr", "/v1/soltx", "/v1/subtitle"];
// vectors cross-checked with viem 2.x (getUserOperationHash, getContractAddress, namehash) and @solana/web3.js
const CD = "0xb61d27f6000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000044a9059cbb000000000000000000000000719227f384b66bfef00093d6d8d32fa9dc2b40e70000000000000000000000000000000000000000000000000000000000004e2000000000000000000000000000000000000000000000000000000000";
const OP7 = {"sender":"0x1306b01bC3e4AD202612D3843387e94737673F53","nonce":"5","factory":"0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985","factoryData":"0x5fbfb9cf0000000000000000000000001000ea6242924445ab7a0086d0c91c2a31b0e97d0000000000000000000000000000000000000000000000000000000000000000","callData":CD,"callGasLimit":"100000","verificationGasLimit":"300000","preVerificationGas":"50000","maxFeePerGas":"2000000000","maxPriorityFeePerGas":"1000000","paymaster":"0x2cc0c7981D846b9F2a16276556f6e8cb52BfB633","paymasterVerificationGasLimit":"60000","paymasterPostOpGasLimit":"40000","paymasterData":"0xdeadbeef","signature":"0x"};
const OP6 = { sender: OP7.sender, nonce: "5", initCode: "0x", callData: CD, callGasLimit: "100000", verificationGasLimit: "300000", preVerificationGas: "50000", maxFeePerGas: "2000000000", maxPriorityFeePerGas: "1000000", paymasterAndData: "0x", signature: "0x" };
const SOL_FULL = "Ao99weYnhTRDqxRCvBhnh6bgdc2Wctl8JnKvxv8Wp6b1rc/0H8udvaFeqsMurSU0HXwJDfjQkbYWss5U03LjwANXvP/vTrgEhtCnv9xV3rxBCozc8NNoaEzGFO7yC+pf044Ac3epR69CKzs7yTVQYQV33Z1YMbgscHlDigaC+s0OAgAGC+pKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIs/RckOFqgx1tk+3jNYC+h2ZH96/drE8WO1wLqyDXp9hhfZPTjA2uksxbaU+n6MTMwx33fGlSEu7ljqCiM1OBB5oUPLW4CpHr4JNCatp3ELXDLKMv6JJ+37le50lbBJ2Lv0OuWd601oec7WdvAjXPQPd9+X1CaqcrPLQ7XWmtBUDoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKnjMtr5L6vs6LY/96RABeX9/Zr6FYdWthxalfkEs7jQgQYHAAUCQJwAAAcACQOIEwAAAAAAAAYGAAQDCAUKAQEKBAIIBAEKDCBOAAAAAAAABgkAC3g0MDIgYmVnZ2FyBQIBAwwCAAAAYOMWAAAAAAA=";
const SOL_PARTIAL = "AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABXvP/vTrgEhtCnv9xV3rxBCozc8NNoaEzGFO7yC+pf044Ac3epR69CKzs7yTVQYQV33Z1YMbgscHlDigaC+s0OAgAGC+pKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIs/RckOFqgx1tk+3jNYC+h2ZH96/drE8WO1wLqyDXp9hhfZPTjA2uksxbaU+n6MTMwx33fGlSEu7ljqCiM1OBB5oUPLW4CpHr4JNCatp3ELXDLKMv6JJ+37le50lbBJ2Lv0OuWd601oec7WdvAjXPQPd9+X1CaqcrPLQ7XWmtBUDoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIyXJY9OJInxuz0QKRSODYMLWhOZ2v8QhASOe9jb6fhZAwZGb+UhFzL/7K26csOb57yM5bvF9xJrLEObOkAAAADG+nrzvtutOj1l82qryXQxsbvkwtL24OR8pgIDRS9dYQVKU1qZKSEGTSTocWDaOHx8NbXdvJK7geQfqEBBBUSNBt324ddloZPZy+FGzut5rBy0he1fWzeROoz1hX7/AKnjMtr5L6vs6LY/96RABeX9/Zr6FYdWthxalfkEs7jQgQYHAAUCQJwAAAcACQOIEwAAAAAAAAYGAAQDCAUKAQEKBAIIBAEKDCBOAAAAAAAABgkAC3g0MDIgYmVnZ2FyBQIBAwwCAAAAYOMWAAAAAAA=";
const SOL_V0 = "AQwVEmRihBKfI3tyDOjMggXUb9A7S2oiyBfsVAhjF8UO7wIAWokIcw1Bi5qWaGtmAi1xrNthNo4aqCtn1q76Wg+AAQABAupKbGPinFIKvvVQexMuxfmVR3auvr57kkIe6mkURtIsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADjMtr5L6vs6LY/96RABeX9/Zr6FYdWthxalfkEs7jQgQEBAgACDAIAAADoAwAAAAAAAAECd6avlzObesiNGJLJBEb1AAIwkmb2LlPBGCRJggAAAAEAAA==";
test("userop: v0.6/v0.7/v0.8 hashes match viem on Base", async () => {
  const a = (await userop({ userop: OP7 })).body; assert.equal(a.entrypoint_version, "0.7");
  assert.equal(a.user_op_hash, "0x487f43dfb7e5c2ba5ed0167471d98d8d4146a1abd060991c2128ce5a5bf8eb49");
  assert.equal(a.alt_hash.user_op_hash, "0x7e4ea18ebc3dc76c4d695fd35303668c0d16603258dc555af0dfb7ca7e1f6500");
  assert.equal(a.gas.total_gas_limit, "550000"); assert.equal(a.gas_sponsored, true); assert.equal(a.deploys_account, true);
  const b = (await userop({ userop: OP6 })).body; assert.equal(b.user_op_hash, "0x455133a07d38bac193cc96e71165b8497d6e29bd93a8b58d5d75104a2291f240");
  const c = (await userop({ userop: { sender: OP7.sender, nonce: "5", ...a.packed, callData: CD, preVerificationGas: "50000", signature: "0x" }, version: "0.8" })).body;
  assert.equal(c.user_op_hash, "0x7e4ea18ebc3dc76c4d695fd35303668c0d16603258dc555af0dfb7ca7e1f6500");
  assert.match(JSON.stringify(a), /a9059cbb|transfer/i);
});
test("userop: bad input 400", async () => { assert.equal((await userop({})).status, 400); assert.equal((await userop({ userop: "{not json" })).status, 400); });
test("evmaddr: CREATE / CREATE2 / ENS namehash / checksum", async () => {
  assert.equal((await evmaddr({ deployer: "0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0", nonce: "1" })).body.create.address, "0x343c43A37D37dfF08AE8C4A11544c718AbB4fCF8");
  assert.equal((await evmaddr({ deployer: "0x6ac7ea33f8831ea9dcc53393aaa88b25a785dbf0", nonce: "300" })).body.create.address, "0x47Bbbb5FE97aa84c3fA30DafBb067284d250C24c");
  assert.equal((await evmaddr({ deployer: "0x0000000000ffe8b47b3e2130213b802212439497", salt: "0x" + "0".repeat(63) + "1", init_code: "0x6080" })).body.create2.address, "0xc41DBB75566860c99e8897A73e6AF82542a229f5");
  assert.equal((await evmaddr({ name: "vitalik.eth" })).body.ens.namehash, "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835");
  assert.match(JSON.stringify((await evmaddr({ address: "0x719227f384b66bfef00093d6d8d32fa9dc2b40e7" })).body), /0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7/);
  assert.equal((await evmaddr({})).status, 400);
});
test("soltx: legacy USDC TransferChecked + fees + valid sigs", async () => {
  const o = await soltx({ tx: SOL_FULL }); assert.equal(o.status, 200); const b = o.body; assert.equal(b.version, "legacy");
  assert.equal(b.fee_payer, "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB"); assert.equal(b.tx_id, "3sPoxh281bCNU7c3BbuQxxFLr2hxrN7he2AiTcawtQAt6iUQGNFDxGkQnv2tDAQRAf3MdYuSBgjNGMUE8HH6Kxp2");
  const tc = b.instructions.find((i) => i.parsed?.type === "TransferChecked").parsed; assert.equal(tc.amount, "20000"); assert.equal(tc.token, "USDC");
  assert.equal(b.instructions.find((i) => i.parsed?.type === "Memo").parsed.memo, "x402 beggar");
  assert.equal(b.fee_estimate.total_lamports, "10200"); assert.deepEqual(b.signature_check.map((s) => s.status), ["valid", "valid"]);
});
test("soltx: partially signed (x402 SVM pattern), tamper, v0 + ALT, base58", async () => {
  const p = (await soltx({ tx: SOL_PARTIAL })).body; assert.equal(p.partially_signed, true); assert.equal(p.tx_id, null); assert.match(p.signature_check[0].status, /missing/);
  const t = Uint8Array.from(atob(SOL_FULL), (c) => c.charCodeAt(0)); t[t.length - 3] ^= 1; assert.equal((await soltx({ tx: btoa(String.fromCharCode(...t)) })).body.signature_check[0].status, "INVALID");
  const v = (await soltx({ tx: SOL_V0 })).body; assert.equal(v.version, 0); assert.equal(v.address_lookup_tables.length, 1); assert.equal(v.signature_check[0].status, "valid");
  const b58 = (await soltx({ tx: b58enc(Uint8Array.from(atob(SOL_V0), (c) => c.charCodeAt(0))) })).body; assert.equal(b58.encoding, "base58"); assert.equal(b58.tx_id, v.tx_id);
  assert.equal((await soltx({ tx: "abcd" })).status, 400); assert.equal((await soltx({})).status, 400);
});
const SRT = "\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\n<i>Hello</i> world\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,000\r\nThis line is extremely long and definitely exceeds the forty-two char limit\r\n\r\n3\r\n00:00:06,000 --> 00:00:06,200\r\nHi\r\n";
test("subtitle: SRT→VTT shift + QC issues", async () => {
  const b = (await subtitle({ text: SRT, to: "vtt", shift_ms: "1500" })).body; assert.equal(b.cues, 3); assert.equal(b.valid, false);
  assert.deepEqual(b.issue_counts, { reading_speed: 1, line_too_long: 1, overlap: 1, too_short: 1 });
  assert.ok(b.vtt.startsWith("WEBVTT\n\n00:00:02.500 --> 00:00:05.000\n<i>Hello</i> world\n"));
  const f = (await subtitle({ text: SRT, fix_overlaps: "true" })).body; assert.equal(f.issue_counts.overlap, undefined);
});
test("subtitle: VTT→SRT fps, sync, transcript, errors", async () => {
  const vtt = "WEBVTT - t\n\nNOTE hi\n\nintro\n00:01.000 --> 00:02.000 align:start\nA\n\n00:00:03.000 --> 00:00:04.000\nB\n";
  const b = (await subtitle({ text: vtt, to: "srt", from_fps: 25, to_fps: 23.976 })).body; assert.equal(b.input_format, "vtt"); assert.ok(b.srt.startsWith("1\n00:00:01,043 --> 00:00:02,085\nA"));
  const s = (await subtitle({ text: SRT, to: "all", sync: [{ cue: 1, at: "00:00:02,000" }, { cue: 3, at: "00:00:12,000" }] })).body; assert.deepEqual(s.cues_json.map((c) => c.start), ["00:00:02.000", "00:00:06.000", "00:00:12.000"]);
  assert.equal(s.transcript.split("\n")[0], "Hello world");
  assert.equal((await subtitle({ b64: btoa("1\n00:00:00,500 --> 00:00:01,500\nok\n") })).body.cues, 1);
  assert.equal((await subtitle({ text: "nonsense" })).status, 400); assert.equal((await subtitle({ text: SRT, to: "docx" })).status, 400);
});
test("routes: free mode serves, PAID mode 402 at 20000 atomic, discovery lists all 26", async () => {
  for (const p of NEW) assert.ok(PAID_PATHS.has(p)); assert.ok(PAID_PATHS.size >= 60);
  const [s1, b1] = await call("/v1/evmaddr?name=vitalik.eth"); assert.equal(s1, 200); assert.equal(b1.ens.labels, 2);
  const [s2] = await call("/v1/userop", { method: "POST", body: JSON.stringify({ userop: OP6 }) }); assert.equal(s2, 200);
  const [s3] = await call("/v1/soltx", { method: "POST", body: JSON.stringify({ tx: SOL_V0 }) }); assert.equal(s3, 200);
  const [s4] = await call("/v1/subtitle", { method: "POST", body: JSON.stringify({ text: SRT }) }); assert.equal(s4, 200);
  for (const p of NEW) { const [s, b] = await call(p, { method: "POST", body: "{}" }, env(PAID)); assert.equal(s, 402, p); assert.equal(b.accepts[0].maxAmountRequired, "20000"); assert.equal(b.accepts[0].payTo, PAID.X402_PAY_TO); }
  const [, wk] = await call("/.well-known/x402", undefined, env(PAID)); for (const p of NEW) assert.ok(JSON.stringify(wk).includes(p), p);
  const [, oa] = await call("/openapi.json", undefined, env(PAID)); for (const p of NEW) assert.ok(oa.paths[p], p);
});
