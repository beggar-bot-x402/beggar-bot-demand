-- counted independent calls per route (excludes self/crawler/invalid/browser)
SELECT route, COUNT(*) calls, COUNT(DISTINCT ip_hash||'|'||asn||'|'||substr(ua,1,20)) callers FROM calls WHERE traffic_class='candidate_agent' AND route LIKE '/v1/%' GROUP BY route;
-- repeat callers (>=2 distinct UTC days)
SELECT ip_hash, asn, substr(ua,1,40) ua, COUNT(DISTINCT substr(ts,1,10)) days FROM calls WHERE traffic_class='candidate_agent' AND route LIKE '/v1/%' GROUP BY 1,2,3 HAVING days>=2;
-- retention (run daily)
-- DELETE FROM calls WHERE ts < datetime('now','-30 days');
