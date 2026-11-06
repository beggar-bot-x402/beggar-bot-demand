import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { sigrecover, svgsanitize, typedDigest } from "../src/sig.js";
import { evmlog, parseEvent } from "../src/evmlog.js";
import { keccak } from "../src/evm.js";
globalThis.fetch = async (u) => { throw new Error("no outbound allowed: " + u); };
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
// test-only ECDSA signer (deterministic k from hash; never shipped)
const P = 2n ** 256n - 2n ** 32n - 977n, N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n, G = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n];
const md = (a, m = P) => ((a % m) + m) % m; const iv = (a, m = P) => { let [x, y, u, v] = [md(a, m), m, 1n, 0n]; while (x) { const q = y / x; [x, y, u, v] = [y - q * x, x, v - q * u, u]; } return md(v, m); };
const ad = (p, q) => { if (!p) return q; if (!q) return p; if (p[0] === q[0] && p[1] !== q[1]) return null; const l = p[0] === q[0] ? md(3n * p[0] * p[0] * iv(2n * p[1])) : md((q[1] - p[1]) * iv(q[0] - p[0])); const x = md(l * l - p[0] - q[0]); return [x, md(l * (p[0] - x) - p[1])]; };
const ml = (k, p = G) => { let r = null; while (k) { if (k & 1n) r = ad(r, p); p = ad(p, p); k >>= 1n; } return r; };
const H = (u) => [...u].map((b) => b.toString(16).padStart(2, "0")).join(""), B = (n) => n.toString(16).padStart(64, "0");
const addrOf = (d) => { const [x, y] = ml(d); const pub = Uint8Array.from((B(x) + B(y)).match(/../g), (h) => parseInt(h, 16)); return "0x" + H(keccak(pub)).slice(24); };
const sign = (h, d) => { const z = BigInt("0x" + H(h)), k = md(z ^ d, N) || 1n, R = ml(k), r = md(R[0], N); let s = md(iv(k, N) * (z + r * d), N), v = Number(R[1] & 1n); if (s > N / 2n) { s = N - s; v ^= 1; } return { r, s, v, hex: "0x" + B(r) + B(s) + (27 + v).toString(16) }; };
const D = 0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318n, ADDR = addrOf(D);
const pm = (m) => { const b = new TextEncoder().encode(m); return keccak(new Uint8Array([...new TextEncoder().encode("\x19Ethereum Signed Message:\n" + b.length), ...b])); };
const MAIL = { types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }], Person: [{ name: "name", type: "string" }, { name: "wallet", type: "address" }], Mail: [{ name: "from", type: "Person" }, { name: "to", type: "Person" }, { name: "contents", type: "string" }] },
  primaryType: "Mail", domain: { name: "Ether Mail", version: "1", chainId: 1, verifyingContract: "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" }, message: { from: { name: "Cow", wallet: "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826" }, to: { name: "Bob", wallet: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" }, contents: "Hello, Bob!" } };
test("EIP-712 spec Mail vector: digest + signer (Cow)", async () => {
  const d = typedDigest(MAIL); assert.equal("0x" + H(d.digest), "0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2"); assert.equal(d.domain_separator, "0xf2cee375fa42b42143804025fc449deafd50cc031ca257e0b194a650a912090f");
  const cow = BigInt("0x" + H(keccak(new TextEncoder().encode("cow")))); assert.equal(addrOf(cow), "0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826"); const sig = sign(d.digest, cow).hex;
  const o = (await sigrecover({ typed_data: JSON.stringify(MAIL), signature: sig, expected: "0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826" })).body;
  assert.equal(o.signer, "0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826"); assert.equal(o.matches, true); assert.equal(o.encode_type, "Mail(Person from,Person to,string contents)Person(string name,address wallet)");
});
test("personal_sign, hex message, raw hash, EIP-2098 compact, mismatch, errors", async () => {
  const s = sign(pm("hello beggar"), D); const o = (await sigrecover({ message: "hello beggar", signature: s.hex, expected: ADDR })).body; assert.equal(o.matches, true); assert.equal(o.mode, "eip191_personal_sign");
  const sh = sign(pm("hi"), D); assert.equal((await sigrecover({ message: "0x6869", signature: sh.hex })).body.signer.toLowerCase(), ADDR);
  const h = keccak(new Uint8Array([1, 2, 3])), sr = sign(h, D); assert.equal((await sigrecover({ hash: "0x" + H(h), signature: sr.hex })).body.signer.toLowerCase(), ADDR);
  const vs = (BigInt(sr.v) << 255n) | sr.s; const c = (await sigrecover({ hash: "0x" + H(h), signature: "0x" + B(sr.r) + B(vs) })).body; assert.equal(c.signer.toLowerCase(), ADDR); assert.equal(c.compact_eip2098, true);
  assert.equal((await sigrecover({ message: "other", signature: s.hex, expected: ADDR })).body.matches, false);
  const hi = "0x" + B(s.r) + B(N - s.s) + (28 - s.v).toString(16); assert.match((await sigrecover({ message: "hello beggar", signature: hi })).body.warning, /high-s/);
  assert.equal((await sigrecover({ message: "x" })).status, 400); assert.equal((await sigrecover({ message: "x", hash: "0x00", signature: s.hex })).status, 400);
  assert.equal((await sigrecover({ message: "x", signature: "0x1234" })).status, 200); assert.equal((await sigrecover({ typed_data: "{}", signature: s.hex })).status, 400);
});
test("svgsanitize strips XSS vectors, keeps shapes", async () => {
  const evil = `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)" viewBox="0 0 10 10"><script>alert(2)</script><rect width="5" height="5" fill="red" onclick="x()"/><a href="javascript:alert(3)"><circle r="2"/></a><a xlink:href="&#106;avascript:alert(4)"><text>hi &amp; bye</text></a><foreignObject><iframe src="x"></iframe></foreignObject><image href="https://evil.test/p.png"/><use href="#r"/><style>@import url(evil.css);</style><g style="fill:url(http://e.test/x)"><path d="M0 0L1 1"/></g></svg>`;
  const o = (await svgsanitize({ svg: evil })).body; assert.equal(o.valid, true); assert.equal(o.changed, true);
  for (const bad of ["script", "onload", "onclick", "javascript", "foreignObject", "iframe", "evil", "ENTITY", "@import", "alert"]) assert.ok(!o.svg.includes(bad), bad + " survived: " + o.svg);
  assert.match(o.svg, /<rect width="5" height="5" fill="red"\/>/); assert.match(o.svg, /<use href="#r"\/>/); assert.match(o.svg, /hi &amp; bye/); assert.match(o.svg, /<path d="M0 0L1 1"\/>/);
  assert.equal((await svgsanitize({ svg: "<div>no</div>" })).body.valid, false); assert.equal((await svgsanitize({})).status, 400);
  assert.equal((await svgsanitize({ b64: btoa('<svg><circle r="1"/></svg>') })).body.changed, false);
  assert.ok(!(await svgsanitize({ svg: '<svg><svg:script>x</svg:script><SCRIPT>y</SCRIPT><a href=" jav&#x09;ascript:z">q</a></svg>' })).body.svg.match(/script|jav/i));
});
const T = (h) => "0x" + h.replace(/^0x/, "").padStart(64, "0"), USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
test("evmlog: USDC transfer, NFT transfer, unlimited approval, supplied event, unknown, receipt", async () => {
  const tr = parseEvent("Transfer(address indexed from,address indexed to,uint256 value)"); assert.equal(tr.topic0, "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef");
  const one = (await evmlog({ address: USDC, topics: [tr.topic0, T("ab"), T("719227f384b66bfef00093d6d8d32fa9dc2b40e7")], data: T("2710") })).body;
  assert.equal(one.logs[0].event, "Transfer"); assert.equal(one.logs[0].amount, "0.01 USDC"); assert.equal(one.logs[0].args[1].value, "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7");
  const nft = (await evmlog({ topics: [tr.topic0, T("0"), T("ab"), T("7")], data: "0x" })).body.logs[0]; assert.equal(nft.args[2].value, "7"); assert.equal(nft.kind, "mint");
  const ap = (await evmlog({ logs: [{ address: USDC, topics: ["0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925", T("1"), T("2")], data: "0x" + "f".repeat(64) }] })).body.logs[0]; assert.equal(ap.warning, "UNLIMITED approval");
  const cu = parseEvent("Ping(address indexed who,string msg)"); const data = T("20") + T("2").slice(2) + "6869".padEnd(64, "0");
  const s = (await evmlog({ topics: [cu.topic0, T("5")], data, events: ["Ping(address indexed who,string msg)"] })).body.logs[0]; assert.equal(s.source, "supplied"); assert.equal(s.args[1].value, "hi");
  assert.equal((await evmlog({ topics: [T("dead")], data: "0x" })).body.logs[0].decoded, false);
  const r = (await evmlog({ receipt: { logs: [{ topics: [tr.topic0, T("1"), T("0")], data: T("de0b6b3a7640000"), address: "0x4200000000000000000000000000000000000006" }, { topics: ["0x12"] }] } })).body;
  assert.equal(r.count, 2); assert.equal(r.decoded, 1); assert.deepEqual(r.summary, ["Transfer 1 WETH (burn)"]); assert.equal(r.logs[1].decoded, false);
  assert.equal((await evmlog({})).status, 400);
});
test("routes: free 200, paid 402, discovery + OpenAPI list all three", async () => {
  assert.equal((await call("/v1/svgsanitize", { method: "POST", body: JSON.stringify({ svg: "<svg/>" }) }))[0], 200);
  assert.equal((await call("/v1/sigrecover?hash=0x" + "00".repeat(32) + "&signature=0x" + "11".repeat(65)))[0], 200);
  for (const p of ["/v1/sigrecover", "/v1/svgsanitize", "/v1/evmlog"]) { assert.equal((await call(p + "?x=1", undefined, env(PAID)))[0], 402, p); }
  const [, wk] = await call("/.well-known/x402", undefined, env(PAID)); for (const p of ["/v1/sigrecover", "/v1/svgsanitize", "/v1/evmlog"]) assert.ok(wk.endpoints.some((r) => r.resource.endsWith(p)), p);
  const r = await handle(new Request("https://w.test/openapi.json"), env(PAID)); const o = await r.json(); for (const p of ["/v1/sigrecover", "/v1/svgsanitize", "/v1/evmlog"]) assert.ok(o.paths[p], p);
});
