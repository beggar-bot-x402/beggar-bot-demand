import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { util, jsonDiff, extractContacts, BATCH_MAX } from "../src/tools.js";
const HTML = `<html><head><title>Acme</title><script type="application/ld+json">{"@type":"Organization","name":"Acme Ltd","email":"hello@acme.test","telephone":"+44 20 7946 0000","sameAs":["https://www.linkedin.com/company/acme","https://github.com/acme"],"address":{"streetAddress":"1 Road","addressLocality":"London"}}</script></head>
<body><a href="mailto:sales@acme.test?subject=hi">Sales</a><a href="tel:+1-415-555-0100">Call</a> support&#64;acme.test <img src="logo@2x.png"> <a href="https://x.com/acme">X</a><a href="https://twitter.com/intent/tweet?url=x">share</a><a href="https://facebook.com/">fb root</a></body></html>`;
let calls = 0;
globalThis.fetch = async (u) => { u = String(u); calls++;
  if (u.endsWith("/robots.txt")) return u.includes("blocked.test") ? new Response("User-agent: *\nDisallow: /") : new Response("", { status: 404 });
  if (u.startsWith("https://acme.test/")) return new Response(HTML, { headers: { "content-type": "text/html" } });
  throw new Error("unexpected " + u); };
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
const post = (b) => ({ method: "POST", body: JSON.stringify(b) });

test("util hash/uuid/base64", async () => {
  assert.equal((await util({ op: "hash", input: "abc" })).body.hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal((await util({ op: "hash", input: "abc", algorithm: "sha1" })).body.hex, "a9993e364706816aba3e25717850c26c9cd0d89d");
  assert.equal((await util({ op: "hash", input: "x", algorithm: "md5" })).status, 400);
  const u = (await util({ op: "uuid", count: "3" })).body.uuids; assert.equal(u.length, 3); assert.match(u[0], /^[0-9a-f-]{36}$/);
  assert.equal((await util({ op: "base64_encode", input: "héllo" })).body.output, "aMOpbGxv");
  assert.equal((await util({ op: "base64_decode", input: "aMOpbGxv" })).body.output, "héllo");
  assert.equal((await util({ op: "base64_encode", input: "\xff\xfe?", url_safe: true })).body.output.includes("="), false);
  assert.equal((await util({ op: "base64_decode", input: "@@@" })).status, 400);
});
test("util json/regex/units/tz", async () => {
  assert.equal((await util({ op: "json_validate", input: '{"a":1}' })).body.valid, true);
  assert.equal((await util({ op: "json_validate", input: "{a" })).body.valid, false);
  assert.deepEqual(jsonDiff({ a: 1, b: [1, 2] }, { a: 2, b: [1], c: "x" }), [{ op: "replace", path: "/a", from: 1, to: 2 }, { op: "remove", path: "/b/1", from: 2 }, { op: "add", path: "/c", to: "x" }]);
  assert.equal((await util({ op: "json_diff", a: '{"x":1}', b: { x: 1 } })).body.equal, true);
  const r = (await util({ op: "regex_match", pattern: "(\\d+)-(?<w>\\w)", input: "1-a 22-b" })).body; assert.equal(r.count, 2); assert.equal(r.matches[1].named.w, "b");
  assert.equal((await util({ op: "regex_match", pattern: "(" })).status, 400);
  assert.equal((await util({ op: "unit_convert", value: "1", from: "mi", to: "km" })).body.result, 1.609344);
  assert.equal((await util({ op: "unit_convert", value: 100, from: "C", to: "F" })).body.result, 212);
  assert.equal((await util({ op: "unit_convert", value: 1, from: "kg", to: "km" })).status, 400);
  const t = (await util({ op: "timezone_convert", time: "2026-07-01T12:00", from: "Europe/London", to: "Asia/Tokyo" })).body;
  assert.equal(t.utc, "2026-07-01T11:00:00.000Z"); assert.equal(t.to.local, "2026-07-01T20:00:00+09:00");
  assert.equal((await util({ op: "timezone_convert", time: "1700000000", to: "UTC" })).body.utc, "2023-11-14T22:13:20.000Z");
  assert.equal((await util({ op: "timezone_convert", to: "Mars/Base" })).status, 400);
  assert.equal((await util({ op: "nope" })).status, 400);
});
test("/v1/util GET+POST, zero outbound", async () => {
  calls = 0;
  assert.equal((await call("/v1/util?op=hash&input=abc"))[1].algorithm, "SHA-256");
  assert.equal((await call("/v1/util", post({ op: "unit_convert", value: 1, from: "gib", to: "mib" })))[1].result, 1024);
  assert.equal(calls, 0);
});
test("extractContacts page-public only", () => {
  const c = extractContacts(HTML, "https://acme.test/");
  assert.deepEqual(c.emails.map((e) => e.email).sort(), ["hello@acme.test", "sales@acme.test", "support@acme.test"]);
  assert.deepEqual(c.phones.map((p) => p.number).sort(), ["+14155550100", "+442079460000"]);
  assert.deepEqual(c.social.map((s) => s.platform).sort(), ["github", "linkedin", "x"]);
  assert.equal(c.organization.name, "Acme Ltd"); assert.equal(c.organization.address, "1 Road, London");
});
test("/v1/contacts + guards", async () => {
  const [s, j] = await call("/v1/contacts?url=https://acme.test/about"); assert.equal(s, 200); assert.equal(j.counts.emails, 3); assert.ok(!("_html" in j));
  assert.equal((await call("/v1/contacts?url=http://10.0.0.1/"))[0], 400);
  assert.equal((await call("/v1/contacts?url=https://blocked.test/"))[1].error, "blocked_by_robots_txt");
});
test("/v1/batch modes, cap, partial failure, shared robots", async () => {
  calls = 0;
  const [s, j] = await call("/v1/batch", post({ items: [{ url: "https://acme.test/a" }, { url: "https://acme.test/b", mode: "contacts" }, { url: "https://acme.test/c", mode: "both" }, { url: "http://127.0.0.1/" }] }));
  assert.equal(s, 200); assert.equal(j.count, 4); assert.equal(j.ok, 3); assert.equal(j.failed, 1);
  assert.ok(j.results[0].fetch && !j.results[0].contacts); assert.ok(j.results[1].contacts && !j.results[1].fetch); assert.ok(j.results[2].fetch && j.results[2].contacts);
  assert.equal(j.subrequests_used, 4); assert.equal(calls, 4); // 1 robots + 3 pages
  assert.ok(!JSON.stringify(j).includes("_html"));
  assert.equal((await call("/v1/batch", post({ urls: Array(BATCH_MAX + 1).fill("https://acme.test/") })))[0], 400);
  assert.equal((await call("/v1/batch", post({})))[0], 400);
  assert.equal((await call("/v1/batch", post({ urls: [] })))[0], 400);
});
test("new routes paywalled $0.01 + discovery + openapi + llms", async () => {
  const e = env(PAID);
  for (const [p, init] of [["/v1/util?op=uuid"], ["/v1/contacts?url=https://acme.test/"], ["/v1/batch", post({ urls: ["https://acme.test/"] })]]) {
    const [s, j] = await call(p, init, e); assert.equal(s, 402, p); assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.equal(j.accepts[0].payTo, PAID.X402_PAY_TO); assert.equal(j.accepts[0].network, "base");
  }
  const [, wk] = await call("/.well-known/x402", undefined, e);
  for (const p of ["/v1/util", "/v1/contacts", "/v1/batch"]) assert.ok(wk.endpoints.some((r) => r.resource.endsWith(p) && r.price === "0.02"), p);
  const [, oa] = await call("/openapi.json", undefined, e);
  assert.ok(oa.paths["/v1/util"].post && oa.paths["/v1/util"].get); assert.ok(oa.paths["/v1/contacts"].get && oa.paths["/v1/contacts"].post); assert.ok(oa.paths["/v1/batch"].post["x-payment-info"]);
  assert.equal(oa.paths["/v1/batch"].post.requestBody.content["application/json"].schema.properties.urls.type, "array");
  const llms = await (await handle(new Request("https://w.test/llms.txt"), e)).text(); for (const p of ["/v1/util", "/v1/contacts", "/v1/batch"]) assert.ok(llms.includes(p));
});
