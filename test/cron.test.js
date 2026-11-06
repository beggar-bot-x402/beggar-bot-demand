import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { parseCron, cronparse, explain } from "../src/cron.js";
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
globalThis.fetch = async (u) => { throw new Error("no outbound allowed: " + u); };

test("parse fields: ranges, steps, lists, names, dow 7", () => {
  const c = parseCron("*/15 9-17 * jan,jul mon-fri");
  assert.deepEqual([...c.minute], [0, 15, 30, 45]); assert.equal(c.hour.size, 9); assert.deepEqual([...c.month], [1, 7]); assert.deepEqual([...c.dow], [1, 2, 3, 4, 5]);
  assert.deepEqual([...parseCron("0 0 * * 7").dow], [0]);
  assert.equal(parseCron("@daily").expr, "0 0 * * *");
});
test("invalid expressions return valid:false", async () => {
  for (const e of ["60 * * * *", "* * *", "5-1 * * * *", "*/0 * * * *", "* * * foo *"]) { const o = await cronparse({ expr: e }); assert.equal(o.status, 200); assert.equal(o.body.valid, false, e); }
  assert.equal((await cronparse({})).status, 400);
  assert.equal((await cronparse({ expr: "* * * * *", tz: "Mars/Base" })).status, 400);
});
test("next times UTC weekdays 09:30", async () => {
  const o = await cronparse({ expr: "30 9 * * 1-5", from: "2026-10-30T10:00:00Z", count: 3 });
  assert.deepEqual(o.body.next.map((x) => x.utc), ["2026-11-02T09:30:00.000Z", "2026-11-03T09:30:00.000Z", "2026-11-04T09:30:00.000Z"]);
  assert.equal(o.body.description, "at 09:30 on Monday, Tuesday, Wednesday, Thursday, Friday");
});
test("timezone + DST aware (Europe/London, America/New_York)", async () => {
  const l = await cronparse({ expr: "0 9 * * *", tz: "Europe/London", from: "2026-10-24T12:00:00Z", count: 2 });
  assert.deepEqual(l.body.next.map((x) => x.utc), ["2026-10-25T09:00:00.000Z", "2026-10-26T09:00:00.000Z"]); // BST ends 25 Oct
  const n = await cronparse({ expr: "0 9 * * *", tz: "America/New_York", from: "2026-07-01T00:00:00Z", count: 1 });
  assert.equal(n.body.next[0].utc, "2026-07-01T13:00:00.000Z"); assert.equal(n.body.next[0].local, "2026-07-01T09:00");
});
test("dom+dow OR semantics, leap day, count cap", async () => {
  const o = await cronparse({ expr: "0 0 13 * fri", from: "2026-11-01T00:00:00Z", count: 3 });
  assert.match(o.body.day_match, /OR/); assert.deepEqual(o.body.next.map((x) => x.utc.slice(0, 10)), ["2026-11-06", "2026-11-13", "2026-11-20"]);
  const lp = await cronparse({ expr: "0 0 29 2 *", from: "2026-01-01T00:00:00Z", count: 1 }); assert.equal(lp.body.next[0].utc, "2028-02-29T00:00:00.000Z");
  assert.equal((await cronparse({ expr: "* * * * *", from: 0, count: 999 })).body.next.length, 50);
  assert.equal(explain(parseCron("@hourly")), "at minute 0 of every hour");
});
test("/v1/cronparse route: free mode 200, paid mode 402, discovery + MCP", async () => {
  const [s, b] = await call("/v1/cronparse?expr=" + encodeURIComponent("0 12 * * *") + "&count=2&from=2026-01-01T00:00:00Z"); assert.equal(s, 200); assert.equal(b.next.length, 2);
  const [s2, b2] = await call("/v1/cronparse", { method: "POST", body: JSON.stringify({ expr: "@weekly", count: 1, from: "2026-10-30T00:00:00Z" }) }); assert.equal(s2, 200); assert.equal(b2.next[0].utc, "2026-11-01T00:00:00.000Z");
  assert.equal((await call("/v1/cronparse?expr=*+*+*+*+*", undefined, env(PAID)))[0], 402);
  const [, oa] = await call("/openapi.json", undefined, env(PAID)); assert.ok(oa.paths["/v1/cronparse"].get["x-payment-info"]); assert.ok(oa.paths["/v1/cronparse"].post);
  const [, wk] = await call("/.well-known/x402", undefined, env(PAID)); assert.ok(JSON.stringify(wk).includes("/v1/cronparse"));
  const r = await handle(new Request("https://w.test/llms.txt"), env(PAID)); assert.ok((await r.text()).includes("/v1/cronparse"));
  const [, aj] = await call("/.well-known/agent.json", undefined, env(PAID)); assert.ok(JSON.stringify(aj).includes("/v1/cronparse"));
});
