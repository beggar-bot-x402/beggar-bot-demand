// /v1/subtitle: SRT / WebVTT subtitle parse, validate, convert, retime (shift / framerate scale / linear sync), pure compute, zero outbound.
const bad = (m) => ({ status: 400, body: { error: m } });
const TS = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/;
export function parseTime(s) { const m = String(s).trim().match(TS); if (!m) return null; const [, h = "0", mi, se, ms] = m; if (+mi > 59 || +se > 59) return null; return ((+h * 60 + +mi) * 60 + +se) * 1000 + +ms.padEnd(3, "0"); }
const fmt = (t, sep) => { t = Math.max(0, Math.round(t)); const h = Math.floor(t / 3600000), m = Math.floor(t / 60000) % 60, s = Math.floor(t / 1000) % 60, ms = t % 1000; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${sep}${String(ms).padStart(3, "0")}`; };
const strip = (t) => t.replace(/<[^>]*>/g, "").replace(/\{\\[^}]*\}/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
export function parseSubs(src) {
  src = src.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"); const isVtt = /^WEBVTT(?:[ \t].*)?(\n|$)/.test(src); const blocks = src.split(/\n[ \t]*\n+/); const cues = [], errors = [], meta = { styles: 0, notes: 0, regions: 0 };
  blocks.forEach((blk, bi) => { const lines = blk.split("\n").filter((l, i, a) => !(i === 0 && l.trim() === "") ); if (!lines.length || !lines.join("").trim()) return;
    if (isVtt && bi === 0 && /^WEBVTT/.test(lines[0])) return; if (isVtt && /^NOTE(\s|$)/.test(lines[0])) { meta.notes++; return; } if (isVtt && /^STYLE\s*$/.test(lines[0])) { meta.styles++; return; } if (isVtt && /^REGION\s*$/.test(lines[0])) { meta.regions++; return; }
    let i = 0, id = null; if (!lines[0].includes("-->")) { id = lines[0].trim(); i = 1; } const tl = lines[i]; if (!tl || !tl.includes("-->")) { errors.push({ block: bi + 1, error: "no timing line (expected 'start --> end')", text: blk.slice(0, 80) }); return; }
    const [a, rest] = tl.split("-->"); const parts = rest.trim().split(/\s+/); const start = parseTime(a), end = parseTime(parts[0]);
    if (start === null || end === null) { errors.push({ block: bi + 1, id, error: "bad timestamp", line: tl.slice(0, 80) }); return; }
    const text = lines.slice(i + 1).join("\n").replace(/\s+$/, ""); cues.push({ id, start_ms: start, end_ms: end, ...(parts.length > 1 ? { settings: parts.slice(1).join(" ") } : {}), text }); });
  return { format: isVtt ? "vtt" : "srt", cues, errors, meta };
}
export function lint(cues, { maxCps = 21, maxLine = 42, maxLines = 2, minDur = 700, maxDur = 7000 } = {}) {
  const issues = []; const add = (i, code, msg) => issues.length < 500 && issues.push({ cue: i + 1, code, msg });
  cues.forEach((c, i) => { const d = c.end_ms - c.start_ms, plain = strip(c.text), lines = plain.split("\n"), chars = plain.replace(/\n/g, " ").length;
    if (d <= 0) add(i, "non_positive_duration", `end ${fmt(c.end_ms, ".")} <= start`); else { if (d < minDur) add(i, "too_short", `${d} ms on screen`); if (d > maxDur) add(i, "too_long", `${d} ms on screen`); const cps = chars / (d / 1000); if (cps > maxCps) add(i, "reading_speed", `${cps.toFixed(1)} chars/sec > ${maxCps}`); }
    if (!plain.trim()) add(i, "empty_text", "cue has no text"); if (lines.length > maxLines) add(i, "too_many_lines", `${lines.length} lines > ${maxLines}`); const long = Math.max(...lines.map((l) => l.length)); if (long > maxLine) add(i, "line_too_long", `${long} chars > ${maxLine}`);
    if (i > 0) { const p = cues[i - 1]; if (c.start_ms < p.start_ms) add(i, "out_of_order", "starts before previous cue"); else if (c.start_ms < p.end_ms) add(i, "overlap", `overlaps previous cue by ${p.end_ms - c.start_ms} ms`); } });
  return issues;
}
export function toSrt(cues) { return cues.map((c, i) => `${i + 1}\n${fmt(c.start_ms, ",")} --> ${fmt(c.end_ms, ",")}\n${c.text.replace(/<(?!\/?(b|i|u|font)\b)[^>]*>/g, "")}`).join("\n\n") + "\n"; }
export function toVtt(cues) { return "WEBVTT\n\n" + cues.map((c) => `${c.id && !/^\d+$/.test(c.id) ? c.id + "\n" : ""}${fmt(c.start_ms, ".")} --> ${fmt(c.end_ms, ".")}${c.settings ? " " + c.settings : ""}\n${c.text.replace(/\{\\[^}]*\}/g, "").replace(/-->/g, "→")}`).join("\n\n") + "\n"; }
export async function subtitle(a) {
  let src = a.text ?? a.subtitles ?? a.srt ?? a.vtt; if (!src && a.b64) { try { src = new TextDecoder().decode(Uint8Array.from(atob(String(a.b64).replace(/\s/g, "")), (c) => c.charCodeAt(0))); } catch { return bad("b64 is not valid base64"); } }
  if (!src || typeof src !== "string") return bad("text (SRT or WebVTT content) or b64 required"); if (src.length > 1000000) return bad("subtitle file too large (≤1 MB)");
  const to = String(a.to || "json").toLowerCase(); if (!["json", "srt", "vtt", "txt", "all"].includes(to)) return bad("to must be json, srt, vtt, txt or all");
  const p = parseSubs(src); if (!p.cues.length) return bad("no cues parsed" + (p.errors.length ? ": " + p.errors[0].error : "")); if (p.cues.length > 20000) return bad("max 20000 cues");
  const num = (v, n) => { if (v === undefined || v === "") return undefined; const x = Number(v); if (!Number.isFinite(x)) throw new Error(n + " must be a number"); return x; };
  let shift, scale, from = [], ops = [];
  try { shift = num(a.shift_ms, "shift_ms"); scale = num(a.scale, "scale"); const ff = num(a.from_fps, "from_fps"), tf = num(a.to_fps, "to_fps");
    if (ff !== undefined || tf !== undefined) { if (!(ff > 0 && tf > 0)) throw new Error("from_fps and to_fps must both be > 0"); scale = (scale ?? 1) * ff / tf; ops.push(`fps ${ff}→${tf}`); }
    if (a.sync) { from = typeof a.sync === "string" ? JSON.parse(a.sync) : a.sync; }
  } catch (e) { return bad(e.message); }
  let cues = p.cues.map((c) => ({ ...c }));
  if (Array.isArray(from) && from.length) { // two-point linear sync: [{cue:n, at:"hh:mm:ss,mmm"}, {cue:m, at:...}]
    if (from.length !== 2) return bad("sync must be 2 points [{cue, at}, {cue, at}]"); const pts = from.map((x) => ({ c: cues[Number(x.cue) - 1], at: parseTime(x.at) ?? Number(x.at_ms) }));
    if (pts.some((x) => !x.c || !Number.isFinite(x.at))) return bad("sync points need valid cue numbers and at timestamps"); const [p1, p2] = pts; if (p1.c.start_ms === p2.c.start_ms) return bad("sync cues must have different start times");
    const k = (p2.at - p1.at) / (p2.c.start_ms - p1.c.start_ms), b0 = p1.at - k * p1.c.start_ms; cues.forEach((c) => { c.start_ms = Math.round(k * c.start_ms + b0); c.end_ms = Math.round(k * c.end_ms + b0); }); ops.push(`linear sync scale=${k.toFixed(6)} offset_ms=${Math.round(b0)}`); }
  if (scale !== undefined) { if (!(scale > 0.1 && scale < 10)) return bad("scale out of range (0.1-10)"); cues.forEach((c) => { c.start_ms = Math.round(c.start_ms * scale); c.end_ms = Math.round(c.end_ms * scale); }); if (!ops.some((o) => o.startsWith("fps"))) ops.push(`scale ${scale}`); }
  if (shift) { if (Math.abs(shift) > 86400000) return bad("shift_ms out of range (±24h)"); cues.forEach((c) => { c.start_ms += shift; c.end_ms += shift; }); ops.push(`shift ${shift > 0 ? "+" : ""}${shift} ms`); }
  const clipped = cues.filter((c) => c.start_ms < 0).length; cues = cues.filter((c) => c.end_ms > 0).map((c) => ({ ...c, start_ms: Math.max(0, c.start_ms) }));
  if (String(a.sort) === "true") { cues.sort((x, y) => x.start_ms - y.start_ms); ops.push("sorted"); }
  if (String(a.fix_overlaps) === "true") { let n = 0; for (let i = 1; i < cues.length; i++) if (cues[i].start_ms < cues[i - 1].end_ms && cues[i].start_ms > cues[i - 1].start_ms) { cues[i - 1].end_ms = cues[i].start_ms - 1; n++; } ops.push(`fixed ${n} overlaps`); }
  const lim = { maxCps: num(a.max_cps) ?? 21, maxLine: num(a.max_line) ?? 42 }; const issues = lint(cues, lim);
  const words = cues.reduce((n, c) => n + (strip(c.text).match(/\S+/g) || []).length, 0); const span = cues.length ? Math.max(...cues.map((c) => c.end_ms)) : 0;
  const counts = issues.reduce((o, x) => ((o[x.code] = (o[x.code] || 0) + 1), o), {});
  const body = { input_format: p.format, cues: cues.length, parse_errors: p.errors.slice(0, 50), operations: ops, dropped_before_zero: cues.length < p.cues.length ? p.cues.length - cues.length : 0, clipped_to_zero: clipped,
    stats: { first_start: cues.length ? fmt(cues[0].start_ms, ".") : null, last_end: fmt(span, "."), duration_ms: span, words, avg_cue_ms: cues.length ? Math.round(cues.reduce((n, c) => n + c.end_ms - c.start_ms, 0) / cues.length) : 0, vtt_blocks: p.meta },
    valid: !p.errors.length && !counts.non_positive_duration && !counts.out_of_order && !counts.overlap, issue_counts: counts, issues: issues.slice(0, 200) };
  if (to === "json" || to === "all") body.cues_json = cues.slice(0, 5000).map((c, i) => ({ index: i + 1, id: c.id, start: fmt(c.start_ms, "."), end: fmt(c.end_ms, "."), start_ms: c.start_ms, end_ms: c.end_ms, text: c.text, plain: strip(c.text) }));
  if (to === "srt" || to === "all") body.srt = toSrt(cues); if (to === "vtt" || to === "all") body.vtt = toVtt(cues);
  if (to === "txt" || to === "all") body.transcript = cues.map((c) => strip(c.text).replace(/\n/g, " ")).join("\n");
  return { status: 200, body };
}
