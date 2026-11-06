// Day-3 fourth SKU: /v1/cronparse — cron expression validate/explain + next N fire times in an IANA timezone (pure compute, zero outbound).
const bad = (m) => ({ status: 400, body: { error: m } });
const MACROS = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
const MON = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"], DOW = ["sun","mon","tue","wed","thu","fri","sat"];
const DOWN = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"], MONN = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SPEC = [["minute", 0, 59], ["hour", 0, 23], ["day_of_month", 1, 31], ["month", 1, 12, MON], ["day_of_week", 0, 7, DOW]];
function field(s, [name, lo, hi, names]) {
  const out = new Set();
  const num = (t) => { t = t.toLowerCase(); if (names) { const i = names.indexOf(t); if (i >= 0) return i + (name === "month" ? 1 : 0); } if (!/^\d+$/.test(t)) throw new Error(`${name}: bad value "${t}"`); const n = Number(t); if (n < lo || n > hi) throw new Error(`${name}: ${n} out of range ${lo}-${hi}`); return n; };
  for (const part of s.split(",")) {
    const [rng, st] = part.split("/"); if (st !== undefined && !/^[1-9]\d*$/.test(st)) throw new Error(`${name}: bad step "${st}"`);
    const step = st ? Number(st) : 1; let a, b;
    if (rng === "*" || rng === "?") { a = lo; b = hi; } else if (rng.includes("-")) { const [x, y] = rng.split("-"); a = num(x); b = num(y); if (a > b) throw new Error(`${name}: range ${a}-${b} reversed`); } else { a = num(rng); b = st ? hi : a; }
    for (let v = a; v <= b; v += step) out.add(name === "day_of_week" && v === 7 ? 0 : v);
  }
  return out;
}
export function parseCron(expr) {
  let e = String(expr || "").trim().replace(/\s+/g, " "); e = MACROS[e.toLowerCase()] || e;
  const f = e.split(" "); if (f.length !== 5) throw new Error("expected 5 fields: minute hour day_of_month month day_of_week (or @hourly/@daily/@weekly/@monthly/@yearly)");
  const sets = f.map((s, i) => field(s, SPEC[i]));
  return { expr: e, fields: f, minute: sets[0], hour: sets[1], dom: sets[2], month: sets[3], dow: sets[4], domStar: f[2] === "*" || f[2] === "?", dowStar: f[4] === "*" || f[4] === "?" };
}
const list = (set, fmt = String) => [...set].sort((a, b) => a - b).map(fmt).join(", ");
export function explain(c) {
  const [m, h] = c.fields; let t;
  if (m === "*" && h === "*") t = "every minute";
  else if (/^\d+$/.test(m) && /^\d+$/.test(h)) t = `at ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  else if (/^\d+$/.test(m) && h === "*") t = `at minute ${m} of every hour`;
  else t = `at minute ${m === "*" ? "every" : list(c.minute)} past hour ${h === "*" ? "every" : list(c.hour)}`;
  const parts = [t];
  if (!c.domStar && !c.dowStar) parts.push(`on day-of-month ${list(c.dom)} or on ${list(c.dow, (d) => DOWN[d])}`);
  else if (!c.domStar) parts.push(`on day-of-month ${list(c.dom)}`);
  else if (!c.dowStar) parts.push(`on ${list(c.dow, (d) => DOWN[d])}`);
  if (c.fields[3] !== "*") parts.push(`in ${list(c.month, (x) => MONN[x - 1])}`);
  return parts.join(" ");
}
function partsIn(fmt, t) { const p = {}; for (const x of fmt.formatToParts(new Date(t))) p[x.type] = x.value; return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, dow: DOW.indexOf(p.weekday.toLowerCase().slice(0, 3)) }; }
export function nextTimes(c, tz, fromMs, n) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" });
  const out = []; let t = Math.floor(fromMs / 60000) * 60000 + 60000, it = 0; const end = fromMs + 5 * 366 * 864e5;
  while (out.length < n && t < end && it++ < 300000) {
    const p = partsIn(fmt, t);
    const dayOk = c.month.has(p.mo) && (c.domStar && c.dowStar ? true : c.domStar ? c.dow.has(p.dow) : c.dowStar ? c.dom.has(p.d) : c.dom.has(p.d) || c.dow.has(p.dow));
    if (!dayOk) { t += (1440 - (p.h * 60 + p.mi)) * 60000; continue; }
    if (!c.hour.has(p.h)) { t += (60 - p.mi) * 60000; continue; }
    if (!c.minute.has(p.mi)) { t += 60000; continue; }
    out.push(t); t += 60000;
  }
  return out.map((ms) => { const p = partsIn(fmt, ms); return { utc: new Date(ms).toISOString(), local: `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}T${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`, unix: ms / 1000 }; });
}
export async function cronparse(a) {
  const expr = a.expr ?? a.cron ?? a.expression; if (!expr) return bad("expr required (5-field cron or @macro)");
  if (String(expr).length > 200) return bad("expr too long");
  const tz = a.tz || a.timezone || "UTC"; try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return bad("invalid IANA timezone: " + tz); }
  const n = Math.max(1, Math.min(50, Number(a.count ?? a.n ?? 5) || 5));
  let from = Date.now(); if (a.from !== undefined && a.from !== "") { from = /^\d+(\.\d+)?$/.test(String(a.from)) ? Number(a.from) * 1000 : Date.parse(a.from); if (!Number.isFinite(from)) return bad("from must be ISO 8601 or unix seconds"); }
  let c; try { c = parseCron(expr); } catch (e) { return { status: 200, body: { valid: false, expr: String(expr), error: e.message } }; }
  const next = nextTimes(c, tz, from, n);
  return { status: 200, body: { valid: true, expr: c.expr, timezone: tz, description: explain(c), fields: { minute: [...c.minute].sort((x, y) => x - y), hour: [...c.hour].sort((x, y) => x - y), day_of_month: [...c.dom].sort((x, y) => x - y), month: [...c.month].sort((x, y) => x - y), day_of_week: [...c.dow].sort((x, y) => x - y) }, day_match: !c.domStar && !c.dowStar ? "OR (both day fields restricted, Vixie semantics)" : "AND", from: new Date(from).toISOString(), next, ...(next.length < n ? { note: "fewer matches than requested within 5 years" } : {}) } };
}
