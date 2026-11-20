import test from "node:test"; import assert from "node:assert/strict";
import { DISCOVERY } from "../src/x402.js"; import { SEARCH_COPY, ALIASES } from "../src/searchcopy.js"; import { symbolMap, tokenprice } from "../src/chaindata.js";
test("search copy applied to DISCOVERY with ≤5 tags", () => {
  for (const p of Object.keys(SEARCH_COPY)) { const d = DISCOVERY[p]; assert.ok(d, p); assert.ok(d.description.startsWith(SEARCH_COPY[p].d), p); assert.ok(d.tags.length <= 5 && d.tags.length >= 3, p); assert.ok(d.description.length < 600, p); }
});
test("tokenprice symbol map", () => {
  assert.equal(symbolMap("base").ETH, "0x4200000000000000000000000000000000000006");
  assert.equal(symbolMap("base").BTC, "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf");
  assert.equal(symbolMap("ethereum").USDC, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
});
test("tokenprice unknown symbol -> 400 with hint (not charged)", async () => {
  const o = await tokenprice({ tokens: "NOTATOKEN" }); assert.equal(o.status, 400); assert.match(JSON.stringify(o.body), /ETH, BTC, USDC/);
  const e = await tokenprice({}); assert.equal(e.status, 400);
});
import { handle } from "../src/index.js";
test("paid-route input errors carry charged:false + example_call", async () => {
  const ENV = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "off", OPERATOR_NAME: "Beggar Bot" };
  for (const p of ["/v1/tokenprice", "/v1/portfolio", "/v1/ens"]) {
    const r = await handle(new Request("https://x.dev" + p), ENV); assert.equal(r.status, 400); const b = await r.json();
    assert.equal(b.charged, false); assert.ok(b.error); assert.ok(b.example_call.url.startsWith("https://x.dev" + p + "?"), p);
  }
  const nf = await handle(new Request("https://x.dev/v1/nope"), ENV); assert.equal(nf.status, 404); assert.equal((await nf.json()).charged, undefined);
});
test("slim x402-top manifest lists only demand-matched routes at 20000", async () => {
  const ENV = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://fac.test", OPERATOR_NAME: "Beggar Bot" };
  const r = await handle(new Request("https://x.dev/.well-known/x402-top.json"), ENV); assert.equal(r.status, 200); const t = await r.text(); const b = JSON.parse(t);
  assert.equal(b.resources.length, Object.keys(SEARCH_COPY).length + Object.keys(ALIASES).length); assert.ok(t.length < 100000, String(t.length));
  for (const x of b.resources) assert.equal(x.accepts[0].maxAmountRequired, "20000");
  const paths = b.resources.map((x) => new URL(x.resource).pathname);
  const aliases = Object.keys(ALIASES);
  assert.deepEqual(paths.slice(0, aliases.length), aliases);
  assert.equal(paths[aliases.length], Object.keys(SEARCH_COPY)[0]);
});
import { PAID_PATHS, paidConfig } from "../src/x402.js";
test("aliases: even count, paid 402 at 20000 with alias resource, serve canonical handler, CDP mapping", async () => {
  const ENV = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://fac.test", OPERATOR_NAME: "Beggar Bot", X402_CDP_ROUTES: "/v1/tokenprice,/v1/basename", CDP_API_KEY_ID: "k", CDP_API_KEY_SECRET: "s" };
  const A = Object.keys(ALIASES); assert.equal(A.length % 2, 0);
  for (const a of A) {
    assert.ok(PAID_PATHS.has(a), a); assert.ok(DISCOVERY[a], a);
    const r = await handle(new Request("https://x.dev" + a), ENV); assert.equal(r.status, 402, a); const b = await r.json();
    assert.equal(b.accepts[0].maxAmountRequired, "20000"); assert.equal(b.accepts[0].resource, "https://x.dev" + a);
  }
  assert.ok(paidConfig(ENV, "/v1/token-price").cdp); assert.ok(paidConfig(ENV, "/v1/basename/resolve").cdp); assert.ok(!paidConfig(ENV, "/v1/gas-price").cdp);
  const FREE = { BEGGAR_DEMAND_TESTS_ENABLED: "true", X402_MODE: "off", OPERATOR_NAME: "Beggar Bot" };
  const e = await handle(new Request("https://x.dev/v1/token-price"), FREE); assert.equal(e.status, 400); assert.match((await e.json()).error, /token/);
  const m = await (await handle(new Request("https://x.dev/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), ENV)).json();
  const N = new Set(m.result.tools.map((t) => t.name)); assert.equal(N.size, m.result.tools.length); for (const a of A) { const n = a.slice(4).replace(/\W+/g, "_"); assert.ok(N.has(n) || N.has(n + "_api"), a); }
});

test("/sla and /.well-known/sla.json publish objectives + free routes", async () => {
  const { manifests } = await import("../src/manifests.js");
  const env = { X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7" };
  for (const p of ["/sla", "/.well-known/sla.json"]) {
    const j = JSON.parse(manifests[p](env, "https://x").body);
    assert.equal(j.price_usd_per_call, 0.02); assert.equal(j.free_routes.length, 2); assert.equal(j.top_paid_routes.length, 10); assert.equal(j.payTo, env.X402_PAY_TO);
  }
});
