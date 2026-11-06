import test from "node:test"; import assert from "node:assert";
import { paidConfig, cdpJwt } from "../src/x402.js";
const base = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://facilitator.payai.network" };
test("routes stay PayAI unless listed and keys present", () => {
  assert.equal(paidConfig({ ...base, X402_CDP_ROUTES: "/v1/ens" }, "/v1/ens").facilitator, base.X402_FACILITATOR_URL);
  const e = { ...base, X402_CDP_ROUTES: "/v1/ens", CDP_API_KEY_ID: "id", CDP_API_KEY_SECRET: "x" };
  assert.match(paidConfig(e, "/v1/ens").facilitator, /api\.cdp\.coinbase\.com/);
  assert.equal(paidConfig(e, "/v1/gasfee").facilitator, base.X402_FACILITATOR_URL);
});
test("cdp jwt signs with Ed25519", async () => {
  const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pk = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey)).slice(16);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const secret = btoa(String.fromCharCode(...pk, ...pub));
  const j = await cdpJwt({ id: "kid1", secret }, "POST", "https://api.cdp.coinbase.com/platform/v2/x402/settle");
  const [h, p, s] = j.split("."); const d = (x) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  assert.ok(await crypto.subtle.verify({ name: "Ed25519" }, kp.publicKey, d(s), new TextEncoder().encode(h + "." + p)));
  assert.deepEqual(JSON.parse(new TextDecoder().decode(d(p))).uris, ["POST api.cdp.coinbase.com/platform/v2/x402/settle"]);
});
