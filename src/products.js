// Seller health + delivery attestation. $0 outbound: plain HTTPS fetches to the target seller and the existing free public RPC only.
import { safeUrl, checkX402, isAddr, isTx, toUnits, matchTransfers, canon, b64u, sha256hex } from "./lib.js";

const MAX_BODY = 64 * 1024;
async function readJson(r) {
  const t = await r.text(); if (t.length > MAX_BODY) return { tooBig: true };
  try { return { json: JSON.parse(t) }; } catch { return { json: null }; }
}
async function timed(u, signal) {
  const t0 = Date.now();
  const r = await fetch(u, { signal, redirect: "manual", headers: { "user-agent": "BeggarBot-SellerHealth/1.0", accept: "application/json" } });
  return { r, ms: Date.now() - t0 };
}
const decodeHdr = (h) => { try { return JSON.parse(decodeURIComponent(escape(atob(h)))); } catch { return null; } };
const acceptsOf = (doc) => doc && (doc.accepts || doc.paymentRequirements || (Array.isArray(doc.resources) && doc.resources.flatMap((r) => r.accepts || []))) || [];

// Pure summary of one accepts[] entry (exported for tests)
export function summarizeAccept(a) {
  const amt = a.maxAmountRequired ?? a.amount;
  let price_usdc = null; try { if (amt !== undefined) price_usdc = Number(BigInt(amt)) / 1e6; } catch {}
  return { scheme: a.scheme || null, network: a.network || null, asset: a.asset || null, payTo: isAddr(a.payTo) ? a.payTo : null, amount_atomic: amt ?? null, price_usdc, token_name: a.extra?.name || null };
}

export async function sellerHealth(q) {
  const endpoint = q.get("endpoint");
  const url = endpoint && safeUrl(endpoint);
  if (!url) return { status: 400, body: { error: "endpoint must be public https (no private/loopback IPs, no IPv6 literals)", ssrf_safe: false } };
  const signal = AbortSignal.timeout(6000), checks = {}, issues = [];
  let discovery = null;
  for (const p of ["/.well-known/x402", "/.well-known/x402.json"]) {
    try {
      const { r, ms } = await timed(new URL(p, url), signal);
      checks[p] = { status: r.status, latency_ms: ms };
      if (r.ok) { const { json, tooBig } = await readJson(r); if (tooBig) issues.push("discovery_too_large"); else if (json) { discovery = { path: p, doc: json }; break; } else issues.push("discovery_not_json"); }
    } catch (e) { checks[p] = { error: String(e.name || "fetch_error") }; }
  }
  let challenge = null, reachable = false, tls_ok = false, latency_ms = null;
  try {
    const { r, ms } = await timed(url, signal); reachable = true; tls_ok = true; latency_ms = ms;
    const v2 = r.headers.get("payment-required");
    const { json } = r.status === 402 ? await readJson(r) : { json: null };
    challenge = { status: r.status, x402_v1_body: !!(json && acceptsOf(json).length), x402_v2_header: !!(v2 && decodeHdr(v2)) };
    if (r.status >= 300 && r.status < 400) issues.push("redirect_not_followed");
    if (r.status !== 402) issues.push("unpaid_request_not_402");
    challenge.doc = json && acceptsOf(json).length ? json : (v2 ? decodeHdr(v2) : null);
  } catch (e) { issues.push(e.name === "TimeoutError" ? "timeout" : "unreachable_or_tls_error"); }
  if (!reachable && Object.values(checks).some((c) => c.status)) reachable = true, tls_ok = true;
  const src = challenge?.doc || discovery?.doc;
  const accepts = acceptsOf(src).map(summarizeAccept);
  const schema = src ? checkX402(src) : { score: 0, reasons: ["no_x402_manifest_or_402"] };
  const schema_ok = accepts.length > 0 && accepts.every((a) => a.network && a.payTo && a.amount_atomic !== null);
  const healthy = reachable && tls_ok && schema_ok && challenge?.status === 402;
  return { status: 200, body: { endpoint: url.href, healthy, reachable, tls_ok, ssrf_safe: true, latency_ms, schema_ok, score: schema.score, reasons: [...schema.reasons, ...issues],
    discovery: discovery ? { path: discovery.path } : null, discovery_checks: checks, challenge: challenge && { status: challenge.status, x402_v1_body: challenge.x402_v1_body, x402_v2_header: challenge.x402_v2_header },
    accepts, checked_at: new Date().toISOString(), note: "HTTP-only probe; no on-chain reads. TLS validity inferred from successful https fetch." } };
}

// Delivery attestation: settlement proven via tx receipt (same path as /v1/receipt), bound to seller URL + optional response hash.
export async function deliveryAttest(env, b, { rpc, signingKey, pubKey }) {
  const { seller_url, tx_hash, payer, payee, amount, response_sha256 = null, request_ref = "" } = b || {};
  const seller = seller_url && safeUrl(seller_url);
  if (!seller || !isTx(tx_hash) || !isAddr(payer) || !isAddr(payee) || !amount) return { status: 400, body: { error: "need seller_url (public https), tx_hash, payer, payee, amount; optional response_sha256, request_ref" } };
  if (response_sha256 !== null && !/^[0-9a-f]{64}$/i.test(String(response_sha256))) return { status: 400, body: { error: "response_sha256 must be 64 hex chars" } };
  let units; try { units = toUnits(amount); } catch { return { status: 400, body: { error: "bad amount" } }; }
  const rc = await rpc(env, "eth_getTransactionReceipt", [tx_hash]);
  if (!rc || rc.status !== "0x1") return { status: 404, body: { error: "tx not found or failed" } };
  const m = matchTransfers(rc.logs, { payer, payTo: payee, units, usdc: env.USDC_ADDRESS }).find((x) => x.exact);
  if (!m) return { status: 422, body: { error: "no matching USDC transfer in tx" } };
  const attestation = { v: 1, type: "x402-delivery-attestation", issuer: env.OPERATOR_NAME, network: env.NETWORK, chain_id: Number(env.CHAIN_ID), seller_url: seller.href, tx_hash: tx_hash.toLowerCase(), block: m.block, payer: payer.toLowerCase(), payee: payee.toLowerCase(), amount, token: env.USDC_ADDRESS, settlement: "verified_onchain_receipt", response_sha256: response_sha256 ? String(response_sha256).toLowerCase() : null, delivery_claim: response_sha256 ? "buyer_supplied_response_hash" : "none", request_ref: String(request_ref).slice(0, 128), issued_at: new Date().toISOString() };
  const c = canon(attestation);
  const signature = b64u(await crypto.subtle.sign("Ed25519", await signingKey(env), new TextEncoder().encode(c)));
  return { status: 200, body: { attestation, canonical: "sorted-key JSON", alg: "Ed25519", kid: (await pubKey(env)).kid, signature, attestation_hash: await sha256hex(c), token: b64u(new TextEncoder().encode(c)), verify: "GET /v1/delivery-attest/verify?token=<token>&signature=<signature> (free)" } };
}

export async function verifyAttestation(env, q, pubKey) {
  const token = q.get("token") || "", sigS = q.get("signature") || "";
  if (!token || !sigS) return { status: 400, body: { error: "need token and signature (base64url)" } };
  const unb = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (ch) => ch.charCodeAt(0));
  let bytes, sig, att; try { bytes = unb(token); sig = unb(sigS); att = JSON.parse(new TextDecoder().decode(bytes)); } catch { return { status: 400, body: { error: "token/signature must be base64url (token = canonical JSON)" } }; }
  if (sig.length !== 64) return { status: 400, body: { error: "signature must be 64 bytes" } };
  const k = await crypto.subtle.importKey("jwk", await pubKey(env), { name: "Ed25519" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("Ed25519", k, sig, new TextEncoder().encode(canon(att)));
  return { status: 200, body: { valid, attestation: valid ? att : undefined } };
}
