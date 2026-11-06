// Pure helpers (testable in Node without Workers runtime).
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const isAddr = (a) => typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
export const isTx = (h) => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
export const pad32 = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");
export const topicToAddr = (t) => "0x" + t.slice(-40).toLowerCase();

// USDC 6 decimals; amount string like "0.10" -> bigint micro-units
export function toUnits(amount) {
  if (!/^\d+(\.\d{1,6})?$/.test(String(amount))) throw new Error("bad amount");
  const [i, f = ""] = String(amount).split(".");
  return BigInt(i) * 1000000n + BigInt((f + "000000").slice(0, 6));
}

// invoice binding: invoice id must be keccak-free simple token; we bind via tx input memo OR exact amount+payer
export function matchTransfers(logs, { payer, payTo, units, usdc }) {
  const out = [];
  for (const l of logs) {
    if (l.address.toLowerCase() !== usdc.toLowerCase()) continue;
    if (l.topics[0] !== TRANSFER_TOPIC) continue;
    const from = topicToAddr(l.topics[1]), to = topicToAddr(l.topics[2]);
    if (from !== payer.toLowerCase() || to !== payTo.toLowerCase()) continue;
    const v = BigInt(l.data);
    out.push({ tx_hash: l.transactionHash, block: parseInt(l.blockNumber, 16), value: v, exact: v === units });
  }
  return out;
}

export function verdict(matches, head, minConf = 2) {
  const exact = matches.find((m) => m.exact);
  if (!exact) return matches.length ? { status: "mismatch", candidates: matches.length } : { status: "not_found" };
  const conf = head - exact.block + 1;
  return { status: conf >= minConf ? "confirmed" : "pending", tx_hash: exact.tx_hash, block: exact.block, confirmations: conf };
}

// x402 manifest/challenge checks
export function checkX402(doc) {
  const reasons = []; let score = 100;
  const accepts = doc && (doc.accepts || doc.paymentRequirements || (doc.resources && doc.resources.flatMap((r) => r.accepts || [])));
  if (!Array.isArray(accepts) || !accepts.length) return { score: 10, reasons: ["no_accepts_array"] };
  const payTos = new Set();
  for (const a of accepts) {
    if (!a.network) { score -= 20; reasons.push("missing_network"); }
    else if (/mainnet|^base$|eip155:8453$/.test(a.network)) reasons.push("mainnet_endpoint");
    if (!isAddr(a.payTo)) { score -= 30; reasons.push("invalid_payTo"); } else payTos.add(a.payTo.toLowerCase());
    const amt = a.maxAmountRequired ?? a.amount;
    if (amt === undefined) { score -= 15; reasons.push("missing_amount"); }
    else if (BigInt(amt) > 100000000n) { score -= 25; reasons.push("price_over_100_usdc"); }
  }
  if (payTos.size > 1) { score -= 15; reasons.push("multiple_payTo_addresses"); }
  return { score: Math.max(0, score), reasons };
}

export function scoreAddress({ code, nonce, firstSeenBlocksAgo }) {
  const reasons = []; let score = 70;
  const isContract = code && code !== "0x";
  if (isContract) reasons.push("contract");
  if (!isContract && nonce === 0) { score -= 30; reasons.push("no_outgoing_txs"); }
  if (nonce > 10) score += 15;
  if (firstSeenBlocksAgo !== undefined && firstSeenBlocksAgo < 43200) { score -= 20; reasons.push("younger_than_1_day"); }
  return { score: Math.max(0, Math.min(100, score)), reasons, is_contract: !!isContract, nonce };
}

// SSRF guard
export function safeUrl(u) {
  let url; try { url = new URL(u); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const h = url.hostname;
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(h)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null;
  }
  if (h.includes(":") || h.startsWith("[")) return null;
  return url;
}

// RFC 8785-ish canonical JSON (sufficient for string/number/bool/object/array)
export function canon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
}

export const KNOWN_CRAWLERS = /(googlebot|bingbot|censys|shodan|zgrab|masscan|ahrefs|semrush|yandex|baiduspider|duckduckbot|petalbot|expanse|nmap|curl\/7\.\d+ .*scan)/i;
export const SCAN_PATHS = /(wp-admin|wp-login|\.env|\.git|phpmyadmin|xmlrpc)/i;
export const BROWSER_UA = /mozilla\/5\.0.*(chrome|safari|firefox|edg)\//i;

export function classifyTraffic({ selftestOk, ua = "", path = "", ipHash, operatorHashes = [], status }) {
  if (selftestOk || operatorHashes.includes(ipHash)) return "self";
  if (KNOWN_CRAWLERS.test(ua) || SCAN_PATHS.test(path)) return "crawler";
  if (status >= 400) return "invalid";
  if (BROWSER_UA.test(ua)) return "human_browser";
  return "candidate_agent";
}

export const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
