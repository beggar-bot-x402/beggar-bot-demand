// pack14: geocode, airquality, quakes, suntimes — open-meteo, OSM Nominatim, USGS (keyless)
const R = (status, body) => ({ status, body });
const gj = async (u) => { const r = await fetch(u, { headers: { accept: "application/json", "user-agent": "BeggarBot/1.0 (beggarbot@mail.grokbot.com)" }, signal: AbortSignal.timeout(12000) }); if (!r.ok) throw new Error("upstream " + r.status); return r.json(); };
const fail = (e) => R(502, { error: String(e.message || e).slice(0, 200) });
const num = (v) => (v === undefined || v === null || v === "" ? NaN : Number(v));
async function where(a) {
  const lat = num(a.lat), lon = num(a.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) { if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null; return { lat, lon, name: null }; }
  const q = String(a.place || a.q || "").trim(); if (!q) return null;
  const d = await gj("https://geocoding-api.open-meteo.com/v1/search?count=1&name=" + encodeURIComponent(q)); const g = d.results?.[0]; if (!g) return { notfound: q };
  return { lat: g.latitude, lon: g.longitude, name: [g.name, g.admin1, g.country].filter(Boolean).join(", "), timezone: g.timezone };
}

export async function geocode(a) {
  const q = String(a.q || a.place || "").trim(); const lat = num(a.lat), lon = num(a.lon);
  try {
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const d = await gj(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${lat}&lon=${lon}`);
      if (d.error) return R(404, { error: d.error });
      return R(200, { mode: "reverse", lat, lon, display_name: d.display_name, address: d.address, osm: { type: d.osm_type, id: d.osm_id }, attribution: "© OpenStreetMap contributors" });
    }
    if (!q) return R(400, { error: "q (place/address) or lat+lon required" });
    const n = Math.max(1, Math.min(10, parseInt(a.limit || "5", 10) || 5));
    const d = await gj(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=${n}&q=${encodeURIComponent(q)}`);
    return R(200, { mode: "forward", query: q, count: d.length, results: d.map((r) => ({ display_name: r.display_name, lat: +r.lat, lon: +r.lon, type: r.type, category: r.category, importance: r.importance, country_code: r.address?.country_code?.toUpperCase() || null, postcode: r.address?.postcode || null, bbox: r.boundingbox?.map(Number) })), attribution: "© OpenStreetMap contributors" });
  } catch (e) { return fail(e); }
}

const AQI = [[50, "good"], [100, "moderate"], [150, "unhealthy for sensitive groups"], [200, "unhealthy"], [300, "very unhealthy"], [1e9, "hazardous"]];
export async function airquality(a) {
  try {
    const w = await where(a); if (!w) return R(400, { error: "place or lat+lon required" }); if (w.notfound) return R(404, { error: "place not found", place: w.notfound });
    const d = await gj(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${w.lat}&longitude=${w.lon}&timezone=auto&current=us_aqi,european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,carbon_monoxide,uv_index&hourly=us_aqi&forecast_days=2`);
    const c = d.current; const cat = AQI.find(([m]) => c.us_aqi <= m)[1];
    const now = d.hourly.time.findIndex((t) => t >= c.time); const next = d.hourly.us_aqi.slice(Math.max(0, now), now + 24).filter((x) => x !== null);
    return R(200, { place: w.name, lat: w.lat, lon: w.lon, time: c.time, timezone: d.timezone, us_aqi: c.us_aqi, category: cat, european_aqi: c.european_aqi, uv_index: c.uv_index,
      pollutants_ugm3: { pm2_5: c.pm2_5, pm10: c.pm10, ozone: c.ozone, no2: c.nitrogen_dioxide, so2: c.sulphur_dioxide, co: c.carbon_monoxide },
      next_24h: next.length ? { max_us_aqi: Math.max(...next), min_us_aqi: Math.min(...next) } : null, advice: c.us_aqi > 100 ? "limit prolonged outdoor exertion" : "air quality acceptable for outdoor activity" });
  } catch (e) { return fail(e); }
}

const hav = (a1, o1, a2, o2) => { const r = Math.PI / 180, x = Math.sin((a2 - a1) * r / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin((o2 - o1) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
export async function quakes(a) {
  const minmag = Math.max(0, Math.min(9, parseFloat(a.min_mag || "4.5") || 4.5)); const days = Math.max(1, Math.min(30, parseInt(a.days || "7", 10) || 7)); const radius = Math.max(10, Math.min(5000, parseFloat(a.radius_km || "500") || 500));
  try {
    let geo = ""; let w = null;
    if (a.place || a.lat !== undefined) { w = await where(a); if (!w) return R(400, { error: "bad lat/lon" }); if (w.notfound) return R(404, { error: "place not found", place: w.notfound }); geo = `&latitude=${w.lat}&longitude=${w.lon}&maxradiuskm=${radius}`; }
    const start = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
    const d = await gj(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=magnitude&limit=50&starttime=${start}&minmagnitude=${minmag}${geo}`);
    const ev = d.features.map((f) => ({ magnitude: f.properties.mag, place: f.properties.place, time: new Date(f.properties.time).toISOString(), depth_km: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], tsunami: !!f.properties.tsunami, alert: f.properties.alert, felt: f.properties.felt, distance_km: w ? Math.round(hav(w.lat, w.lon, f.geometry.coordinates[1], f.geometry.coordinates[0])) : undefined, url: f.properties.url }));
    return R(200, { center: w ? { place: w.name, lat: w.lat, lon: w.lon, radius_km: radius } : "global", days, min_magnitude: minmag, count: ev.length, strongest: ev[0] || null, tsunami_flags: ev.filter((e) => e.tsunami).length, events: ev.slice(0, Math.min(50, parseInt(a.limit || "20", 10) || 20)) });
  } catch (e) { return fail(e); }
}

export async function suntimes(a) {
  const days = Math.max(1, Math.min(16, parseInt(a.days || "3", 10) || 3));
  try {
    const w = await where(a); if (!w) return R(400, { error: "place or lat+lon required" }); if (w.notfound) return R(404, { error: "place not found", place: w.notfound });
    const d = await gj(`https://api.open-meteo.com/v1/forecast?latitude=${w.lat}&longitude=${w.lon}&timezone=auto&forecast_days=${days}&daily=sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max`);
    const D = d.daily; const fmt = (s) => `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, "0")}m`;
    return R(200, { place: w.name, lat: w.lat, lon: w.lon, timezone: d.timezone, utc_offset_s: d.utc_offset_seconds,
      days: D.time.map((t, i) => ({ date: t, sunrise: D.sunrise[i], sunset: D.sunset[i], daylight: fmt(D.daylight_duration[i]), daylight_s: Math.round(D.daylight_duration[i]), sunshine_s: Math.round(D.sunshine_duration[i] || 0), uv_index_max: D.uv_index_max[i] })),
      daylight_trend_s_per_day: D.time.length > 1 ? Math.round((D.daylight_duration.at(-1) - D.daylight_duration[0]) / (D.time.length - 1)) : null });
  } catch (e) { return fail(e); }
}
