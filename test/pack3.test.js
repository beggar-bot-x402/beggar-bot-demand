import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { parseCsv, flatten, unflatten, transform, gradeHeaders, parseRobots, parseSitemap } from "../src/pack3.js";
let seen = [];
const SEC = { "strict-transport-security": "max-age=31536000", "content-security-policy": "default-src 'self'", "x-frame-options": "DENY", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "permissions-policy": "camera=()" };
globalThis.fetch = async (u) => { u = String(u); seen.push(u);
  if (u === "http://acme.test/") return new Response(null, { status: 301, headers: { location: "https://acme.test/" } });
  if (u === "https://acme.test/") return new Response("ok", { headers: SEC });
  if (u === "https://loop.test/a") return new Response(null, { status: 302, headers: { location: "/b" } });
  if (u === "https://loop.test/b") return new Response(null, { status: 302, headers: { location: "/a" } });
  if (u === "https://evil.test/") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
  if (u === "https://site.test/robots.txt") return new Response("User-agent: *\nDisallow: /private\nCrawl-delay: 2\n\nUser-agent: GPTBot\nDisallow: /\nSitemap: https://site.test/sm-index.xml\n");
  if (u === "https://site.test/sm-index.xml") return new Response('<?xml version="1.0"?><sitemapindex><sitemap><loc>https://site.test/sm1.xml</loc><lastmod>2026-01-01</lastmod></sitemap></sitemapindex>');
  if (u === "https://site.test/sm1.xml") return new Response('<urlset><url><loc>https://site.test/a?x=1&amp;y=2</loc><lastmod>2026-02-01</lastmod></url><url><loc>https://site.test/b</loc><lastmod>2025-12-01</lastmod></url></urlset>');
  if (u === "https://none.test/robots.txt" || u === "https://none.test/sitemap.xml") return new Response("nf", { status: 404 });
  throw new Error("unexpected " + u); };
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
const post = (b) => ({ method: "POST", body: JSON.stringify(b) });

test("csv parse quoting + csv_to_json types", async () => {
  assert.deepEqual(parseCsv('a,b\r\n"x,1","say ""hi"""\n'), [["a", "b"], ["x,1", 'say "hi"']]);
  const o = await transform({ op: "csv_to_json", input: "n,ok,s\n1.5,true,\n2,false,z" });
  assert.deepEqual(o.body.data, [{ n: 1.5, ok: true, s: null }, { n: 2, ok: false, s: "z" }]);
  assert.deepEqual((await transform({ op: "csv_to_json", input: "a;b\n1;2", delimiter: ";", header: "false", infer_types: "false" })).body.data, [["a", "b"], ["1", "2"]]);
});
test("json_to_csv flattens + escapes", async () => {
  const o = await transform({ op: "json_to_csv", input: [{ a: { b: 1 }, c: "x,y" }, { a: { b: 2 }, d: 'q"' }] });
  assert.equal(o.body.csv, 'a.b,c,d\n1,"x,y",\n2,,"q"""');
});
test("flatten/unflatten roundtrip + proto safe", () => {
  const o = { a: { b: [1, { c: 2 }] }, e: {} }; const f = flatten(o);
  assert.deepEqual(f, { "a.b.0": 1, "a.b.1.c": 2, e: {} }); assert.deepEqual(unflatten(f), o);
  unflatten({ "__proto__.polluted": 1 }); assert.equal({}.polluted, undefined);
});
test("pick / sort_dedupe / stats / errors", async () => {
  assert.deepEqual((await transform({ op: "pick", input: '{"a":{"b":[5,6]}}', paths: "a.b[1],z" })).body.output, { "a.b[1]": 6, z: null });
  assert.deepEqual((await transform({ op: "sort_dedupe", input: [{ k: 3 }, { k: 1 }, { k: 3 }], key: "k", order: "desc" })).body.output, [{ k: 3 }, { k: 1 }]);
  const s = (await transform({ op: "stats", input: [1, 2, 3, 4, "x"] })).body; assert.equal(s.count, 4); assert.equal(s.median, 2.5); assert.equal(s.sum, 10);
  assert.equal((await transform({ op: "nope", input: "1" })).status, 400);
  assert.equal((await transform({ op: "flatten", input: "{bad" })).status, 400);
  assert.equal((await transform({ op: "stats" })).status, 400);
});
test("/v1/transform route GET+POST, zero outbound", async () => {
  seen = []; const [s, j] = await call("/v1/transform", post({ op: "flatten", input: { x: { y: 1 } } })); assert.equal(s, 200); assert.deepEqual(j.output, { "x.y": 1 });
  assert.equal((await call("/v1/transform?op=csv_to_json&input=a%0A1"))[1].data[0].a, 1); assert.equal(seen.length, 0);
});
test("security header grading", () => {
  assert.equal(gradeHeaders(new Headers(SEC), true).grade, "A");
  const w = gradeHeaders(new Headers({ "x-powered-by": "PHP/8" }), false); assert.equal(w.grade, "F"); assert.ok(w.issues.includes("not_https") && w.issues.includes("x_powered_by_disclosed"));
});
test("/v1/redirects chain, loop, SSRF hop blocked", async () => {
  const [s, j] = await call("/v1/redirects?url=http://acme.test/"); assert.equal(s, 200);
  assert.equal(j.redirect_count, 1); assert.equal(j.final_url, "https://acme.test/"); assert.equal(j.http_to_https, true); assert.equal(j.security_headers.grade, "A");
  assert.equal((await call("/v1/redirects?url=https://loop.test/a"))[1].loop, true);
  seen = []; const [, e] = await call("/v1/redirects", post({ url: "https://evil.test/" })); assert.equal(e.hops[0].blocked, "redirect_to_disallowed_target"); assert.ok(!seen.some((u) => u.includes("169.254")));
  assert.equal((await call("/v1/redirects?url=http://10.0.0.1/"))[0], 400);
  assert.equal((await call("/v1/redirects?url=https://acme.test:8443/"))[0], 400);
});
test("robots + sitemap parsers", () => {
  const r = parseRobots("User-agent: a\nUser-agent: b\nDisallow: /x\nSitemap: https://s/1.xml\n"); assert.deepEqual(r.groups[0].user_agents, ["a", "b"]); assert.deepEqual(r.sitemaps, ["https://s/1.xml"]);
  assert.equal(parseSitemap("<urlset><url><loc><![CDATA[https://x/1]]></loc></url></urlset>").entries[0].loc, "https://x/1");
});
test("/v1/sitemap follows index, path check per UA", async () => {
  const [s, j] = await call("/v1/sitemap?url=site.test&path=/private/a"); assert.equal(s, 200);
  assert.equal(j.url_count, 2); assert.equal(j.urls[0].loc, "https://site.test/a?x=1&y=2"); assert.equal(j.newest_lastmod, "2026-02-01");
  assert.equal(j.path_check.allowed, false); assert.equal(j.robots.groups[0].crawl_delay, 2);
  assert.equal((await call("/v1/sitemap?url=site.test&path=/ok&user_agent=GPTBot"))[1].path_check.allowed, false);
  assert.equal((await call("/v1/sitemap?url=site.test&path=/ok"))[1].path_check.allowed, true);
  const [, n] = await call("/v1/sitemap?url=https://none.test/"); assert.equal(n.robots.found, false); assert.equal(n.sitemaps[0].error, "upstream_status");
  assert.equal((await call("/v1/sitemap?url=localhost"))[0], 400);
});
test("new routes are x402-paywalled + in discovery/OpenAPI", async () => {
  for (const p of ["/v1/transform?op=stats&input=[1]", "/v1/redirects?url=https://acme.test/", "/v1/sitemap?url=site.test"]) assert.equal((await call(p, undefined, env(PAID)))[0], 402);
  const [, oa] = await call("/openapi.json", undefined, env(PAID)); for (const p of ["/v1/transform", "/v1/redirects", "/v1/sitemap"]) { assert.ok(oa.paths[p]); }
  assert.ok(oa.paths["/v1/redirects"].get["x-payment-info"]); assert.ok(oa.paths["/v1/transform"].post.requestBody);
  const [, wk] = await call("/.well-known/x402", undefined, env(PAID)); const s = JSON.stringify(wk); for (const p of ["/v1/transform", "/v1/redirects", "/v1/sitemap"]) assert.ok(s.includes(p));
});
