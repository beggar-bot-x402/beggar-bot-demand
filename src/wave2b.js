// Wave 2B pack (2026-11-02): /v1/simcall, /v1/nonce, /v1/tokenholders, /v1/solbalance, /v1/whois, /v1/feedparse.
// All $0 upstream: keyless public RPC (publicnode/solana mainnet-beta), rdap.org, user-supplied feed URL (SSRF-safe). No CF AI.
import { rpcBatch } from "./walletintel.js";
import { fetchSafeUrl } from "./fetchpage.js";
import { keccakHex } from "./evm.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const ok = (b) => ({ status: 200, body: b });
const up = (w, e) => ({ status: 502, body: { error: w + " upstream failed", detail: String(e?.message || e).slice(0, 160) } });
const UA = { "user-agent": "BeggarBot/1.0 (+https://beggar-bot-demand.beggarbot.workers.dev/llms.txt)" };
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Math.floor(num(v, d))));
const CH = { base: "base", "8453": "base", ethereum: "ethereum", eth: "ethereum", mainnet: "ethereum", "1": "ethereum", optimism: "optimism", op: "optimism", "10": "optimism", arbitrum: "arbitrum", arb: "arbitrum", "42161": "arbitrum", polygon: "polygon", "137": "polygon" };
const chainOf = (c) => CH[String(c ?? "base").trim().toLowerCase()] || null;
const isAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const hexN = (h) => (h ? Number(BigInt(h)) : null);
const w32 = (v) => BigInt(v).toString(16).padStart(64, "0");

// ---- ABI mini encode/decode (static types + string/bytes return) ----
export function encodeCall(sig, args) {
  const m = String(sig).replace(/\s+/g, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\(([^()]*)\)$/); if (!m) throw new Error("sig must look like balanceOf(address)");
  const types = m[2] ? m[2].split(",") : []; if (types.length !== args.length) throw new Error(`sig expects ${types.length} args, got ${args.length}`);
  const enc = types.map((t, i) => { const v = args[i];
    if (t === "address") { if (!isAddr(v)) throw new Error(`arg ${i} not address`); return v.toLowerCase().slice(2).padStart(64, "0"); }
    if (/^u?int\d*$/.test(t)) { let b = BigInt(v); if (b < 0n) b = (1n << 256n) + b; return w32(b); }
    if (t === "bool") return w32(v === true || v === "true" || v === 1 || v === "1" ? 1 : 0);
    if (/^bytes32$/.test(t)) { const h = String(v).replace(/^0x/, ""); if (!/^[0-9a-fA-F]{0,64}$/.test(h)) throw new Error(`arg ${i} not bytes32`); return h.padEnd(64, "0"); }
    throw new Error("unsupported arg type " + t + " (use data= for complex calls)"); });
  return keccakHex(`${m[1]}(${types.join(",")})`).slice(0, 10) + enc.join("");
}
export function decodeReturn(hex, types) {
  const d = String(hex || "0x").replace(/^0x/, ""); const word = (i) => d.slice(i * 64, i * 64 + 64);
  return types.map((t, i) => { const w = word(i); if (w.length < 64) return null;
    if (t === "address") return "0x" + w.slice(24);
    if (/^uint\d*$/.test(t)) return BigInt("0x" + w).toString();
    if (/^int\d*$/.test(t)) { let b = BigInt("0x" + w); if (b >> 255n) b -= 1n << 256n; return b.toString(); }
    if (t === "bool") return BigInt("0x" + w) !== 0n;
    if (/^bytes\d+$/.test(t)) return "0x" + w.slice(0, 2 * Number(t.slice(5)));
    if (t === "string" || t === "bytes") { const off = Number(BigInt("0x" + w)) * 2, len = Number(BigInt("0x" + d.slice(off, off + 64))); const raw = d.slice(off + 64, off + 64 + len * 2);
      return t === "bytes" ? "0x" + raw : new TextDecoder().decode(new Uint8Array(raw.match(/../g)?.map((x) => parseInt(x, 16)) || [])); }
    return "0x" + w; });
}
export function decodeRevert(data) {
  const d = String(data || ""); if (d.startsWith("0x08c379a0")) { try { return { kind: "Error", reason: decodeReturn("0x" + d.slice(10), ["string"])[0] }; } catch {} }
  if (d.startsWith("0x4e487b71")) { const c = Number(BigInt("0x" + d.slice(10, 74))); const P = { 1: "assert", 17: "overflow", 18: "div by zero", 33: "enum", 34: "storage", 49: "pop empty", 50: "out of bounds", 65: "alloc", 81: "zero fn" }; return { kind: "Panic", code: c, reason: P[c] || "panic" }; }
  return d && d !== "0x" ? { kind: "custom", selector: d.slice(0, 10), data: d.slice(0, 522) } : null;
}
async function rpcRaw(chain, method, params) {
  const { RPCS } = await import("./walletintel.js"); let last;
  for (const url of RPCS[chain]) { try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error("http " + r.status); const j = await r.json(); return { ...j, rpc: new URL(url).host }; } catch (e) { last = e; } }
  throw new Error("public rpc unavailable: " + (last && last.message));
}

// ---- /v1/simcall ----
export async function simcall(a) {
  const chain = chainOf(a.chain); if (!chain) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  if (!isAddr(a.to)) return bad("to (0x contract address) required");
  let data = a.data; let args = a.args ?? [];
  if (typeof args === "string") args = args ? args.split(",").map((s) => s.trim()) : [];
  try { if (!data && a.sig) data = encodeCall(a.sig, args); } catch (e) { return bad(e.message); }
  if (!/^0x([0-9a-fA-F]{2}){4,}$/.test(String(data || ""))) return bad("data (0x calldata) or sig+args required");
  if (String(data).length > 20002) return bad("data too long (10KB max)");
  if (a.from != null && a.from !== "" && !isAddr(a.from)) return bad("from invalid");
  let value; try { value = a.value ? "0x" + BigInt(a.value).toString(16) : undefined; } catch { return bad("value must be integer wei"); }
  const block = a.block == null || a.block === "" || a.block === "latest" ? "latest" : /^\d+$/.test(String(a.block)) ? "0x" + Number(a.block).toString(16) : null; if (!block) return bad("block must be integer or latest");
  const tx = { to: a.to, data, ...(a.from ? { from: a.from } : {}), ...(value ? { value } : {}) };
  const types = String(a.returns || "").replace(/\s+/g, "").split(",").filter(Boolean).slice(0, 16);
  try {
    const [c, g] = await Promise.all([rpcRaw(chain, "eth_call", [tx, block]), a.estimate === "false" ? null : rpcRaw(chain, "eth_estimateGas", [tx]).catch(() => null)]);
    if (c.error) return ok({ chain, success: false, reverted: true, error: c.error.message, revert: decodeRevert(c.error.data), selector: data.slice(0, 10), block, rpc: c.rpc });
    let decoded = null; try { decoded = types.length ? decodeReturn(c.result, types) : null; } catch (e) { decoded = { error: "decode failed: " + e.message }; }
    return ok({ chain, success: true, selector: data.slice(0, 10), block, return_data: c.result, return_bytes: (c.result.length - 2) / 2, decoded, decoded_types: types.length ? types : null, gas_estimate: g && g.result ? hexN(g.result) : null, gas_error: g && g.error ? g.error.message : null, rpc: c.rpc, note: "read-only eth_call simulation; nothing is broadcast" });
  } catch (e) { return up("rpc", e); }
}

// ---- /v1/nonce ----
export async function nonce(a) {
  const chain = chainOf(a.chain); if (!chain) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  if (!isAddr(a.address)) return bad("address (0x) required");
  try {
    const { results: [nl, np, code, bal, bn], rpc } = await rpcBatch(chain, [["eth_getTransactionCount", [a.address, "latest"]], ["eth_getTransactionCount", [a.address, "pending"]], ["eth_getCode", [a.address, "latest"]], ["eth_getBalance", [a.address, "latest"]], ["eth_blockNumber", []]]);
    const latest = hexN(nl), pending = hexN(np), c = code || "0x";
    const delegated = /^0xef0100[0-9a-fA-F]{40}$/.test(c);
    const kind = delegated ? "eoa_7702_delegated" : c === "0x" ? "eoa" : "contract";
    return ok({ chain, address: a.address, nonce_latest: latest, nonce_pending: pending, pending_count: pending != null && latest != null ? pending - latest : null, next_nonce: pending ?? latest, account_type: kind,
      eip7702: { delegated, delegate: delegated ? "0x" + c.slice(8) : null }, code_bytes: (c.length - 2) / 2, balance_wei: bal ? BigInt(bal).toString() : null, block: hexN(bn), rpc,
      hints: [...(pending > latest ? [`${pending - latest} tx pending in node mempool; use next_nonce=${pending} or replace nonce ${latest} with higher fee`] : []), ...(delegated ? ["EOA delegates code via EIP-7702; batch/sponsored calls possible, nonce still increments per tx"] : []), ...(kind === "contract" ? ["contract account: nonce counts CREATEs; use the entrypoint nonce for ERC-4337 userops"] : [])] });
  } catch (e) { return up("rpc", e); }
}

// ---- /v1/tokenholders (Transfer log window stats) ----
const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export async function tokenholders(a) {
  const chain = chainOf(a.chain); if (!chain) return bad("chain must be base, ethereum, optimism, arbitrum, polygon");
  if (!isAddr(a.token)) return bad("token (ERC-20 0x address) required");
  const blocks = clamp(a.blocks, 10, 2000, 500), top = clamp(a.top, 1, 25, 10);
  try {
    const { results: [bn, dec, sym] } = await rpcBatch(chain, [["eth_blockNumber", []], ["eth_call", [{ to: a.token, data: "0x313ce567" }, "latest"]], ["eth_call", [{ to: a.token, data: "0x95d89b41" }, "latest"]]]);
    const head = hexN(bn), from = head - blocks + 1;
    const r = await rpcRaw(chain, "eth_getLogs", [{ address: a.token, topics: [TRANSFER], fromBlock: "0x" + from.toString(16), toBlock: "0x" + head.toString(16) }]);
    if (r.error) return ok({ chain, token: a.token, error: r.error.message, hint: "reduce blocks", from_block: from, to_block: head });
    const logs = (r.result || []).filter((l) => l.topics.length === 3);
    const ZERO = "0x" + "0".repeat(40), snd = new Map(), rcv = new Map(), txs = new Set(); let vol = 0n, mints = 0, burns = 0;
    for (const l of logs) { const f = "0x" + l.topics[1].slice(26), t = "0x" + l.topics[2].slice(26), v = l.data && l.data !== "0x" ? BigInt(l.data.slice(0, 66)) : 0n; vol += v; txs.add(l.transactionHash);
      if (f === ZERO) mints++; else snd.set(f, (snd.get(f) || 0) + 1); if (t === ZERO) burns++; else rcv.set(t, (rcv.get(t) || 0) + 1); }
    const decimals = dec && dec !== "0x" ? Number(BigInt(dec)) : null; let symbol = null; try { symbol = sym && sym.length > 2 ? decodeReturn(sym, ["string"])[0] : null; } catch {}
    const fmt = (v) => { if (decimals == null) return v.toString(); const s = v.toString().padStart(decimals + 1, "0"); const i = s.slice(0, s.length - decimals), f = s.slice(s.length - decimals).replace(/0+$/, ""); return f ? `${i}.${f.slice(0, 6)}` : i; };
    const topOf = (m) => [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, top).map(([address, transfers]) => ({ address, transfers }));
    const uniq = new Set([...snd.keys(), ...rcv.keys()]);
    return ok({ chain, token: a.token, symbol, decimals, window: { from_block: from, to_block: head, blocks }, transfers: logs.length, transactions: txs.size, unique_senders: snd.size, unique_receivers: rcv.size, unique_addresses: uniq.size, mints, burns, volume_raw: vol.toString(), volume: fmt(vol), top_senders: topOf(snd), top_receivers: topOf(rcv), rpc: r.rpc, note: "activity stats over a recent block window, not a full holder list" });
  } catch (e) { return up("rpc", e); }
}

// ---- /v1/solbalance ----
const SOL_RPCS = ["https://api.mainnet-beta.solana.com", "https://solana-rpc.publicnode.com"];
const TOKEN_PROGRAMS = ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"];
const SOL_MINTS = { EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC", Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT", So11111111111111111111111111111111111111112: "wSOL", DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK", JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP", "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo": "PYUSD" };
async function sol1(m, p) { let last;
  for (const u of SOL_RPCS) { try { const r = await fetch(u, { method: "POST", headers: { "content-type": "application/json", ...UA }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }), signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error("http " + r.status); const x = await r.json(); return { v: x.error ? { error: x.error.message } : x.result, rpc: new URL(u).host }; } catch (e) { last = e; } }
  throw new Error("solana rpc unavailable: " + (last && last.message)); }
async function solRpc(calls) { const rs = await Promise.all(calls.map(([m, p]) => sol1(m, p))); return { out: rs.map((r) => r.v), rpc: [...new Set(rs.map((r) => r.rpc))].join(",") }; }
export async function solbalance(a) {
  const addr = String(a.address || a.owner || "").trim(); if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) return bad("address (base58 Solana pubkey) required");
  try {
    const { out: [b, t1, t2], rpc } = await solRpc([["getBalance", [addr, { commitment: "confirmed" }]], ...TOKEN_PROGRAMS.map((p) => ["getTokenAccountsByOwner", [addr, { programId: p }, { encoding: "jsonParsed", commitment: "confirmed" }]])]);
    if (b && b.error) return ok({ address: addr, error: b.error });
    const toks = [t1, t2].flatMap((t, k) => (t && t.value ? t.value : []).map((x) => { const i = x.account.data.parsed.info; return { mint: i.mint, symbol: SOL_MINTS[i.mint] || null, amount: i.tokenAmount.uiAmountString, raw: i.tokenAmount.amount, decimals: i.tokenAmount.decimals, account: x.pubkey, program: k ? "token-2022" : "spl-token", frozen: i.state === "frozen" }; }));
    const nonzero = toks.filter((t) => t.raw !== "0"); const hideZero = a.include_zero !== "true" && a.include_zero !== true;
    return ok({ address: addr, sol: (b.value / 1e9).toString(), lamports: b.value, slot: b.context?.slot, token_accounts: toks.length, nonzero_tokens: nonzero.length, tokens: (hideZero ? nonzero : toks).sort((x, y) => (y.symbol ? 1 : 0) - (x.symbol ? 1 : 0)).slice(0, 100), rpc });
  } catch (e) { return up("solana", e); }
}

// ---- /v1/whois (RDAP) ----
export async function whois(a) {
  const d = String(a.domain || a.q || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!/^(?=.{3,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(d)) return bad("domain required (e.g. example.com)");
  try {
    const r = await fetch(`https://rdap.org/domain/${d}`, { headers: { ...UA, accept: "application/rdap+json,application/json" }, signal: AbortSignal.timeout(9000) });
    if (r.status === 404) return ok({ domain: d, registered: false, note: "RDAP 404: likely unregistered (or TLD without RDAP)" });
    if (!r.ok) throw new Error("rdap http " + r.status);
    const j = await r.json(); const ev = Object.fromEntries((j.events || []).map((e) => [e.eventAction, e.eventDate]));
    const vc = (e) => { const v = e && e.vcardArray && e.vcardArray[1] || []; const f = (k) => (v.find((x) => x[0] === k) || [])[3] || null; return { name: f("fn"), org: f("org"), email: f("email") }; };
    const ents = j.entities || []; const reg = ents.find((e) => (e.roles || []).includes("registrar"));
    const iana = reg && (reg.publicIds || []).find((p) => /iana/i.test(p.type));
    const abuse = reg && (reg.entities || []).find((e) => (e.roles || []).includes("abuse"));
    const created = ev.registration || null, age = created ? Math.floor((Date.now() - Date.parse(created)) / 864e5) : null;
    const exp = ev.expiration || null, dte = exp ? Math.floor((Date.parse(exp) - Date.now()) / 864e5) : null;
    return ok({ domain: j.ldhName ? j.ldhName.toLowerCase() : d, registered: true, handle: j.handle || null, registrar: reg ? vc(reg).name : null, registrar_iana_id: iana ? iana.identifier : null, abuse_email: abuse ? vc(abuse).email : null,
      created, updated: ev["last changed"] || null, expires: exp, age_days: age, days_to_expiry: dte, status: j.status || [], nameservers: (j.nameservers || []).map((n) => String(n.ldhName || "").toLowerCase()), dnssec: j.secureDNS ? !!j.secureDNS.delegationSigned : null,
      flags: [...(age != null && age < 30 ? ["new_domain_lt_30d"] : []), ...(dte != null && dte < 30 ? ["expires_lt_30d"] : []), ...((j.status || []).some((s) => /hold|pending delete|redemption/i.test(s)) ? ["problem_status"] : [])], source: "rdap.org bootstrap -> " + new URL(r.url).host });
  } catch (e) { return up("rdap", e); }
}

// ---- /v1/feedparse (RSS/Atom) ----
const ent = (s) => String(s || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
const iso = (s) => { const t = Date.parse(s || ""); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
export function parseFeed(xml) {
  const x = String(xml); const tagIn = (blk, t) => { const m = blk.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`)); return m ? ent(m[1]) : null; };
  const atom = /<feed[\s>]/.test(x) && !/<rss[\s>]/.test(x); const items = [];
  for (const m of x.matchAll(atom ? /<entry[\s>][\s\S]*?<\/entry>/g : /<item[\s>][\s\S]*?<\/item>/g)) { const it = m[0];
    const link = atom ? ((it.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)/) || it.match(/<link[^>]*href=["']([^"']+)/) || [])[1] || null) : (tagIn(it, "link") || (it.match(/<guid[^>]*>([^<]+)</) || [])[1] || null);
    items.push({ title: tagIn(it, "title"), url: link, published: iso(atom ? tagIn(it, "published") || tagIn(it, "updated") : tagIn(it, "pubDate") || tagIn(it, "dc:date")), author: tagIn(it, atom ? "name" : "author") || tagIn(it, "dc:creator"), summary: (tagIn(it, atom ? "summary" : "description") || tagIn(it, "content") || "").slice(0, 400), categories: [...it.matchAll(/<category[^>]*?(?:term=["']([^"']+)["'][^>]*\/?>|>([\s\S]*?)<\/category>)/g)].map((c) => ent(c[1] || c[2])).filter(Boolean).slice(0, 10) }); }
  const head = x.split(atom ? /<entry[\s>]/ : /<item[\s>]/)[0];
  return { format: atom ? "atom" : /<rdf:RDF/.test(x) ? "rss1" : "rss2", title: tagIn(head, "title"), items: items.filter((i) => i.title || i.url) };
}
export async function feedparse(a) {
  let u = fetchSafeUrl(String(a.url || "")); if (!u) return bad("url (public http/https RSS or Atom feed) required");
  const kws = String(a.q || a.keywords || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10), limit = clamp(a.limit, 1, 100, 25), hours = a.hours ? clamp(a.hours, 1, 24 * 365, 48) : null;
  try {
    let r; for (let i = 0; i < 4; i++) { r = await fetch(u.href, { redirect: "manual", headers: { ...UA, accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(8000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { u = fetchSafeUrl(new URL(r.headers.get("location"), u).href); if (!u) return bad("redirect to disallowed target"); continue; } break; }
    if (!r.ok) return { status: 502, body: { error: "feed http " + r.status, url: u.href } };
    const txt = (await r.text()).slice(0, 3_000_000); if (!/<(rss|feed|rdf:RDF)[\s>]/.test(txt)) return ok({ url: u.href, error: "not an RSS/Atom feed", content_type: r.headers.get("content-type") });
    const f = parseFeed(txt); const cut = hours ? Date.now() - hours * 36e5 : null;
    let items = f.items.filter((i) => !cut || !i.published || Date.parse(i.published) >= cut);
    const counts = {}; if (kws.length) items = items.filter((i) => { const t = `${i.title} ${i.summary} ${i.categories.join(" ")}`.toLowerCase(); let hit = false; for (const k of kws) if (t.includes(k)) { counts[k] = (counts[k] || 0) + 1; hit = true; } return hit; });
    items.sort((x, y) => (Date.parse(y.published || 0) || 0) - (Date.parse(x.published || 0) || 0));
    return ok({ url: u.href, format: f.format, feed_title: f.title, total_items: f.items.length, matched: items.length, keyword_counts: kws.length ? counts : null, items: items.slice(0, limit), fetched_at: new Date().toISOString() });
  } catch (e) { return up("feed", e); }
}
