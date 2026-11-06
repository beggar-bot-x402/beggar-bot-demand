import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js"; import { pad32, TRANSFER_TOPIC } from "../src/lib.js";
const P = "0x" + "a".repeat(40), Q = "0x" + "b".repeat(40), U = "0x036CbD53842c5426634e7929541eC2318f3dCF7e", TX = "0x" + "2".repeat(64);
// ephemeral in-memory key: never written anywhere
const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", kp.privateKey)), kid: "test" };
class DB { constructor() { this.calls = []; this.receipts = []; }
  prepare(sql) { const db = this; let args = []; return { bind(...a) { args = a; return this; },
    async run() { if (sql.includes("INTO calls")) db.calls.push(args); else db.receipts.push(args); },
    async first() { const r = db.receipts.at(-1); return r ? { receipt_hash: r[0] } : null; } }; } }
const tlog = { address: U, topics: [TRANSFER_TOPIC, pad32(P), pad32(Q)], data: "0x186a0", transactionHash: TX, blockNumber: "0x64" };
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://rpc.test")) { const { method } = JSON.parse(init.body);
    const result = { eth_blockNumber: "0x6e", eth_getLogs: [tlog], eth_getCode: "0x", eth_getTransactionCount: "0x0", eth_getTransactionReceipt: { status: "0x1", logs: [tlog] } }[method];
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result })); }
  if (String(url) === "https://ext.test/.well-known/x402") return new Response(JSON.stringify({ accepts: [{ network: "base-sepolia", payTo: P, maxAmountRequired: "1000" }] }));
  throw new Error("unexpected fetch " + url);
};
const mkEnv = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", DEFAULT_NETWORK: "base-sepolia", RPC_URL_SEPOLIA: "https://rpc.test", RPC_URL_MAINNET: "https://rpc.test", USDC_ADDRESS: U, OPERATOR_NAME: "Beggar Bot", RECEIPT_SIGNING_KEY_JWK: JSON.stringify(jwk), SELFTEST_TOKEN: "s3", IP_HASH_SALT: "salt", DB: new DB(), ...o });
const req = (p, init = {}) => new Request("https://w.test" + p, { headers: { "user-agent": "agent-sdk/1.0", "cf-connecting-ip": "1.2.3.4", ...(init.headers || {}) }, ...init });

test("kill switch returns 503 everywhere", async () => { const env = mkEnv({ BEGGAR_DEMAND_TESTS_ENABLED: "false" }); for (const p of ["/v1/verify", "/llms.txt", "/.well-known/x402"]) assert.equal((await handle(req(p), env)).status, 503); });
test("verify confirmed + logged as candidate_agent", async () => {
  const env = mkEnv(); const r = await handle(req(`/v1/verify?payer=${P}&payee=${Q}&amount=0.10&invoice=inv-1`), env); const j = await r.json();
  assert.equal(j.status, "confirmed"); assert.equal(j.confirmations, 11); assert.equal(env.DB.calls[0].at(-1), "candidate_agent");
  assert.ok(!JSON.stringify(env.DB.calls).includes("1.2.3.4"), "raw IP never logged");
});
test("verify bad params 400 -> invalid", async () => { const env = mkEnv(); assert.equal((await handle(req("/v1/verify?payer=x"), env)).status, 400); assert.equal(env.DB.calls[0].at(-1), "invalid"); });
test("selftest header tagged self", async () => { const env = mkEnv(); await handle(req("/llms.txt", { headers: { "x-beggar-selftest": "s3" } }), env); assert.equal(env.DB.calls[0].at(-1), "self"); });
test("risk address + endpoint", async () => {
  const env = mkEnv(); assert.ok((await (await handle(req(`/v1/risk?address=${P}`), env)).json()).reasons.includes("no_outgoing_txs"));
  const e = await (await handle(req(`/v1/risk?endpoint=https://ext.test/api`), env)).json(); assert.equal(e.score, 100); assert.equal(e.source, "well-known");
  assert.equal((await handle(req(`/v1/risk?endpoint=https://127.0.0.1/`), env)).status, 400);
});
test("receipt sign, chain, verify, tamper detect; private key not exposed", async () => {
  const env = mkEnv(); const body = JSON.stringify({ tx_hash: TX, payer: P, payee: Q, amount: "0.1", invoice: "inv-1" });
  const r1 = await (await handle(req("/v1/receipt", { method: "POST", body }), env)).json();
  const r2 = await (await handle(req("/v1/receipt", { method: "POST", body }), env)).json();
  assert.equal(r2.receipt.prev_hash, r1.receipt_hash);
  const v = async (rc) => (await (await handle(req("/v1/receipt/verify", { method: "POST", body: JSON.stringify(rc) }), env)).json()).valid;
  assert.equal(await v({ receipt: r1.receipt, signature: r1.signature }), true);
  assert.equal(await v({ receipt: { ...r1.receipt, amount: "100" }, signature: r1.signature }), false);
  const keys = await (await handle(req("/.well-known/beggar-bot-keys.json"), env)).json();
  assert.equal(keys.keys[0].d, undefined); assert.ok(!JSON.stringify(r1).includes(jwk.d));
  assert.equal((await handle(req("/v1/receipt", { method: "POST", body: JSON.stringify({ tx_hash: TX, payer: P, payee: Q, amount: "5" }) }), env)).status, 422);
});
test("discovery files", async () => { const env = mkEnv(); for (const p of ["/.well-known/x402", "/openapi.json", "/.well-known/agent.json", "/.well-known/agent-card.json", "/llms.txt", "/robots.txt", "/sitemap.xml"]) assert.equal((await handle(req(p), env)).status, 200, p);
  const x = await (await handle(req("/.well-known/x402"), env)).json(); assert.ok(x.resources.every((r) => r.price === "0" && r.accepts.length === 0)); });
test("paid mode testnet returns 402 challenge without X-PAYMENT", async () => {
  const env = mkEnv({ X402_MODE: "testnet", X402_PAY_TO: Q, X402_PRICE_USD: "0.001" });
  const r = await handle(req(`/v1/risk?address=${P}`), env); assert.equal(r.status, 402);
  const j = await r.json(); assert.equal(j.accepts[0].network, "base-sepolia"); assert.equal(j.accepts[0].maxAmountRequired, "1000");
  assert.equal((await handle(req("/llms.txt"), env)).status, 200);
});
test("retention cron deletes", async () => { const { scheduled } = await import("../src/index.js"); let sql = ""; await scheduled({}, { DB: { prepare: (s) => { sql = s; return { bind: () => ({ run: async () => {} }) }; } } }); assert.match(sql, /DELETE FROM calls/); });

test("receipt/verify empty -> 200 usage; bad body -> 400", async () => {
  for (const body of ["", "{}"]) { const r = await handle(new Request("https://x.dev/v1/receipt/verify", { method: "POST", body }), mkEnv()); assert.equal(r.status, 200, body); assert.match((await r.json()).usage, /POST JSON/); }
  for (const body of ["{bad", '{"receipt":{},"signature":"!!"}', '{"receipt":{},"signature":"abc"}']) {
    const r = await handle(new Request("https://x.dev/v1/receipt/verify", { method: "POST", body }), mkEnv());
    assert.equal(r.status, 400, body);
  }
});
test("default network is Base mainnet; unknown network 400", async () => {
  const { chainEnv } = await import("../src/index.js");
  const e = chainEnv({}, undefined); assert.equal(e.CHAIN_ID, "8453"); assert.equal(e.USDC_ADDRESS, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.equal(chainEnv({}, "base-sepolia").CHAIN_ID, "84532");
  const r = await handle(new Request("https://x.dev/v1/risk?network=eth&address=0x" + "1".repeat(40)), mkEnv());
  assert.equal(r.status, 400);
});
test("selftest header bypasses paywall; others get 402", async () => {
  const pe = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.001", X402_FACILITATOR_URL: "https://f.test" };
  const u = "https://x.dev/v1/risk?network=eth";
  assert.equal((await handle(new Request(u), mkEnv(pe))).status, 402);
  assert.equal((await handle(new Request(u, { headers: { "x-beggar-selftest": "wrong" } }), mkEnv(pe))).status, 402);
  assert.equal((await handle(new Request(u, { headers: { "x-beggar-selftest": "s3" } }), mkEnv(pe))).status, 400);
});

test("a2a jsonrpc", async () => { const env = mkEnv();
  const r = await handle(new Request("https://x.test/a2a", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { role: "user", messageId: "m1", parts: [{ kind: "text", text: "wallet portfolio balances" }] } } }) }), env);
  const b = await r.json(); assert.equal(b.result.kind, "message"); assert.ok(b.result.parts[0].text.includes("/v1/"));
  const t = await (await handle(new Request("https://x.test/a2a", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tasks/get", params: { id: "z" } }) }), env)).json(); assert.equal(t.error.code, -32001); });
