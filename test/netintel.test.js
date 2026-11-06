import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { normHost, parseSpf, parseDmarc, isPrivateIp } from "../src/netintel.js";
const N = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, CAA: 257, SOA: 6 };
const zone = { "acme.test": { A: ["93.184.216.34"], MX: ["10 mx1.acme.test.", "20 mx2.acme.test."], TXT: ['"v=spf1 include:_spf.google.com ~all"', '"google-site-verification=x"'], NS: ["ns1.acme.test."] },
  "_dmarc.acme.test": { TXT: ['"v=DMARC1; p=reject; rua=mailto:d@acme.test"'] }, "evil.test": { A: ["10.0.0.5"] } };
const far = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 19), past = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 19);
let seen = [];
globalThis.fetch = async (u, o = {}) => { u = String(u); seen.push(u);
  if (u.startsWith("https://cloudflare-dns.com/dns-query")) { const q = new URL(u).searchParams, n = q.get("name"), t = q.get("type"), z = zone[n];
    return Response.json({ Status: z || n.startsWith("_dmarc.") ? 0 : 3, Answer: (z?.[t] || []).map((d) => ({ name: n, type: N[t], TTL: 300, data: d })) }); }
  if (u === "https://acme.test/") return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=1" } });
  if (u.startsWith("https://crt.sh/")) return Response.json([{ id: 1, issuer_name: "C=US, O=Let's Encrypt, CN=R11", common_name: "acme.test", name_value: "acme.test\nwww.acme.test", not_before: past, not_after: far, serial_number: "ab" }]);
  throw new Error("unexpected " + u); };
const env = { BEGGAR_DEMAND_TESTS_ENABLED: "true" };
const call = async (p, init) => { const r = await handle(new Request("https://w.test" + p, init), env); return [r.status, await r.json()]; };

test("normHost SSRF guards", () => {
  assert.equal(normHost("https://Acme.Test/path"), "acme.test"); assert.equal(normHost("acme.test."), "acme.test");
  for (const b of ["localhost", "10.0.0.1", "8.8.8.8", "[::1]", "x.local", "a.internal", "acme.test:8443", "u:p@acme.test", "nodot", ""]) assert.equal(normHost(b), null, b);
  assert.ok(isPrivateIp("192.168.1.1") && isPrivateIp("fd00::1") && isPrivateIp("::1") && !isPrivateIp("1.1.1.1") && !isPrivateIp("2606:4700::1111"));
});
test("SPF/DMARC parsing", () => {
  const s = parseSpf(["v=spf1 include:a.test include:b.test -all"]); assert.equal(s.policy, "fail"); assert.deepEqual(s.includes, ["a.test", "b.test"]); assert.ok(s.valid);
  assert.ok(parseSpf(["v=spf1 +all"]).issues.includes("permissive_plus_all")); assert.ok(parseSpf(["v=spf1 -all", "v=spf1 ~all"]).issues.includes("multiple_spf_records"));
  assert.equal(parseSpf([]).present, false);
  const d = parseDmarc(["v=DMARC1; p=none"]); assert.equal(d.policy, "none"); assert.ok(d.issues.includes("no_aggregate_reports_rua"));
});
test("/v1/netintel full shape", async () => {
  const [s, j] = await call("/v1/netintel?host=acme.test"); assert.equal(s, 200);
  assert.equal(j.rcode, "NOERROR"); assert.deepEqual(j.resolved_ips, ["93.184.216.34"]);
  assert.equal(j.email.mx[0].exchange, "mx1.acme.test"); assert.equal(j.email.spf.policy, "softfail"); assert.equal(j.email.dmarc.policy, "reject");
  assert.equal(j.tls.handshake_ok, true); assert.ok(j.tls.hsts); assert.equal(j.tls.certificate.found, true); assert.ok(j.tls.certificate.days_remaining >= 59);
  assert.match(j.tls.certificate.issuer, /Let's Encrypt/);
});
test("/v1/netintel guards: private resolution never probed, NXDOMAIN, bad host, POST", async () => {
  seen = []; const [, j] = await call("/v1/netintel?host=evil.test"); assert.equal(j.tls.skipped, "private_ip_ssrf_guard"); assert.ok(j.issues.includes("resolves_to_private_ip"));
  assert.ok(!seen.some((u) => u.startsWith("https://evil.test") || u.includes("10.0.0.5")));
  const [, n] = await call("/v1/netintel?host=nope.test"); assert.equal(n.rcode, "NXDOMAIN"); assert.equal(n.tls, null);
  assert.equal((await call("/v1/netintel?host=127.0.0.1"))[0], 400);
  const [ps, pj] = await call("/v1/netintel", { method: "POST", body: JSON.stringify({ host: "acme.test", types: "MX", tls: false }) });
  assert.equal(ps, 200); assert.deepEqual(Object.keys(pj.records), ["MX"]); assert.equal(pj.tls, null);
});
test("/v1/netintel paywalled + discoverable", async () => {
  const e = { ...env, X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
  const r = await handle(new Request("https://w.test/v1/netintel?host=acme.test"), e); assert.equal(r.status, 402);
  const b = await r.json(); assert.equal(b.accepts[0].payTo, "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7"); assert.equal(b.accepts[0].maxAmountRequired, "20000");
  const wk = await (await handle(new Request("https://w.test/.well-known/x402"), e)).json(); assert.ok(wk.endpoints.some((x) => x.resource.endsWith("/v1/netintel") && x.price === "0.02"));
  const oa = await (await handle(new Request("https://w.test/openapi.json"), e)).json(); assert.ok(oa.paths["/v1/netintel"].get && oa.paths["/v1/netintel"].post);
  assert.ok((await (await handle(new Request("https://w.test/llms.txt"), e)).text()).includes("/v1/netintel"));
});
