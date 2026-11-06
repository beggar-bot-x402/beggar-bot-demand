# usage: python3 scripts/wire_pack.py <module> <spec.json>  (anchors on packb14 entries)
import json,sys
mod,spec=sys.argv[1],json.load(open(sys.argv[2]))
P=list(spec); fns=[spec[p]["fn"] for p in P]
def edit(f,fn):
    s=open(f).read(); s2=fn(s); assert s2!=s,f; open(f,"w").write(s2)
def ins(s,anchor,text):
    i=s.index(anchor); return s[:i]+text+s[i:]
q=lambda d:json.dumps(d)
def idx(s):
    s=ins(s,'import { blockbytime','import { %s } from "./%s.js";\n'%(", ".join(fns),mod))
    blk='    else if (%s.includes(url.pathname) && (req.method === "GET" || req.method === "POST")) {\n      let a = Object.fromEntries(url.searchParams);\n      if (req.method === "POST") { let b = null; try { b = await req.json(); } catch {} if (b && typeof b === "object") a = { ...a, ...b }; }\n      const o = await ({ %s })[url.pathname](a); res = J(o.body, o.status);\n    }\n'%(q(P),", ".join('"%s": %s'%(p,spec[p]["fn"]) for p in P))
    return ins(s,'    else if (["/v1/blockbytime"',blk)
edit("src/index.js",idx)
def x4(s):
    t="".join('  "%s": { description: %s, tags: %s,\n    input: { type: "http", method: "GET", discoverable: true, queryParams: { %s } },\n    output: { type: "object" } },\n'%(p,q(spec[p]["d"]),q(spec[p]["t"]),", ".join('%s: S("string", %s)'%(k,q(v)) for k,v in spec[p]["p"].items())) for p in P)
    s=ins(s,'  "/v1/blockbytime": { description',t)
    s=ins(s,'  "/v1/blockbytime": {"time"',"".join('  "%s": %s,\n'%(p,q(spec[p]["e"])) for p in P))
    return s.replace('new Set(["/v1/verify", ','new Set(["/v1/verify", '+"".join(q(p)+", " for p in P),1)
edit("src/x402.js",x4)
edit("src/manifests.js",lambda s:ins(s,'  "/v1/blockbytime": { method',"".join('  "%s": { method: "GET", alsoPost: true, description: %s, params: %s },\n'%(p,q(spec[p]["d"]),q([k+"?" for k in spec[p]["p"]])) for p in P)))
edit("src/mcp.js",lambda s:ins(s,'  { name: "block_by_time"',"".join('  { name: "%s", path: "%s", method: "GET", description: %s,\n    props: %s, required: [] },\n'%(spec[p]["mcp"],p,q(spec[p]["d"][:200]),q(spec[p]["p"])) for p in P)))
print("wired",mod)
