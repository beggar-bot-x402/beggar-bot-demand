// Media-adjacent SKUs (pure compute; optional SSRF-safe capped fetch): /v1/imgmeta (image dims/format/EXIF), /v1/avmeta (WAV/MP3/MP4 duration+codec), /v1/qr (QR encode → SVG/matrix).
import { fetchSafeUrl, UA } from "./fetchpage.js";
const bad = (m) => ({ status: 400, body: { error: m } });
const MAX = 4_000_000, HOPS = 3, TIMEOUT = 8000;
export async function loadBytes(a) {
  if (a.b64 || a.base64 || a.data) { let s = String(a.b64 || a.base64 || a.data).replace(/^data:[^,]*,/, "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
    if (s.length > MAX * 4 / 3 + 8) throw new Error("base64 too large (max 4 MB)"); const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); return { bytes: u, source: "base64", capped: false }; }
  let cur = a.url && fetchSafeUrl(String(a.url)); if (!cur) throw new Error("url (public http(s), default port, no private IPs) or b64 required");
  const signal = AbortSignal.timeout(TIMEOUT);
  for (let hop = 0; hop <= HOPS; hop++) { const r = await fetch(cur.href, { redirect: "manual", signal, headers: { "user-agent": UA, accept: "*/*", range: `bytes=0-${MAX - 1}` } });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { const nx = fetchSafeUrl(new URL(r.headers.get("location"), cur).href); if (!nx) throw new Error("redirect to disallowed target"); cur = nx; continue; }
    if (!r.ok) throw new Error("upstream status " + r.status);
    const chunks = []; let n = 0, capped = false; if (r.body) { const rd = r.body.getReader(); for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.byteLength; chunks.push(value); if (n >= MAX) { capped = true; try { await rd.cancel(); } catch {} break; } } }
    const u = new Uint8Array(Math.min(n, MAX)); let o = 0; for (const c of chunks) { const t = c.subarray(0, u.length - o); u.set(t, o); o += t.length; if (o >= u.length) break; }
    const total = Number((r.headers.get("content-range") || "").split("/")[1]) || Number(r.headers.get("content-length")) || null;
    return { bytes: u, source: cur.href, capped, content_type: r.headers.get("content-type"), total_bytes: total }; }
  throw new Error("too many redirects");
}
const be16 = (b, o) => (b[o] << 8) | b[o + 1], le16 = (b, o) => b[o] | (b[o + 1] << 8);
const be32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3], le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216;
const asc = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

// ---------- EXIF (TIFF) ----------
const TAGS = { 0x010f: "Make", 0x0110: "Model", 0x0112: "Orientation", 0x0131: "Software", 0x0132: "DateTime", 0x013b: "Artist", 0x8298: "Copyright", 0x8769: "ExifIFD", 0x8825: "GPSIFD",
  0x829a: "ExposureTime", 0x829d: "FNumber", 0x8827: "ISO", 0x9003: "DateTimeOriginal", 0x9004: "DateTimeDigitized", 0x920a: "FocalLength", 0xa002: "PixelXDimension", 0xa003: "PixelYDimension", 0xa434: "LensModel", 0x9209: "Flash",
  0x0001: "GPSLatitudeRef", 0x0002: "GPSLatitude", 0x0003: "GPSLongitudeRef", 0x0004: "GPSLongitude", 0x0006: "GPSAltitude" };
export function parseExif(b, base = 0) {
  const le = asc(b, base, 2) === "II"; if (!le && asc(b, base, 2) !== "MM") throw new Error("bad TIFF header");
  const u16 = (o) => le ? le16(b, base + o) : be16(b, base + o), u32 = (o) => le ? le32(b, base + o) : be32(b, base + o);
  const out = {}, SZ = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const ifd = (off, gps, depth) => { if (depth > 3 || off + 2 > b.length - base) return; const n = Math.min(u16(off), 200);
    for (let i = 0; i < n; i++) { const e = off + 2 + i * 12; if (base + e + 12 > b.length) break; const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4), name = gps && tag > 6 ? null : (gps || tag > 6 ? TAGS[tag] : null); if (!name) continue;
      const size = (SZ[type] || 1) * cnt, vo = size <= 4 ? e + 8 : u32(e + 8); if (base + vo + size > b.length || cnt > 4096) continue;
      const rd = (k) => type === 3 ? u16(vo + k * 2) : type === 4 || type === 9 ? u32(vo + k * 4) : type === 5 || type === 10 ? (u32(vo + k * 8 + 4) ? u32(vo + k * 8) / u32(vo + k * 8 + 4) : 0) : b[base + vo + k];
      let v; if (type === 2) v = asc(b, base + vo, cnt).replace(/\0+$/, "").trim(); else if (type === 7) continue; else v = cnt === 1 ? rd(0) : Array.from({ length: Math.min(cnt, 8) }, (_, k) => rd(k));
      if (name === "ExifIFD") ifd(v, false, depth + 1); else if (name === "GPSIFD") ifd(v, true, depth + 1); else out[name] = v; } };
  ifd(u32(4), false, 0);
  const dms = (a, ref) => Array.isArray(a) && a.length === 3 ? +((a[0] + a[1] / 60 + a[2] / 3600) * (ref === "S" || ref === "W" ? -1 : 1)).toFixed(6) : null;
  if (out.GPSLatitude) { out.gps = { lat: dms(out.GPSLatitude, out.GPSLatitudeRef), lon: dms(out.GPSLongitude, out.GPSLongitudeRef), alt_m: out.GPSAltitude ?? null }; for (const k of ["GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef", "GPSAltitude"]) delete out[k]; }
  return out;
}
export function probeImage(b) {
  if (b.length < 12) throw new Error("too short");
  if (be32(b, 0) === 0x89504e47) { const r = { format: "png", mime: "image/png", width: be32(b, 16), height: be32(b, 20), bit_depth: b[24], color_type: ["gray", null, "rgb", "palette", "gray+alpha", null, "rgba"][b[25]] ?? b[25], interlaced: b[28] === 1 };
    let o = 8; while (o + 8 <= b.length) { const n = be32(b, o), t = asc(b, o + 4, 4); if (t === "acTL") r.animated = true; if (t === "eXIf") try { r.exif = parseExif(b, o + 8); } catch {} if (t === "pHYs" && b[o + 16] === 1) r.dpi = Math.round(be32(b, o + 8) * 0.0254); if (t === "IDAT" || t === "IEND") break; o += 12 + n; } return r; }
  if (b[0] === 0xff && b[1] === 0xd8) { const r = { format: "jpeg", mime: "image/jpeg" }; let o = 2;
    while (o + 4 <= b.length) { if (b[o] !== 0xff) { o++; continue; } const m = b[o + 1]; if (m === 0xff) { o++; continue; } if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; } const L = be16(b, o + 2);
      if (m === 0xe1 && asc(b, o + 4, 6) === "Exif\0\0") try { r.exif = parseExif(b, o + 10); } catch (e) { r.exif_error = e.message; }
      if (m === 0xe0 && asc(b, o + 4, 4) === "JFIF" && b[o + 11] === 1) r.dpi = be16(b, o + 12);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { r.height = be16(b, o + 5); r.width = be16(b, o + 7); r.components = b[o + 9]; r.progressive = m === 0xc2; r.bit_depth = b[o + 4]; break; }
      if (m === 0xda) break; o += 2 + L; }
    if (r.exif?.Orientation >= 5 && r.width) r.display = { width: r.height, height: r.width, rotated: true }; return r; }
  if (asc(b, 0, 3) === "GIF") { let frames = 0; for (let i = 13; i < b.length - 1; i++) if (b[i] === 0x21 && b[i + 1] === 0xf9) frames++; return { format: "gif", mime: "image/gif", version: asc(b, 3, 3), width: le16(b, 6), height: le16(b, 8), animated: frames > 1, frames_seen: frames || 1 }; }
  if (asc(b, 0, 4) === "RIFF" && asc(b, 8, 4) === "WEBP") { const c = asc(b, 12, 4), r = { format: "webp", mime: "image/webp", chunk: c };
    if (c === "VP8 ") { r.width = le16(b, 26) & 0x3fff; r.height = le16(b, 28) & 0x3fff; r.lossless = false; }
    else if (c === "VP8L") { const v = le32(b, 21); r.width = (v & 0x3fff) + 1; r.height = ((v >>> 14) & 0x3fff) + 1; r.lossless = true; }
    else if (c === "VP8X") { r.width = 1 + (b[24] | b[25] << 8 | b[26] << 16); r.height = 1 + (b[27] | b[28] << 8 | b[29] << 16); r.animated = !!(b[20] & 2); r.alpha = !!(b[20] & 16);
      let o = 30; while (o + 8 <= b.length) { const t = asc(b, o, 4), n = le32(b, o + 4); if (t === "EXIF") try { r.exif = parseExif(b, o + 8 + (asc(b, o + 8, 6) === "Exif\0\0" ? 6 : 0)); } catch {} o += 8 + n + (n & 1); } }
    return r; }
  if (asc(b, 0, 2) === "BM") return { format: "bmp", mime: "image/bmp", width: le32(b, 18), height: Math.abs(le32(b, 22) | 0), bit_depth: le16(b, 28) };
  if (asc(b, 0, 2) === "II" || asc(b, 0, 2) === "MM") { const ex = parseExif(b, 0); return { format: "tiff", mime: "image/tiff", exif: ex }; }
  if (asc(b, 4, 4) === "ftyp" && /avif|avis|heic|heix|mif1/.test(asc(b, 8, 4))) { const r = { format: /avi/.test(asc(b, 8, 4)) ? "avif" : "heif", brand: asc(b, 8, 4) }; for (let i = 0; i + 20 < Math.min(b.length, 1 << 20); i++) if (asc(b, i, 4) === "ispe") { r.width = be32(b, i + 8); r.height = be32(b, i + 12); break; } return r; }
  if (/^\s*<(\?xml|svg)/i.test(asc(b, 0, Math.min(b.length, 200)))) { const t = new TextDecoder().decode(b.subarray(0, 4096)), g = (k) => (t.match(new RegExp("<svg[^>]*\\s" + k + "=[\"']([^\"']+)")) || [])[1]; return { format: "svg", mime: "image/svg+xml", width: g("width") || null, height: g("height") || null, viewBox: g("viewBox") || null }; }
  throw new Error("unrecognized image format");
}
export async function imgmeta(a) {
  let L; try { L = await loadBytes(a); } catch (e) { return bad(e.message); }
  try { const r = probeImage(L.bytes); if (r.exif && !Object.keys(r.exif).length) delete r.exif; if (r.exif?.gps) r.privacy_warning = "image embeds GPS location";
    return { status: 200, body: { valid: true, source: L.source, bytes_read: L.bytes.length, total_bytes: L.total_bytes ?? L.bytes.length, content_type: L.content_type ?? null, ...r } };
  } catch (e) { return { status: 200, body: { valid: false, error: e.message, bytes_read: L.bytes.length } }; }
}

// ---------- AV ----------
const FOURCC = { avc1: "H.264/AVC", avc3: "H.264/AVC", hvc1: "H.265/HEVC", hev1: "H.265/HEVC", av01: "AV1", vp09: "VP9", mp4a: "AAC/MPEG-4 Audio", "ac-3": "AC-3", "ec-3": "E-AC-3", Opus: "Opus", fLaC: "FLAC", mp4v: "MPEG-4 Visual", alac: "ALAC" };
function mp4(b) { const r = { format: "mp4/mov", brand: asc(b, 8, 4).trim(), tracks: [] }; let found = false;
  const walk = (s, e, path, trk) => { let o = s; while (o + 8 <= e) { let n = be32(b, o), t = asc(b, o + 4, 4), h = 8; if (n === 1) { n = be32(b, o + 8) * 4294967296 + be32(b, o + 12); h = 16; } else if (n === 0) n = e - o; if (n < h) break; const end = Math.min(o + n, e);
      if (t === "moov") found = true;
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(t)) { if (t === "trak") { const k = {}; r.tracks.push(k); walk(o + h, end, t, k); } else walk(o + h, end, t, trk); }
      else if (t === "mvhd") { const v = b[o + h], ts = v === 1 ? be32(b, o + h + 20) : be32(b, o + h + 12), d = v === 1 ? be32(b, o + h + 24) * 4294967296 + be32(b, o + h + 28) : be32(b, o + h + 16); r.timescale = ts; r.duration_s = ts ? +(d / ts).toFixed(3) : null; }
      else if (t === "tkhd" && trk) { const v = b[o + h], wo = o + h + (v === 1 ? 88 : 76); if (wo + 8 <= end) { const w = be32(b, wo) / 65536, hh = be32(b, wo + 4) / 65536; if (w && hh) { trk.width = w; trk.height = hh; } } }
      else if (t === "mdhd" && trk) { const v = b[o + h], ts = v === 1 ? be32(b, o + h + 20) : be32(b, o + h + 12), d = v === 1 ? be32(b, o + h + 28) : be32(b, o + h + 16); trk.duration_s = ts ? +(d / ts).toFixed(3) : null; trk.timescale = ts; }
      else if (t === "hdlr" && trk) trk.kind = { vide: "video", soun: "audio", text: "text", subt: "subtitle", sbtl: "subtitle", meta: "metadata" }[asc(b, o + h + 8, 4)] || asc(b, o + h + 8, 4);
      else if (t === "stsd" && trk) { const c = asc(b, o + h + 12, 4); trk.codec_fourcc = c; trk.codec = FOURCC[c] || c; const se = o + h + 8 + 8;
        if (trk.kind === "audio" && se + 28 <= end) { trk.channels = be16(b, se + 16); trk.sample_rate = be16(b, se + 24); } }
      o = o + n > o ? o + n : e; } };
  walk(0, b.length, "", null); if (!found) r.note = "moov box not found in fetched bytes (moov-at-end file larger than 4 MB cap?)";
  const v = r.tracks.find((t) => t.kind === "video"); if (v) { r.width = v.width; r.height = v.height; r.video_codec = v.codec; } const au = r.tracks.find((t) => t.kind === "audio"); if (au) { r.audio_codec = au.codec; r.sample_rate = au.sample_rate; r.channels = au.channels; }
  return r; }
function wav(b) { const r = { format: "wav" }; let o = 12; while (o + 8 <= b.length) { const t = asc(b, o, 4), n = le32(b, o + 4);
    if (t === "fmt ") { const f = le16(b, o + 8); r.codec = { 1: "PCM", 3: "IEEE float", 6: "A-law", 7: "µ-law", 0x55: "MP3", 0xfffe: "PCM (extensible)" }[f] || "0x" + f.toString(16); r.channels = le16(b, o + 10); r.sample_rate = le32(b, o + 12); r.byte_rate = le32(b, o + 16); r.bits_per_sample = le16(b, o + 22); }
    if (t === "data") { r.data_bytes = n; if (r.byte_rate) r.duration_s = +(n / r.byte_rate).toFixed(3); break; } o += 8 + n + (n & 1); } return r; }
const BR = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
function mp3(b, total) { let o = 0, r = { format: "mp3" }; if (asc(b, 0, 3) === "ID3") { const sz = (b[6] & 127) * 2097152 + (b[7] & 127) * 16384 + (b[8] & 127) * 128 + (b[9] & 127); r.id3v2 = "2." + b[3]; o = 10 + sz; }
  while (o + 4 < b.length && !(b[o] === 0xff && (b[o + 1] & 0xe0) === 0xe0 && ((b[o + 1] >> 1) & 3) === 1)) o++; if (o + 4 >= b.length) throw new Error("no MPEG audio frame found");
  const ver = (b[o + 1] >> 3) & 3, mpeg1 = ver === 3, bri = b[o + 2] >> 4, sri = (b[o + 2] >> 2) & 3, ch = b[o + 3] >> 6;
  const sr = [[11025, 12000, 8000], null, [22050, 24000, 16000], [44100, 48000, 32000]][ver]?.[sri]; const kbps = BR[mpeg1 ? 1 : 2][bri]; if (!sr) throw new Error("bad MPEG header");
  Object.assign(r, { codec: "MPEG-" + (mpeg1 ? "1" : ver === 2 ? "2" : "2.5") + " Layer III", sample_rate: sr, channels: ch === 3 ? 1 : 2, bitrate_kbps: kbps });
  const spf = mpeg1 ? 1152 : 576, side = mpeg1 ? (ch === 3 ? 17 : 32) : (ch === 3 ? 9 : 17), x = o + 4 + side, tag = asc(b, x, 4);
  if ((tag === "Xing" || tag === "Info") && (b[x + 7] & 1)) { const frames = be32(b, x + 8); r.vbr = tag === "Xing"; r.duration_s = +(frames * spf / sr).toFixed(3); }
  else if (asc(b, o + 36, 4) === "VBRI") { r.vbr = true; r.duration_s = +(be32(b, o + 36 + 14) * spf / sr).toFixed(3); }
  else if (kbps && total) { r.vbr = false; r.duration_s = +((total - o) * 8 / (kbps * 1000)).toFixed(3); r.duration_estimated = true; }
  return r; }
export function probeAV(b, total) {
  if (b.length < 12) throw new Error("too short");
  if (asc(b, 4, 4) === "ftyp" || ["moov", "mdat", "free", "wide"].includes(asc(b, 4, 4))) return mp4(b);
  if (asc(b, 0, 4) === "RIFF" && asc(b, 8, 4) === "WAVE") return wav(b);
  if (asc(b, 0, 4) === "fLaC") { const o = 8; const sr = (b[o + 10] << 12) | (b[o + 11] << 4) | (b[o + 12] >> 4), chn = ((b[o + 12] >> 1) & 7) + 1, bps = (((b[o + 12] & 1) << 4) | (b[o + 13] >> 4)) + 1, ns = (b[o + 13] & 15) * 4294967296 + be32(b, o + 14); return { format: "flac", codec: "FLAC", sample_rate: sr, channels: chn, bits_per_sample: bps, duration_s: sr ? +(ns / sr).toFixed(3) : null }; }
  if (asc(b, 0, 4) === "OggS") { const r = { format: "ogg", codec: asc(b, 28, 8) === "OpusHead" ? "Opus" : asc(b, 29, 6) === "vorbis" ? "Vorbis" : "unknown" }; if (r.codec === "Opus") { r.channels = b[37]; r.sample_rate = 48000; } if (r.codec === "Vorbis") { r.channels = b[39]; r.sample_rate = le32(b, 40); } return r; }
  if (be32(b, 0) === 0x1a45dfa3) return { format: /webm/.test(asc(b, 0, 64)) ? "webm" : "matroska", note: "container detected; duration/codec parsing for EBML not implemented" };
  if (asc(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return mp3(b, total);
  throw new Error("unrecognized audio/video format (supported: MP4/MOV/M4A, WAV, MP3, FLAC, Ogg; WebM detect-only)");
}
export async function avmeta(a) {
  let L; try { L = await loadBytes(a); } catch (e) { return bad(e.message); }
  try { const r = probeAV(L.bytes, L.total_bytes ?? (L.capped ? null : L.bytes.length)); if (r.duration_s != null) r.duration_hms = new Date(r.duration_s * 1000).toISOString().slice(11, 23);
    return { status: 200, body: { valid: true, source: L.source, bytes_read: L.bytes.length, total_bytes: L.total_bytes ?? L.bytes.length, content_type: L.content_type ?? null, ...r } };
  } catch (e) { return { status: 200, body: { valid: false, error: e.message, bytes_read: L.bytes.length } }; }
}

// ---------- QR encode (byte mode, versions 1-40 via generic tables, EC L/M/Q/H) ----------
const ECC = { L: [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30], M: [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  Q: [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30], H: [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30] };
const NB = { L: [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25], M: [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  Q: [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68], H: [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81] };
const FMT = { L: 1, M: 0, Q: 3, H: 2 };
const rawMods = (v) => { let r = (16 * v + 128) * v + 64; if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
const dataCw = (v, e) => Math.floor(rawMods(v) / 8) - ECC[e][v - 1] * NB[e][v - 1];
const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; };
function rsDiv(deg) { const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1; for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gmul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gmul(root, 2); } return r; }
function rsRem(data, div) { const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gmul(c, f); }); } return r; }
const alignPos = (v) => { if (v === 1) return []; const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6]; for (let p = v * 4 + 10; out.length < n; p -= step) out.splice(1, 0, p); return out; };
export function qrEncode(text, ecl = "M", minVer = 1) {
  const bytes = new TextEncoder().encode(text); let v;
  for (v = Math.max(1, minVer); v <= 40; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= dataCw(v, ecl) * 8) break; if (v > 40) throw new Error("data too long for QR");
  const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); for (const b of bytes) put(b, 8); const cap = dataCw(v, ecl) * 8;
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8); for (let p = 0xec; bits.length < cap; p ^= 0xec ^ 0x11) put(p, 8);
  const dw = []; for (let i = 0; i < bits.length; i += 8) dw.push(bits.slice(i, i + 8).reduce((a, x) => a * 2 + x, 0));
  const nb = NB[ecl][v - 1], ec = ECC[ecl][v - 1], raw = Math.floor(rawMods(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDiv(ec), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) { const d = dw.slice(k, k + shortLen - ec + (i < nShort ? 0 : 1)); k += d.length; const e = rsRem(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
  const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ec || j >= nShort) cw.push(b[i]); });
  const size = v * 4 + 17, M = [...Array(size)].map(() => new Array(size).fill(false)), F = [...Array(size)].map(() => new Array(size).fill(false));
  const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPos(v); ap.forEach((a, i) => ap.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
  const drawFmt = (mask) => { const d = FMT[ecl] << 3 | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = (d << 10 | r) ^ 0x5412, g = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true); };
  drawFmt(0);
  if (v >= 7) { let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25); const b = v << 12 | r; for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); } }
  let i = 0; for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!F[y][x] && i < cw.length * 8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; } } }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0, (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x]; };
  const penalty = () => { let p = 0; const lines = []; for (let y = 0; y < size; y++) { lines.push(M[y]); lines.push(M.map((r) => r[y])); }
    for (const l of lines) { let run = 1; for (let k = 1; k <= size; k++) { if (k < size && l[k] === l[k - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; } }
      const s = l.map((b) => b ? 1 : 0).join(""); p += 40 * ((s.match(/(?=10111010000|00001011101)/g) || []).length); }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    const dark = M.flat().filter(Boolean).length; p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10; return p; };
  let best = 0, bp = Infinity; const tries = v <= 10 ? 8 : 1; /* full mask search only for small symbols: keeps Worker Free CPU low */ for (let m = 0; m < tries; m++) { applyMask(m); drawFmt(m); const p = penalty(); if (p < bp) { bp = p; best = m; } applyMask(m); }
  applyMask(best); drawFmt(best); return { version: v, size, ecl, mask: best, modules: M };
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export async function qr(a) {
  const text = a.text ?? a.data ?? a.url; if (text == null || text === "") return bad("text required"); if (new TextEncoder().encode(String(text)).length > 1200) return bad("text too long (max 1200 bytes)");
  const ecl = String(a.ecl || a.level || "M").toUpperCase(); if (!ECC[ecl]) return bad("ecl must be L, M, Q or H");
  const border = Math.min(Math.max(parseInt(a.border ?? 4) || 0, 0), 20), scale = Math.min(Math.max(parseInt(a.scale ?? 8) || 8, 1), 40);
  const fg = /^#?[0-9a-f]{3,8}$/i.test(a.fg || "") ? "#" + a.fg.replace("#", "") : "#000000", bgc = /^#?[0-9a-f]{3,8}$/i.test(a.bg || "") ? "#" + a.bg.replace("#", "") : "#ffffff";
  let q; try { q = qrEncode(String(text), ecl); } catch (e) { return bad(e.message); }
  const n = q.size + border * 2; let path = ""; q.modules.forEach((row, y) => row.forEach((d, x) => { if (d) path += `M${x + border},${y + border}h1v1h-1z`; }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * scale}" height="${n * scale}" shape-rendering="crispEdges"><title>${esc(String(text).slice(0, 200))}</title><rect width="100%" height="100%" fill="${bgc}"/><path d="${path}" fill="${fg}"/></svg>`;
  const body = { version: q.version, size: q.size, ecl: q.ecl, mask: q.mask, bytes: new TextEncoder().encode(String(text)).length, svg, svg_data_uri: "data:image/svg+xml;base64," + btoa(svg) };
  if (a.matrix === true || a.matrix === "true" || a.matrix === "1") body.matrix = q.modules.map((r) => r.map((d) => d ? "1" : "0").join(""));
  return { status: 200, body };
}
