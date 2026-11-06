// /v1/netintel: DNS records + email auth (MX/SPF/DMARC) + TLS cert issuer/expiry for one public hostname.
// $0 outbound: Cloudflare DoH JSON (cloudflare-dns.com), optional HTTPS reachability peek, optional crt.sh CT lookup.
// Workers cannot read peer certs from fetch(); cert issuer/expiry come from Certificate Transparency (crt.sh), clearly labelled.
import { fetchSafeUrl, UA } from "./fetchpage.js";

const DOH = "https://cloudflare-dns.com/dns-query";
export const NET_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA", "SOA"];
const TYPE_NUM = { 1: "A", 2: "NS", 5: "CNAME", 6: "SOA", 15: "MX", 16: "TXT", 28: "AAAA", 257: "CAA" };
const RCODE = { 0: "NOERROR", 2: "SERVFAIL", 3: "NXDOMAIN", 5: "REFUSED" };

export function isPrivateIp(ip) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) || (a === 192 && b === 0);
  }
  const s = ip.toLowerCase();
  return s === "::" || s === "::1" || /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s) || s.startsWith("::ffff:") || s.startsWith("64:ff9b:");
}
export function normHost(input) {
  if (!input || typeof input !== "string" || input.length > 253) return null;
  let s = input.trim(); if (!/^[a-z]+:\/\//i.test(s)) s = "https://" + s;
  const u = fetchSafeUrl(s); if (!u || /^[\d.]+$/.test(u.hostname)) return null; // hostnames only, no IP literals
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  return /^(?=.{1,253}$)([a-z0-9_](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(h) ? h : null;
}
const unq = (t) => String(t).replace(/^"|"$/g, "").replace(/"\s+"/g, "");
async function doh(name, type, signal) {
  const r = await fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, { signal, headers: { accept: "application/dns-json" } });
  if (!r.ok) throw new Error("doh_http_" + r.status);
  const j = await r.json();
  return { rcode: RCODE[j.Status] || String(j.Status), records: (j.Answer || []).filter((a) => TYPE_NUM[a.type] === type).map((a) => ({ type, ttl: a.TTL, data: type === "TXT" ? unq(a.data) : a.data })) };
}
export function parseSpf(txts) {
  const recs = txts.filter((t) => /^v=spf1(\s|$)/i.test(t));
  if (!recs.length) return { present: false, valid: false, issues: ["no_spf_record"] };
  const issues = []; if (recs.length > 1) issues.push("multiple_spf_records");
  const r = recs[0], terms = r.split(/\s+/).slice(1);
  const all = terms.find((t) => /^[~?+-]?all$/i.test(t)) || null;
  const lookups = terms.filter((t) => /^[~?+-]?(include|a|mx|ptr|exists|redirect)\b/i.test(t)).length;
  if (lookups > 10) issues.push("too_many_dns_lookups"); if (!all && !terms.some((t) => /^redirect=/i.test(t))) issues.push("no_all_mechanism");
  if (all && /^\+?all$/i.test(all)) issues.push("permissive_plus_all");
  return { present: true, valid: recs.length === 1 && lookups <= 10, record: r, all, policy: all ? ({ "-": "fail", "~": "softfail", "?": "neutral" }[all[0]] || "pass") : null, includes: terms.filter((t) => /^include:/i.test(t)).map((t) => t.slice(8)), dns_lookups: lookups, issues };
}
export function parseDmarc(txts) {
  const recs = txts.filter((t) => /^v=DMARC1\s*;?/i.test(t));
  if (!recs.length) return { present: false, valid: false, issues: ["no_dmarc_record"] };
  const tags = Object.fromEntries(recs[0].split(";").map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.indexOf("="); return [x.slice(0, i).trim().toLowerCase(), x.slice(i + 1).trim()]; }));
  const issues = []; if (recs.length > 1) issues.push("multiple_dmarc_records");
  if (!["none", "quarantine", "reject"].includes((tags.p || "").toLowerCase())) issues.push("missing_or_invalid_p");
  if ((tags.p || "").toLowerCase() === "none") issues.push("policy_none_monitoring_only");
  if (!tags.rua) issues.push("no_aggregate_reports_rua");
  return { present: true, valid: recs.length === 1 && !issues.includes("missing_or_invalid_p"), record: recs[0], policy: tags.p || null, subdomain_policy: tags.sp || null, pct: tags.pct ? +tags.pct : 100, rua: tags.rua ? tags.rua.split(",") : [], ruf: tags.ruf ? tags.ruf.split(",") : [], issues };
}
async function ctCert(host, signal) {
  const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json&exclude=expired`, { signal, headers: { "user-agent": UA, accept: "application/json" } });
  if (!r.ok) return { source: "crt.sh", error: "ct_http_" + r.status };
  const t = await r.text(); if (t.length > 2_000_000) return { source: "crt.sh", error: "ct_response_too_large" };
  let rows; try { rows = JSON.parse(t); } catch { return { source: "crt.sh", error: "ct_not_json" }; }
  const now = Date.now(), wild = "*." + host.split(".").slice(1).join(".");
  const m = (Array.isArray(rows) ? rows : []).filter((c) => String(c.name_value || "").toLowerCase().split("\n").some((n) => n === host || n === wild) && Date.parse(c.not_after + "Z") > now)
    .sort((a, b) => Date.parse(b.not_before) - Date.parse(a.not_before))[0];
  if (!m) return { source: "crt.sh", found: false };
  const exp = Date.parse(m.not_after + "Z");
  return { source: "crt.sh", found: true, issuer: m.issuer_name, common_name: m.common_name, not_before: new Date(Date.parse(m.not_before + "Z")).toISOString(), not_after: new Date(exp).toISOString(), days_remaining: Math.floor((exp - now) / 86400000), serial: m.serial_number, crt_sh_id: m.id };
}
const bool = (v, d) => (v === undefined || v === null || v === "" ? d : v === true || v === "true" || v === "1");

export async function netintel(a) {
  const host = normHost(a.host || a.domain || a.hostname || a.url);
  if (!host) return { status: 400, body: { error: "host must be a public DNS hostname (no IP literals, localhost, .local/.internal, ports or credentials)" } };
  const want = a.types ? String(Array.isArray(a.types) ? a.types.join(",") : a.types).toUpperCase().split(",").map((s) => s.trim()).filter((t) => NET_TYPES.includes(t)) : ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "CAA"];
  const signal = AbortSignal.timeout(9000), issues = [];
  const qs = [...new Set([...want, "TXT", "MX", "A", "AAAA"])];
  const res = Object.fromEntries(await Promise.all(qs.map(async (t) => { try { return [t, await doh(host, t, signal)]; } catch (e) { return [t, { error: String(e.message || e.name) }]; } })));
  let dm; try { dm = await doh("_dmarc." + host, "TXT", signal); } catch (e) { dm = { error: String(e.message || e.name), records: [] }; }
  const rcode = res.A?.rcode || res.TXT?.rcode || null;
  const records = Object.fromEntries(want.map((t) => [t, res[t].error ? { error: res[t].error } : res[t].records.map((r) => (t === "MX" ? (([p, x]) => ({ priority: +p, exchange: (x || "").replace(/\.$/, ""), ttl: r.ttl }))(r.data.split(/\s+/)) : { data: r.data, ttl: r.ttl }))]));
  const ips = [...(res.A.records || []), ...(res.AAAA.records || [])].map((r) => r.data);
  const private_ips = ips.filter(isPrivateIp); if (private_ips.length) issues.push("resolves_to_private_ip");
  const txts = (res.TXT.records || []).map((r) => r.data), mx = (res.MX.records || []).map((r) => { const [p, x] = r.data.split(/\s+/); return { priority: +p, exchange: (x || "").replace(/\.$/, "") }; }).sort((x, y) => x.priority - y.priority);
  const nullMx = mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".");
  const email = { mx, accepts_mail: mx.length > 0 && !nullMx, null_mx: nullMx, spf: parseSpf(txts), dmarc: parseDmarc((dm.records || []).map((r) => r.data)) };
  let tls = null;
  if (bool(a.tls, true) && rcode === "NOERROR" && ips.length) {
    tls = { checked: true };
    if (private_ips.length) { tls.skipped = "private_ip_ssrf_guard"; }
    else {
      const t0 = Date.now();
      try { const r = await fetch(`https://${host}/`, { method: "HEAD", redirect: "manual", signal, headers: { "user-agent": UA } }); tls.https_reachable = true; tls.handshake_ok = true; tls.status = r.status; tls.latency_ms = Date.now() - t0; tls.hsts = r.headers.get("strict-transport-security") || null; }
      catch (e) { tls.https_reachable = false; tls.handshake_ok = false; tls.error = e.name === "TimeoutError" ? "timeout" : "unreachable_or_tls_error"; issues.push("https_" + tls.error); }
      if (bool(a.ct, true)) { try { tls.certificate = await ctCert(host, AbortSignal.timeout(7000)); } catch (e) { tls.certificate = { source: "crt.sh", error: e.name === "TimeoutError" ? "timeout" : "ct_unavailable" }; } }
      const d = tls.certificate?.days_remaining; if (typeof d === "number" && d < 14) issues.push("cert_expires_within_14_days");
    }
  }
  if (rcode === "NXDOMAIN") issues.push("nxdomain");
  return { status: 200, body: { host, rcode, records, resolved_ips: ips, email, tls, issues: [...issues, ...email.spf.issues, ...email.dmarc.issues], resolver: "cloudflare-dns.com (DoH JSON)", ssrf_safe: true, checked_at: new Date().toISOString(),
    note: "Workers fetch() cannot read peer certificates: handshake_ok is from a live HTTPS HEAD; issuer/expiry come from Certificate Transparency (crt.sh), newest unexpired cert covering the host." } };
}
