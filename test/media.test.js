import test from "node:test"; import assert from "node:assert/strict";
import { handle } from "../src/index.js";
import { imgmeta, avmeta, qr, qrEncode, probeImage, probeAV, parseExif } from "../src/media.js";
const env = (o = {}) => ({ BEGGAR_DEMAND_TESTS_ENABLED: "true", ...o });
const PAID = { X402_MODE: "mainnet", X402_MAINNET_ALLOWED: "true", X402_PAY_TO: "0x719227f384b66BFEF00093D6d8d32fA9dC2B40e7", X402_PRICE_USD: "0.02", X402_FACILITATOR_URL: "https://f.test" };
const call = async (p, init, e = env()) => { const r = await handle(new Request("https://w.test" + p, init), e); return [r.status, await r.json()]; };
const b64 = (u) => Buffer.from(u).toString("base64");
const cat = (...a) => new Uint8Array(a.flatMap((x) => typeof x === "string" ? [...Buffer.from(x, "latin1")] : Array.isArray(x) ? x : [...x]));
const u32be = (n) => [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255], u32le = (n) => u32be(n).reverse(), u16be = (n) => [n >> 8, n & 255], u16le = (n) => [n & 255, n >> 8];
const PNG = cat([0x89], "PNG\r\n\x1a\n", u32be(13), "IHDR", u32be(640), u32be(480), [8, 6, 0, 0, 0], u32be(0), u32be(0), "IEND", u32be(0));
// TIFF/EXIF (big-endian) with Make, Orientation=6, GPS IFD 51.5N 0.1W
function tiff() { const t = []; const w16 = (n) => t.push(...u16be(n)), w32 = (n) => t.push(...u32be(n));
  t.push(..."MM".split("").map((c) => c.charCodeAt(0))); w16(42); w32(8);
  w16(3); w16(0x010f); w16(2); w32(6); w32(50); w16(0x0112); w16(3); w32(1); w16(6); w16(0); w16(0x8825); w16(4); w32(1); w32(56); w32(0);
  while (t.length < 50) t.push(0); t.push(..."Canon\0".split("").map((c) => c.charCodeAt(0)));
  w16(4); w16(1); w16(2); w32(2); t.push(78, 0, 0, 0); w16(2); w16(5); w32(3); w32(110); w16(3); w16(2); w32(2); t.push(87, 0, 0, 0); w16(4); w16(5); w32(3); w32(134); w32(0);
  while (t.length < 110) t.push(0); for (const [n, d] of [[51, 1], [30, 1], [0, 1], [0, 1], [6, 1], [0, 1]]) { w32(n); w32(d); } return t; }
const TIFF = tiff();
const JPEG = cat([0xff, 0xd8, 0xff, 0xe1], u16be(TIFF.length + 8), "Exif\0\0", TIFF, [0xff, 0xc0], u16be(17), [8], u16be(1080), u16be(1920), [3], new Array(9).fill(0), [0xff, 0xda]);
const WAV = cat("RIFF", u32le(36 + 88200), "WAVE", "fmt ", u32le(16), u16le(1), u16le(2), u32le(22050), u32le(88200), u16le(4), u16le(16), "data", u32le(88200), new Array(64).fill(0));
const box = (t, ...c) => { const body = cat(...c); return cat(u32be(body.length + 8), t, body); };
const MP4 = cat(box("ftyp", "isom", u32be(512), "isomavc1"), box("moov", box("mvhd", [0, 0, 0, 0], u32be(0), u32be(0), u32be(600), u32be(6000), new Array(80).fill(0)),
  box("trak", box("tkhd", [0, 0, 0, 3], new Array(72).fill(0), u32be(1280 << 16), u32be(720 << 16)), box("mdia", box("mdhd", [0, 0, 0, 0], u32be(0), u32be(0), u32be(600), u32be(6000), u32be(0)), box("hdlr", u32be(0), u32be(0), "vide", new Array(12).fill(0)), box("minf", box("stbl", box("stsd", u32be(0), u32be(1), u32be(16), "avc1", new Array(8).fill(0))))))));
const MP3 = cat([0xff, 0xfb, 0x90, 0x44], new Array(32).fill(0), "Xing", u32be(1), u32be(100), new Array(400).fill(0));
test("imgmeta: PNG, JPEG+EXIF+GPS+orientation, GIF, WebP VP8L, garbage", async () => {
  const p = (await imgmeta({ b64: b64(PNG) })).body; assert.equal(p.format, "png"); assert.equal(p.width, 640); assert.equal(p.height, 480); assert.equal(p.color_type, "rgba");
  const j = (await imgmeta({ b64: b64(JPEG) })).body; assert.equal(j.format, "jpeg"); assert.equal(j.width, 1920); assert.equal(j.height, 1080);
  assert.equal(j.exif.Make, "Canon"); assert.equal(j.exif.Orientation, 6); assert.deepEqual(j.exif.gps, { lat: 51.5, lon: -0.1, alt_m: null }); assert.match(j.privacy_warning, /GPS/); assert.equal(j.display.width, 1080);
  assert.equal(probeImage(cat("GIF89a", u16le(10), u16le(20), [0, 0, 0])).width, 10);
  const wl = probeImage(cat("RIFF", u32le(30), "WEBPVP8L", u32le(10), [0x2f], u32le((99) | (49 << 14)), [0, 0, 0])); assert.equal(wl.width, 100); assert.equal(wl.height, 50);
  assert.equal((await imgmeta({ b64: b64(cat("hello world, not an image")) })).body.valid, false);
  assert.equal((await imgmeta({})).status, 400); assert.equal((await imgmeta({ url: "http://127.0.0.1/x.png" })).status, 400); assert.equal((await imgmeta({ url: "https://metadata.google.internal/" })).status, 400);
  assert.throws(() => parseExif(cat("XX")));
});
test("avmeta: WAV, MP4 (mvhd/tkhd/hdlr/stsd), MP3 Xing, FLAC", async () => {
  const w = (await avmeta({ b64: b64(WAV) })).body; assert.equal(w.format, "wav"); assert.equal(w.duration_s, 1); assert.equal(w.channels, 2); assert.equal(w.codec, "PCM"); assert.equal(w.duration_hms, "00:00:01.000");
  const m = (await avmeta({ b64: b64(MP4) })).body; assert.equal(m.duration_s, 10); assert.equal(m.width, 1280); assert.equal(m.height, 720); assert.equal(m.video_codec, "H.264/AVC");
  const a = probeAV(MP3, MP3.length); assert.equal(a.codec, "MPEG-1 Layer III"); assert.equal(a.sample_rate, 44100); assert.equal(a.duration_s, +(100 * 1152 / 44100).toFixed(3)); assert.equal(a.vbr, true);
  const f = probeAV(cat("fLaC", [0, 0, 0, 34], new Array(10).fill(0), [0x0a, 0xc4, 0x42, 0xf0], u32be(88200), new Array(16).fill(0))); assert.equal(f.sample_rate, 44100); assert.equal(f.duration_s, 2); assert.equal(f.channels, 2);
  assert.equal((await avmeta({ b64: b64(cat("nothing to see here")) })).body.valid, false); assert.equal((await avmeta({ url: "http://10.0.0.1/a.mp4" })).status, 400);
});
test("avmeta/imgmeta URL fetch: redirect to private IP blocked, size cap, content-range total", async () => {
  const orig = globalThis.fetch; try {
    globalThis.fetch = async (u) => new Response(null, { status: 302, headers: { location: "http://192.168.1.1/x" } });
    assert.equal((await imgmeta({ url: "https://example.com/a.png" })).status, 400);
    globalThis.fetch = async (u, init) => { assert.match(init.headers.range, /^bytes=0-/); return new Response(WAV, { status: 206, headers: { "content-range": "bytes 0-1/999999", "content-type": "audio/wav" } }); };
    const r = (await avmeta({ url: "https://example.com/a.wav" })).body; assert.equal(r.total_bytes, 999999); assert.equal(r.content_type, "audio/wav"); assert.equal(r.duration_s, 1);
  } finally { globalThis.fetch = orig; }
});
test("qr encode: known version/size, EC levels, long text, errors", async () => {
  const q = qrEncode("HELLO WORLD", "M"); assert.equal(q.version, 1); assert.equal(q.size, 21);
  // finder pattern corners
  for (const [x, y] of [[0, 0], [20, 0], [0, 20]]) assert.equal(q.modules[y][x], true); assert.equal(q.modules[13][8], true); // dark module
  assert.equal(qrEncode("x".repeat(1200), "L").version, 25); assert.equal(qrEncode("x".repeat(150), "H").size, 4 * qrEncode("x".repeat(150), "H").version + 17);
  const r = (await qr({ text: "https://example.com", ecl: "q", matrix: "true" })).body; assert.match(r.svg, /^<svg/); assert.equal(r.matrix.length, r.size); assert.equal(r.ecl, "Q"); assert.match(r.svg_data_uri, /^data:image\/svg\+xml;base64,/);
  assert.equal((await qr({})).status, 400); assert.equal((await qr({ text: "a", ecl: "Z" })).status, 400); assert.equal((await qr({ text: "x".repeat(1201) })).status, 400);
  assert.ok(!(await qr({ text: "<script>" })).body.svg.includes("<script>"));
});
test("/v1/imgmeta /v1/avmeta /v1/qr routes: free 200, paid 402, discovery + MCP", async () => {
  assert.equal((await call("/v1/qr?text=hi"))[1].version, 1);
  assert.equal((await call("/v1/imgmeta", { method: "POST", body: JSON.stringify({ b64: b64(PNG) }) }))[1].width, 640);
  for (const p of ["/v1/imgmeta", "/v1/avmeta", "/v1/qr"]) {
    assert.equal((await call(p + "?text=a", undefined, env(PAID)))[0], 402);
    const [, oa] = await call("/openapi.json", undefined, env(PAID)); assert.ok(oa.paths[p].get["x-payment-info"]);
    const [, wk] = await call("/.well-known/x402", undefined, env(PAID)); assert.ok(JSON.stringify(wk).includes(p));
    const r = await handle(new Request("https://w.test/llms.txt"), env(PAID)); assert.ok((await r.text()).includes(p));
  }
  const m = await handle(new Request("https://w.test/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), env(PAID));
  const tl = JSON.stringify(await m.json()); for (const n of ["image_meta", "av_meta", "qr_encode"]) assert.ok(tl.includes(n));
});
