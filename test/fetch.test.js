import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js"; import { fetchSafeUrl, robotsAllows, extract, UA } from "../src/fetchpage.js";
const PAGE = `<!doctype html><html lang="en"><head><title>Hello &amp; World</title><meta name="description" content="desc"><meta property="article:published_time" content="2026-10-01T10:00:00Z"><script>evil()</script></head>
<body><nav><a href="/nav">Nav</a></nav><article><h1>Big Title</h1><p>Some <strong>bold</strong> text with a <a href="/rel">link</a>.</p><ul><li>one</li><li>two</li></ul><pre>code  here</pre></article><footer>foot</footer></body></html>`;
const seen = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url); seen.push({ u, ua: new Headers(init.headers).get("user-agent") });
  if (u.endsWith("/robots.txt")) return u.includes("norobots.test") ? new Response("User-agent: *\nDisallow: /private\n\nUser-agent: BeggarBot\nDisallow: /\n") : new Response("", { status: 404 });
  if (u === "https://site.test/a") return new Response(PAGE, { headers: { "content-type": "text/html; charset=utf-8" } });
  if (u === "https://site.test/r") return new Response(null, { status: 302, headers: { location: "/a" } });
  if (u === "https://site.test/evil") return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } });
  if (u === "https://site.test/pdf") return new Response("x", { headers: { "content-type": "application/pdf" } });
  if (u === "https://site.test/big") return new Response("<p>" + "a ".repeat(800_000) + "</p>", { headers: { "content-type": "text/html" } });
  throw new Error("unexpected " + u);
};
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", OPERATOR_NAME: "Beggar Bot", ...o });
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };

test("fetchSafeUrl SSRF guards", () => {
  for (const u of ["ftp://x.com/", "file:///etc/passwd", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://10.1.2.3/", "http://169.254.169.254/", "http://[::1]/", "http://[fd00::1]/", "http://localhost/", "http://metadata.google.internal/", "http://192.168.1.1/", "http://100.64.0.1/", "https://a.com:8443/", "https://u:p@a.com/", "http://intranet/"]) assert.equal(fetchSafeUrl(u), null, u);
  assert.ok(fetchSafeUrl("https://example.com/x#frag")); assert.ok(fetchSafeUrl("http://example.com/")); assert.equal(fetchSafeUrl("https://example.com/x#f").hash, "");
});
test("robots.txt parsing", () => {
  const t = "User-agent: *\nDisallow: /private\nAllow: /private/ok\n";
  assert.equal(robotsAllows(t, "/public"), true); assert.equal(robotsAllows(t, "/private/x"), false); assert.equal(robotsAllows(t, "/private/ok/1"), true);
  assert.equal(robotsAllows("User-agent: BeggarBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n", "/x"), false);
  assert.equal(robotsAllows("", "/x"), true);
});
test("extract markdown/title/links/date", () => {
  const x = extract(PAGE, "https://site.test/a");
  assert.equal(x.title, "Hello & World"); assert.equal(x.published_at, "2026-10-01T10:00:00Z"); assert.equal(x.description, "desc"); assert.equal(x.lang, "en");
  assert.match(x.markdown, /^# Big Title/); assert.match(x.markdown, /\*\*bold\*\*/); assert.match(x.markdown, /\[link\]\(https:\/\/site\.test\/rel\)/); assert.match(x.markdown, /- one\n- two/);
  assert.ok(!x.markdown.includes("evil") && !x.markdown.includes("Nav") && !x.markdown.includes("foot"));
  assert.deepEqual(x.links, [{ text: "link", href: "https://site.test/rel" }]);
});
test("/v1/fetch GET + POST + redirect + UA", async () => {
  const [s, j] = await call("/v1/fetch?url=" + encodeURIComponent("https://site.test/r"));
  assert.equal(s, 200); assert.equal(j.final_url, "https://site.test/a"); assert.equal(j.redirects, 1); assert.equal(j.title, "Hello & World"); assert.ok(j.word_count > 5);
  assert.ok(seen.every((x) => x.ua === UA));
  const [s2, j2] = await call("/v1/fetch", { method: "POST", body: JSON.stringify({ url: "https://site.test/a" }) }); assert.equal(s2, 200); assert.equal(j2.published_at, "2026-10-01T10:00:00Z");
});
test("/v1/fetch errors: robots, SSRF redirect, type, size cap, bad url", async () => {
  assert.equal((await call("/v1/fetch?url=https://norobots.test/x"))[1].error, "blocked_by_robots_txt");
  assert.equal((await call("/v1/fetch?url=https://site.test/evil"))[1].error, "redirect_to_disallowed_target");
  assert.equal((await call("/v1/fetch?url=https://site.test/pdf"))[0], 415);
  const [, b] = await call("/v1/fetch?url=https://site.test/big"); assert.equal(b.truncated, true); assert.ok(b.bytes <= 1_000_000);
  assert.equal((await call("/v1/fetch?url=http://169.254.169.254/"))[0], 400); assert.equal((await call("/v1/fetch"))[0], 400);
});
test("/v1/fetch paywalled $0.01 mainnet + discovery + MCP", async () => {
  const e = env({ X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" });
  const [s, j] = await call("/v1/fetch?url=https://site.test/a", undefined, e); assert.equal(s, 402);
  assert.equal(j.accepts[0].maxAmountRequired, "20000"); assert.equal(j.accepts[0].payTo, "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7"); assert.equal(j.accepts[0].network, "base");
  assert.equal((await call("/v1/fetch", { method: "POST", body: "{}" }, e))[0], 402);
  const [, wk] = await call("/.well-known/x402", undefined, e); assert.ok(wk.endpoints.some((r) => r.resource.endsWith("/v1/fetch") && r.price === "0.02"));
  const [, oa] = await call("/openapi.json", undefined, e); assert.ok(oa.paths["/v1/fetch"].get && oa.paths["/v1/fetch"].post); assert.ok(oa.paths["/v1/fetch"].get["x-payment-info"]);
  const [, t] = await call("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }, e); assert.ok(t.result.tools.some((x) => x.name === "fetch_url"));
});
